// Full pipeline: fetch -> filter -> dedupe -> rewrite -> scope check -> Steam art -> publish. `npm start`.
import Anthropic from '@anthropic-ai/sdk';
import { readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig, fetchAll } from './fetch.js';
import { filterItems, loadSeen, markSeen, saveJson } from './filter.js';
import { dedupe } from './dedupe.js';
import { rewriteAll } from './rewrite.js';
import { createSteamMatcher, loadSteamCache, saveSteamCache } from './steam.js';
import { loadCards, publish } from './publish.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const P = (f) => resolve(ROOT, f);

if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error('ANTHROPIC_API_KEY is not set (GitHub: repo Settings > Secrets and variables > Actions).');
  process.exit(1);
}

const { config, hidden } = await loadConfig(ROOT);
const seen = await loadSeen(P('state/seen.json'));
let feedCache = {};
try { feedCache = JSON.parse(await readFile(P('state/feed-cache.json'), 'utf8')); } catch {}

// 1-2. Fetch and normalise
const { items, report, feedCache: newFeedCache } = await fetchAll(config, { feedCache });

// 3. Filter
const { kept, dropped } = filterItems(items, {
  maxAgeHours: config.fetch?.max_age_hours ?? 48,
  seen: new Set(Object.keys(seen)),
  hidden: new Set(hidden),
  denylist: config.denylist,
});

// 4. Dedupe
const groups = dedupe(kept, {
  threshold: config.dedupe?.jaccard ?? 0.6,
  overlap: config.dedupe?.overlap ?? 0.6,
  minShared: config.dedupe?.min_shared ?? 3,
  windowHours: config.dedupe?.window_hours ?? 24,
});

// 5-6. Rewrite and scope check
const results = await rewriteAll(groups, {
  client: new Anthropic(),
  model: config.ai.model,
  maxCalls: config.ai.max_calls_per_run ?? 25,
  relevanceThreshold: config.ai.relevance_threshold ?? 2,
});

// Cards and rejected stories are paid for: mark every URL in their group as seen. Failed ones retry next run.
markSeen(seen, results.filter((r) => r.status !== 'failed').flatMap((r) => r.group.map((i) => i.url)));
const fresh = results.filter((r) => r.status === 'card').map((r) => r.card);

// 7. Steam art
const steam = createSteamMatcher({
  cache: await loadSteamCache(P('state/steam-cache.json')),
  userAgent: `PRESS-START-NewsBot/1.0 (+${config.site_url})`,
  delayMs: (config.steam?.delay_seconds ?? 1.5) * 1000,
  cacheDays: config.steam?.cache_days ?? 30,
});
for (const c of fresh) await steam.addArt(c);

// 8. Publish
const priority = Object.fromEntries(config.feeds.map((f) => [f.outlet, f.priority]));
const pub = await publish(P('docs/cards.json'), await loadCards(P('docs/cards.json')), fresh, {
  hidden: new Set(hidden),
  maxDays: config.archive?.max_days ?? 7,
  maxCards: config.archive?.max_cards ?? 60,
  priorityOf: (o) => priority[o] ?? 9,
});

await saveJson(P('state/seen.json'), seen);
await saveJson(P('state/feed-cache.json'), newFeedCache);
await saveSteamCache(P('state/steam-cache.json'), steam.cache);

const count = (s) => results.filter((r) => r.status === s).length;
const okFeeds = report.filter((r) => r.ok).length;
const failedFeeds = report.filter((r) => !r.ok).map((r) => r.outlet);
const tokens = results.reduce((t, r) => [t[0] + (r.usage?.input_tokens ?? 0), t[1] + (r.usage?.output_tokens ?? 0)], [0, 0]);
console.log(
  `RUN feeds ${okFeeds}/${report.length} ok${failedFeeds.length ? ` (failed: ${failedFeeds.join(', ')})` : ''}` +
  ` | items ${items.length} | filtered ${dropped.age + dropped.seen + dropped.hidden + dropped.denylist} (age ${dropped.age}, seen ${dropped.seen}, hidden ${dropped.hidden}, deny ${dropped.denylist})` +
  ` | stories ${groups.length} | AI calls ${results.length} (cards ${count('card')}, hidden ${count('rejected')}, failed ${count('failed')}, tokens ${tokens[0]}/${tokens[1]})` +
  ` | steam ${steam.stats.matches}/${steam.stats.lookups}` +
  ` | published ${pub.written ? `${pub.cards.length} cards, +${pub.added}` : `NO (validation failed, kept last good file): ${pub.errors.slice(0, 3).join('; ')}`}`,
);

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `added=${pub.written ? pub.added : 0}\n`);
if (!pub.written) process.exitCode = 1;
