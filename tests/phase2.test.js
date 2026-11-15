// AI calls are mocked: no test spends API credit.
import { describe, it, expect } from 'vitest';
import { rewriteGroup, rewriteAll } from '../src/rewrite.js';
import { validateCard } from '../src/validate.js';

const item = (o = {}) => ({ title: 'Example Shooter 1.0 dated', url: 'https://vgc.example/story', outlet: 'VGC', priority: 2, published_at: '2026-11-14T09:00:00.000Z', summary: 'It launches 4 December.', ...o });

const goodAi = { tldr: 'Example Shooter leaves early access on 4 December.', why_it_matters: 'If you waited for 1.0, look again then.', category: 'release', relevance: 4, game_name: 'Example Shooter', confidence: 'high' };

/** Fake client: returns queued responses (objects become JSON text, strings are sent raw, Errors are thrown). */
function fakeClient(queue) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        const next = queue.shift();
        if (next instanceof Error) throw next;
        const text = typeof next === 'string' ? next : JSON.stringify(next);
        return { stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 900, output_tokens: 120 } };
      },
    },
  };
}

describe('rewriteGroup', () => {
  it('builds a valid card and sends the expected request', async () => {
    const client = fakeClient([goodAi]);
    const r = await rewriteGroup([item()], { client, model: 'm', now: Date.parse('2026-11-14T09:12:00Z') });
    expect(r.status).toBe('card');
    expect(r.card.id).toMatch(/^[0-9a-f]{12}$/);
    expect(r.card.source).toEqual({ outlet: 'VGC', url: 'https://vgc.example/story', published_at: '2026-11-14T09:00:00.000Z' });
    expect(validateCard(r.card).ok).toBe(true);
    const p = client.calls[0];
    expect(p.max_tokens).toBe(400);
    expect(p.output_config.format.type).toBe('json_schema');
    expect(p.system).toContain('PRESS START');
    expect(p.messages[0].content).toContain('Example Shooter 1.0 dated');
  });

  it('uses the highest-priority outlet as primary and the rest as also_on', async () => {
    const group = [item(), item({ outlet: 'Xbox Wire', priority: 1, url: 'https://xbox.example/a' }), item({ outlet: 'Gematsu', url: 'https://gematsu.example/b' })];
    const r = await rewriteGroup(group, { client: fakeClient([goodAi]), model: 'm' });
    expect(r.card.source.outlet).toBe('Xbox Wire');
    expect(r.card.also_on.map((a) => a.outlet)).toEqual(['VGC', 'Gematsu']);
  });

  it('rejects out_of_scope and low relevance (caller marks these seen)', async () => {
    const a = await rewriteGroup([item()], { client: fakeClient([{ ...goodAi, category: 'out_of_scope' }]), model: 'm' });
    const b = await rewriteGroup([item()], { client: fakeClient([{ ...goodAi, relevance: 1 }]), model: 'm' });
    expect(a).toMatchObject({ status: 'rejected', reason: 'out_of_scope' });
    expect(b).toMatchObject({ status: 'rejected', reason: 'relevance 1' });
  });

  it('retries once on invalid JSON, then succeeds', async () => {
    const client = fakeClient(['not json', goodAi]);
    const r = await rewriteGroup([item()], { client, model: 'm' });
    expect(r.status).toBe('card');
    expect(client.calls).toHaveLength(2);
  });

  it('gives up after two failures (caller must not mark seen)', async () => {
    const client = fakeClient([new Error('network'), { ...goodAi, tldr: 'word '.repeat(25) }]);
    const r = await rewriteGroup([item()], { client, model: 'm' });
    expect(r.status).toBe('failed');
    expect(client.calls).toHaveLength(2);
  });
});

describe('rewriteAll', () => {
  it('caps calls and does newest first', async () => {
    const groups = [1, 5, 3].map((h) => [item({ title: `t${h}`, url: `https://ex.com/${h}`, published_at: `2026-11-14T0${h}:00:00.000Z` })]);
    const client = fakeClient([goodAi, goodAi]);
    const res = await rewriteAll(groups, { client, model: 'm', maxCalls: 2 });
    expect(res.map((r) => r.group[0].title)).toEqual(['t5', 't3']);
  });
});

describe('validateCard', () => {
  const base = { id: 'a1b2c3d4e5f6', category: 'release', tldr: 'Short.', why_it_matters: 'Because.', relevance: 3, confidence: 'high', game_name: null, source: { outlet: 'VGC', url: 'https://ex.com', published_at: '2026-11-14T09:00:00Z' }, also_on: [], image: null, created_at: '2026-11-14T09:00:00Z' };
  it('accepts a good card', () => expect(validateCard(base).ok).toBe(true));
  it('rejects a long TL;DR', () => expect(validateCard({ ...base, tldr: 'word '.repeat(21) }).ok).toBe(false));
  it('rejects a missing link', () => expect(validateCard({ ...base, source: { outlet: 'VGC', published_at: base.created_at } }).ok).toBe(false));
});
