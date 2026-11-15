// Rewrite step: one story group -> Claude Haiku -> validated card.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { urlHash } from './filter.js';
import { validateCard, countWords } from './validate.js';

export const SYSTEM_PROMPT = readFileSync(fileURLToPath(new URL('./prompt.txt', import.meta.url)), 'utf8');

// What the model returns. Structured outputs guarantee this shape; word limits are checked afterwards.
export const AI_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tldr', 'why_it_matters', 'category', 'relevance', 'game_name', 'confidence'],
  properties: {
    tldr: { type: 'string' },
    why_it_matters: { type: 'string' },
    category: { type: 'string', enum: ['release', 'hardware', 'industry', 'out_of_scope'] },
    relevance: { type: 'integer', enum: [1, 2, 3, 4, 5] },
    game_name: { type: ['string', 'null'] },
    confidence: { type: 'string', enum: ['high', 'low'] },
  },
};

/** A "group" is an array of normalised items about one story (Phase 3 dedupe; one item each until then). */
export function primaryOf(group) {
  return [...group].sort((a, b) => a.priority - b.priority || a.published_at.localeCompare(b.published_at))[0];
}

export function buildUserMessage(group) {
  return group
    .map((it, i) => `Source ${i + 1} (${it.outlet}, ${it.published_at})\nTitle: ${it.title}\nSummary: ${it.summary || '(none)'}`)
    .join('\n\n');
}

class OutputError extends Error {}

/** One API call. Returns the parsed AI object or throws. */
async function callModel(client, model, group) {
  const res = await client.messages.create({
    model,
    max_tokens: 400,
    // Thinking off and low effort: short, deterministic-ish rewriting, and the 400-token cap stays for the answer.
    thinking: { type: 'disabled' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_OUTPUT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(group) }],
  });
  if (res.stop_reason !== 'end_turn') throw new OutputError(`stop_reason ${res.stop_reason}`);
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new OutputError('no text block');
  const out = JSON.parse(text); // throws SyntaxError on invalid JSON
  if (countWords(out.tldr) > 20 || countWords(out.why_it_matters) > 30) throw new OutputError('word limit exceeded');
  return { out, usage: res.usage };
}

/**
 * Rewrite one group. Retries once on any failure, then gives up (returns status "failed": caller must NOT mark seen).
 * @returns {{ status: 'card'|'rejected'|'failed', card?, ai?, reason?, usage? }}
 */
export async function rewriteGroup(group, { client, model, relevanceThreshold = 2, now = Date.now() } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { out, usage } = await callModel(client, model, group);
      if (out.category === 'out_of_scope') return { status: 'rejected', reason: 'out_of_scope', ai: out, usage };
      if (out.relevance < relevanceThreshold) return { status: 'rejected', reason: `relevance ${out.relevance}`, ai: out, usage };
      const p = primaryOf(group);
      const card = {
        id: urlHash(p.url),
        category: out.category,
        tldr: out.tldr.trim(),
        why_it_matters: out.why_it_matters.trim(),
        relevance: out.relevance,
        confidence: out.confidence,
        game_name: out.game_name?.trim() || null,
        source: { outlet: p.outlet, url: p.url, published_at: p.published_at },
        also_on: group.filter((g) => g !== p).slice(0, 3).map((g) => ({ outlet: g.outlet, url: g.url })),
        image: null,
        created_at: new Date(now).toISOString(),
      };
      const v = validateCard(card);
      if (!v.ok) throw new OutputError(`schema: ${v.errors.join('; ')}`);
      return { status: 'card', card, usage };
    } catch (err) {
      // Auth/permission/bad-request errors won't fix themselves on retry, so stop the whole run loudly.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.BadRequestError) throw err;
      lastErr = err;
    }
  }
  return { status: 'failed', reason: lastErr?.message ?? 'unknown' };
}

/** Rewrite up to maxCalls groups, newest first. */
export async function rewriteAll(groups, { client, model, maxCalls = 25, relevanceThreshold = 2, log = console } = {}) {
  const ordered = [...groups].sort((a, b) => primaryOf(b).published_at.localeCompare(primaryOf(a).published_at)).slice(0, maxCalls);
  const results = [];
  for (const g of ordered) {
    const r = await rewriteGroup(g, { client, model, relevanceThreshold });
    if (r.status === 'failed') log.warn(`WARN AI failed for "${primaryOf(g).title}": ${r.reason}`);
    results.push({ group: g, ...r });
  }
  return results;
}
