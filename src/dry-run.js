// `npm run dry-run`: make up to 10 cards from tmp/items.json and print them. Writes nothing, commits nothing.
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './fetch.js';
import { rewriteAll } from './rewrite.js';
import { dedupe } from './dedupe.js';
import { createSteamMatcher, loadSteamCache, saveSteamCache } from './steam.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const COUNT = Number(process.argv[2]) || 10;

const { config } = await loadConfig(ROOT);
let items;
try {
  ({ items } = JSON.parse(await readFile(resolve(ROOT, 'tmp/items.json'), 'utf8')));
} catch {
  console.error('No tmp/items.json. Run `npm run fetch` first.');
  process.exit(1);
}

const groups = dedupe(items, { threshold: config.dedupe?.jaccard ?? 0.6, overlap: config.dedupe?.overlap ?? 0.6, minShared: config.dedupe?.min_shared ?? 3, windowHours: config.dedupe?.window_hours ?? 24 });
const steamCachePath = resolve(ROOT, 'state/steam-cache.json');
const steam = createSteamMatcher({ cache: await loadSteamCache(steamCachePath), userAgent: `PRESS-START-NewsBot/1.0 (+${config.site_url})` });
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('ANTHROPIC_API_KEY is not set. Set it in this terminal, then run `npm run dry-run` again.');
  process.exit(1);
}
const client = new Anthropic();
console.log(`Dry run: ${Math.min(COUNT, groups.length)} AI calls with ${config.ai.model}. Nothing is written.\n`);

const results = await rewriteAll(groups, { client, model: config.ai.model, maxCalls: COUNT, relevanceThreshold: config.ai.relevance_threshold });

for (const r of results) if (r.status === 'card') await steam.addArt(r.card);
await saveSteamCache(steamCachePath, steam.cache); // the cache is the only file a dry run writes

let inTok = 0, outTok = 0;
for (const r of results) {
  const src = r.group[0];
  inTok += r.usage?.input_tokens ?? 0;
  outTok += r.usage?.output_tokens ?? 0;
  console.log('-'.repeat(72));
  console.log(`SOURCE  ${src.outlet}: ${src.title}\n        ${src.url}`);
  if (r.status === 'card') {
    const c = r.card;
    const label = c.confidence === 'low' ? '  [Early report]' : '';
    console.log(`CARD    ${c.category} | relevance ${c.relevance}${label}${c.game_name ? ` | game: ${c.game_name}` : ''}`);
    console.log(`TL;DR   ${c.tldr}`);
    console.log(`WHY     ${c.why_it_matters}`);
    console.log(`IMAGE   ${c.image ? `${c.image.url} (Steam app ${c.image.steam_appid})` : 'none (text-only)'}`);
    if (c.also_on.length) console.log(`ALSO ON ${c.also_on.map((a) => a.outlet).join(', ')}`);
  } else if (r.status === 'rejected') {
    console.log(`HIDDEN  ${r.reason}  (tldr would be: ${r.ai.tldr})`);
  } else {
    console.log(`FAILED  ${r.reason}`);
  }
}
const cards = results.filter((r) => r.status === 'card').length;
const rejected = results.filter((r) => r.status === 'rejected').length;
const failed = results.filter((r) => r.status === 'failed').length;
console.log('-'.repeat(72));
console.log(`\n${cards} cards, ${rejected} hidden, ${failed} failed | tokens in ${inTok}, out ${outTok} (avg ${Math.round(inTok / results.length)} / ${Math.round(outTok / results.length)} per call)`);
