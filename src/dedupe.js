// Dedupe step: group the same story across outlets.
const STOP = new Set(('a an the and or of to in on for with at by from as is are be been being was were its it this that these those new now out up ' +
  'has have had will would can could after over into vs what who how why when where we ve he she they you i my our your their his her them ' +
  'not no but so if just about all more most some any than then there here get gets got finally really still very').split(' '));

/** Light stemming so "announces", "announced" and "announce" match. */
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w);

export function titleTokens(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/['’]s\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w && !STOP.has(w))
      .map(stem),
  );
}

const sharedCount = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n; };

/**
 * Same story if word overlap (Jaccard) >= jaccard, OR if at least minShared words are shared and they
 * make up >= overlap of the shorter title. The second rule catches short headlines such as
 * "Wolfenstein 3 announced" vs "Xbox announces Wolfenstein 3", which Jaccard alone misses.
 */
export function sameStory(a, b, { jaccard: jMin = 0.6, overlap = 0.6, minShared = 3 } = {}) {
  if (jaccard(a, b) >= jMin) return true;
  const n = sharedCount(a, b);
  return n >= minShared && n / Math.min(a.size, b.size) >= overlap;
}

export function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Group items published within windowHours whose titles have token Jaccard >= threshold.
 * Single-link: an item joins a group if it matches any member. Same-outlet items never merge.
 * Each group is sorted primary first (priority, then earliest).
 */
export function dedupe(items, { threshold = 0.6, overlap = 0.6, minShared = 3, windowHours = 24 } = {}) {
  const rule = { jaccard: threshold, overlap, minShared };
  const win = windowHours * 3600_000;
  const sorted = [...items].sort((a, b) => a.published_at.localeCompare(b.published_at));
  const groups = [];
  for (const it of sorted) {
    const tok = titleTokens(it.title);
    const t = Date.parse(it.published_at);
    const home = groups.find((g) =>
      !g.some((m) => m.outlet === it.outlet) &&
      g.some((m) => Math.abs(t - Date.parse(m.published_at)) <= win && sameStory(tok, m._tok, rule)),
    );
    const entry = { ...it, _tok: tok };
    if (home) home.push(entry); else groups.push([entry]);
  }
  return groups.map((g) =>
    g.map(({ _tok, ...rest }) => rest)
      .sort((a, b) => a.priority - b.priority || a.published_at.localeCompare(b.published_at)),
  );
}
