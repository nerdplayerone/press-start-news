// Fetch + normalise step. Run directly (`npm run fetch`) to write tmp/items.json.
import Parser from 'rss-parser';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import YAML from 'yaml';
import { filterItems, loadSeen, saveJson } from './filter.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const parser = new Parser();

const TRACKING = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|cmpid|icid|ito|ncid|ocid|taid|guccounter|_hsenc|_hsmi|mkt_tok|igshid|yclid|spm|cid)$/i;

/** Canonical URL: https kept, tracking params and hash removed, trailing slash trimmed on bare paths kept as-is. */
export function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    return u.toString();
  } catch {
    return null;
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };

export function htmlToText(html = '') {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|br|div|li|ul|ol|h\d|tr|td|blockquote|figure|figcaption|img)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseItem(raw, feed, { maxSummaryChars = 1500 } = {}) {
  const url = canonicalUrl(raw.link || raw.guid);
  const title = htmlToText(raw.title);
  const t = Date.parse(raw.isoDate || raw.pubDate || '');
  if (!url || !title || !Number.isFinite(t)) return null;
  const summary = htmlToText(raw.contentSnippet || raw.summary || raw.content || raw['content:encoded'] || '').slice(0, maxSummaryChars);
  return { title, url, outlet: feed.outlet, priority: feed.priority, published_at: new Date(t).toISOString(), summary };
}

/**
 * Fetch one feed with timeout, User-Agent and conditional headers.
 * cacheEntry: { etag, last_modified } from the previous run. On 304 the feed is unchanged, so there is nothing new:
 * returns no items. (Stories held back by the AI cap reappear as soon as the feed next changes.)
 */
export async function fetchFeed(feed, { userAgent, timeoutMs = 15000, cacheEntry = {}, fetchImpl = fetch } = {}) {
  const headers = { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8' };
  if (cacheEntry.etag) headers['If-None-Match'] = cacheEntry.etag;
  if (cacheEntry.last_modified) headers['If-Modified-Since'] = cacheEntry.last_modified;
  const res = await fetchImpl(feed.url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (res.status === 304) return { items: [], notModified: true, cache: { etag: cacheEntry.etag, last_modified: cacheEntry.last_modified } };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = await parser.parseString(await res.text());
  const items = (parsed.items || []).map(({ title, link, guid, isoDate, pubDate, contentSnippet, summary }) => ({ title, link, guid, isoDate, pubDate, contentSnippet, summary }));
  return {
    items,
    notModified: false,
    cache: { etag: res.headers.get('etag') || undefined, last_modified: res.headers.get('last-modified') || undefined },
  };
}

export async function loadConfig(root = ROOT) {
  const config = YAML.parse(await readFile(resolve(root, 'config.yml'), 'utf8'));
  let hidden = [];
  try { hidden = YAML.parse(await readFile(resolve(root, 'hidden.yml'), 'utf8'))?.hidden || []; } catch {}
  return { config, hidden };
}

/** Fetch every feed; one failure never stops the run. */
export async function fetchAll(config, { feedCache = {}, log = console } = {}) {
  const userAgent = `PRESS-START-NewsBot/1.0 (+${config.site_url})`;
  const timeoutMs = (config.fetch?.timeout_seconds ?? 15) * 1000;
  const maxSummaryChars = config.fetch?.max_summary_chars ?? 1500;
  const report = [];
  const all = [];
  const newCache = {};
  await Promise.all(config.feeds.map(async (feed) => {
    try {
      const r = await fetchFeed(feed, { userAgent, timeoutMs, cacheEntry: feedCache[feed.url] });
      newCache[feed.url] = r.cache;
      const items = r.items.map((i) => normaliseItem(i, feed, { maxSummaryChars })).filter(Boolean);
      all.push(...items);
      report.push({ outlet: feed.outlet, ok: true, items: items.length, notModified: r.notModified });
    } catch (err) {
      if (feedCache[feed.url]) newCache[feed.url] = feedCache[feed.url];
      log.warn(`WARN feed failed: ${feed.outlet} (${feed.url}): ${err.message}`);
      report.push({ outlet: feed.outlet, ok: false, items: 0, error: err.message });
    }
  }));
  report.sort((a, b) => config.feeds.findIndex((f) => f.outlet === a.outlet) - config.feeds.findIndex((f) => f.outlet === b.outlet));
  return { items: all, report, feedCache: newCache };
}

async function main() {
  const { config, hidden } = await loadConfig();
  const seenPath = resolve(ROOT, 'state/seen.json');
  const feedCachePath = resolve(ROOT, 'state/feed-cache.json');
  const seen = await loadSeen(seenPath);
  let feedCache = {};
  try { feedCache = JSON.parse(await readFile(feedCachePath, 'utf8')); } catch {}

  const { items, report, feedCache: newCache } = await fetchAll(config, { feedCache });
  const { kept, dropped } = filterItems(items, {
    maxAgeHours: config.fetch?.max_age_hours ?? 48,
    seen: new Set(Object.keys(seen)),
    hidden: new Set(hidden),
    denylist: config.denylist,
  });
  kept.sort((a, b) => b.published_at.localeCompare(a.published_at));

  await saveJson(resolve(ROOT, 'tmp/items.json'), { generated_at: new Date().toISOString(), count: kept.length, items: kept });
  await saveJson(feedCachePath, newCache);
  // seen.json is only written by later phases (after the AI step); make sure it exists.
  await saveJson(seenPath, seen);

  const perOutlet = Object.fromEntries(report.map((r) => [r.outlet, 0]));
  for (const k of kept) perOutlet[k.outlet]++;
  console.log('\nFeed                Status  Fetched  Kept');
  for (const r of report) {
    const status = r.ok ? (r.notModified ? '304' : 'OK') : 'FAIL';
    console.log(`${r.outlet.padEnd(20)}${status.padEnd(8)}${String(r.items).padStart(7)}${String(perOutlet[r.outlet]).padStart(6)}${r.ok ? '' : '  ' + r.error}`);
  }
  const ok = report.filter((r) => r.ok).length;
  console.log(`\nfeeds ${ok}/${report.length} ok | found ${items.length} | dropped age ${dropped.age}, seen ${dropped.seen}, hidden ${dropped.hidden}, denylist ${dropped.denylist} | kept ${kept.length} -> tmp/items.json`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
