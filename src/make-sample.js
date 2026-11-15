// `npm run sample`: build docs/sample-cards.json from tmp/items.json for layout previews. No AI calls.
// Headlines, links and Steam art are real; the summary text is a placeholder, so nobody mistakes it for a real card.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './fetch.js';
import { dedupe } from './dedupe.js';
import { urlHash, saveJson } from './filter.js';
import { createSteamMatcher, loadSteamCache, saveSteamCache } from './steam.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const { config } = await loadConfig(ROOT);
const { items } = JSON.parse(await readFile(resolve(ROOT, 'tmp/items.json'), 'utf8'));
const groups = dedupe(items, { threshold: config.dedupe?.jaccard ?? 0.6, overlap: config.dedupe?.overlap ?? 0.6, minShared: config.dedupe?.min_shared ?? 3 })
  .sort((a, b) => b.length - a.length || b[0].published_at.localeCompare(a[0].published_at))
  .slice(0, 36);

// Game names to try on Steam (stand-in for the AI's game_name).
const GAMES = (process.argv.slice(2).length ? process.argv.slice(2) : ['Slay the Spire 2', 'Super Meat Boy', 'Crimson Desert', "No Man's Sky", 'The Blood of Dawnwalker', 'Arc Raiders', 'The Finals', 'Hell Let Loose']);
const cachePath = resolve(ROOT, 'state/steam-cache.json');
const steam = createSteamMatcher({ cache: await loadSteamCache(cachePath) });
const cats = ['release', 'hardware', 'industry'];

const cards = [];
for (const [n, g] of groups.entries()) {
  const p = g[0];
  const words = p.title.split(/\s+/);
  const game = GAMES.find((name) => p.title.toLowerCase().includes(name.toLowerCase())) || null;
  const card = {
    id: urlHash(p.url),
    category: cats[n % 3],
    tldr: words.slice(0, 20).join(' ') + (words.length > 20 ? '...' : ''),
    why_it_matters: 'Sample card for the layout preview. The real card puts a short AI summary of why this matters to players here.',
    relevance: 3,
    confidence: n % 7 === 3 ? 'low' : 'high',
    game_name: game,
    source: { outlet: p.outlet, url: p.url, published_at: p.published_at },
    also_on: g.slice(1, 4).map((x) => ({ outlet: x.outlet, url: x.url })),
    image: null,
    created_at: new Date().toISOString(),
  };
  if (game) await steam.addArt(card);
  cards.push(card);
}
await saveSteamCache(cachePath, steam.cache);
await saveJson(resolve(ROOT, 'docs/sample-cards.json'), { generated_at: new Date().toISOString(), version: 1, sample: true, cards });
console.log(`docs/sample-cards.json: ${cards.length} cards, ${cards.filter((c) => c.image).length} with Steam art, ${cards.filter((c) => c.also_on.length).length} with "Also on" links`);
