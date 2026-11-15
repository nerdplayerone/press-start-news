// `npm run phase3-check [game names...]`: show dedupe groups from tmp/items.json and test Steam matching. No AI calls.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './fetch.js';
import { dedupe } from './dedupe.js';
import { createSteamMatcher, loadSteamCache, saveSteamCache } from './steam.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const { config } = await loadConfig(ROOT);
const { items } = JSON.parse(await readFile(resolve(ROOT, 'tmp/items.json'), 'utf8'));

const groups = dedupe(items, { threshold: config.dedupe?.jaccard ?? 0.6, overlap: config.dedupe?.overlap ?? 0.6, minShared: config.dedupe?.min_shared ?? 3, windowHours: config.dedupe?.window_hours ?? 24 });
const multi = groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
console.log(`DEDUPE  ${items.length} items -> ${groups.length} stories (${multi.length} covered by more than one outlet)\n`);
for (const g of multi) {
  console.log(`  ${g.length} outlets -> 1 card. Primary: ${g[0].outlet}`);
  for (const it of g) console.log(`     ${it.outlet.padEnd(19)} ${it.title}`);
  console.log();
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : [
  'Hades II', 'Elden Ring', 'Cyberpunk 2077', "Baldur's Gate 3", 'Hollow Knight: Silksong', // should match
  'Hades III', 'Grand Theft Auto VI', // sequel number not on Steam / not on Steam: no art
];
const cachePath = resolve(ROOT, 'state/steam-cache.json');
const steam = createSteamMatcher({ cache: await loadSteamCache(cachePath), userAgent: `PRESS-START-NewsBot/1.0 (+${config.site_url})` });
console.log('STEAM');
for (const n of names) {
  const m = await steam.lookup(n);
  console.log(`  ${n.padEnd(26)} ${m ? `${m.name} (app ${m.appid})\n${' '.repeat(29)}${m.image}` : 'no confident match: text-only card'}`);
}
await saveSteamCache(cachePath, steam.cache);
console.log(`\n${steam.stats.matches}/${steam.stats.lookups} matched | ${steam.stats.apiCalls} Steam calls, ${steam.stats.cacheHits} from cache`);
