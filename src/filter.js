// Filter step: age, seen, hidden, denylist. Also owns seen state.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export const urlHash = (url) => createHash('sha1').update(url).digest('hex').slice(0, 12);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Turn denylist entries into regexes. "*" matches any text; word-like ends get word boundaries. */
export function compileDenylist(entries = []) {
  return entries.map((raw) => {
    const e = String(raw).toLowerCase().trim();
    const body = e.split('*').map((p) => escapeRe(p.trim())).join('.*?');
    const start = /^\w/.test(e) ? '\\b' : '';
    const end = /\w$/.test(e) ? '\\b' : '';
    return new RegExp(start + body + end, 'i');
  });
}

/**
 * @param items normalised items
 * @param opts { now, maxAgeHours, seen:Set<hash>, hidden:Set<url|id>, denylist:string[] }
 * @returns { kept, dropped: {age, seen, hidden, denylist} }
 */
export function filterItems(items, { now = Date.now(), maxAgeHours = 48, seen = new Set(), hidden = new Set(), denylist = [] } = {}) {
  const res = compileDenylist(denylist);
  const cutoff = now - maxAgeHours * 3600_000;
  const dropped = { age: 0, seen: 0, hidden: 0, denylist: 0 };
  const kept = [];
  for (const it of items) {
    const t = Date.parse(it.published_at);
    const h = urlHash(it.url);
    if (!Number.isFinite(t) || t < cutoff) dropped.age++;
    else if (seen.has(h)) dropped.seen++;
    else if (hidden.has(it.url) || hidden.has(h)) dropped.hidden++;
    else if (res.some((re) => re.test(it.title))) dropped.denylist++;
    else kept.push(it);
  }
  return { kept, dropped };
}

// ---- seen state: { "<hash>": "<ISO time first seen>" } ----
export async function loadSeen(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}

/** Mark URLs as seen (used from Phase 2, after a card is made or rejected). Prunes entries older than keepDays. */
export function markSeen(seen, urls, { now = Date.now(), keepDays = 14 } = {}) {
  const iso = new Date(now).toISOString();
  for (const u of urls) seen[urlHash(u)] ??= iso;
  const cutoff = now - keepDays * 86400_000;
  for (const [h, t] of Object.entries(seen)) if (Date.parse(t) < cutoff) delete seen[h];
  return seen;
}

export async function saveJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n');
}
