// Publish step: merge, drop hidden, merge same-game duplicates, sort, trim, validate, write.
import { readFile } from 'node:fs/promises';
import { urlHash, saveJson } from './filter.js';
import { normaliseName } from './steam.js';
import { validateCard } from './validate.js';

export async function loadCards(path) {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    return Array.isArray(data.cards) ? data.cards : [];
  } catch {
    return [];
  }
}

const isHidden = (card, hidden) =>
  hidden.has(card.id) || hidden.has(card.source.url) || hidden.has(urlHash(card.source.url)) ||
  card.also_on.some((a) => hidden.has(a.url));

/**
 * Second dedupe pass on finished cards: same game_name + same category within windowHours = same story.
 * Catches headlines that share too few words for title dedupe (e.g. several Wolfenstein 3 reveal angles).
 * The card from the higher-priority outlet (or the older one) stays; the other becomes an "Also on" link.
 */
export function mergeSameGame(cards, { windowHours = 24, priorityOf = () => 9 } = {}) {
  const win = windowHours * 3600_000;
  const out = [];
  const order = [...cards].sort((a, b) => priorityOf(a.source.outlet) - priorityOf(b.source.outlet) || a.source.published_at.localeCompare(b.source.published_at));
  for (const c of order) {
    const key = c.game_name ? normaliseName(c.game_name) : null;
    const keeper = key && out.find((k) =>
      k.game_name && normaliseName(k.game_name) === key && k.category === c.category &&
      Math.abs(Date.parse(k.source.published_at) - Date.parse(c.source.published_at)) <= win);
    if (!keeper) { out.push(c); continue; }
    const have = new Set([keeper.source.url, ...keeper.also_on.map((a) => a.url)]);
    for (const link of [{ outlet: c.source.outlet, url: c.source.url }, ...c.also_on]) {
      if (keeper.also_on.length < 3 && !have.has(link.url) && link.outlet !== keeper.source.outlet) {
        keeper.also_on.push(link);
        have.add(link.url);
      }
    }
    if (!keeper.image && c.image) keeper.image = c.image;
  }
  return out;
}

/**
 * @returns {{ cards, added, written: boolean, errors: string[] }}
 */
export function buildCards(existing, fresh, { hidden = new Set(), now = Date.now(), maxDays = 7, maxCards = 60, priorityOf } = {}) {
  const byId = new Map();
  for (const c of [...existing, ...fresh]) if (!byId.has(c.id)) byId.set(c.id, c); // existing card wins on id clash
  let cards = [...byId.values()].filter((c) => !isHidden(c, hidden));
  cards = mergeSameGame(cards, { priorityOf });
  const cutoff = now - maxDays * 86400_000;
  cards = cards
    .filter((c) => Date.parse(c.source.published_at) >= cutoff)
    .sort((a, b) => b.source.published_at.localeCompare(a.source.published_at))
    .slice(0, maxCards);
  const errors = cards.flatMap((c) => validateCard(c).errors.map((e) => `${c.id}: ${e}`));
  const freshIds = new Set(fresh.map((c) => c.id));
  return { cards, added: cards.filter((c) => freshIds.has(c.id)).length, errors };
}

/** Writes cards.json only when every card validates; otherwise the last good file stays live. */
export async function publish(path, existing, fresh, opts = {}) {
  const res = buildCards(existing, fresh, opts);
  if (res.errors.length) return { ...res, written: false };
  await saveJson(path, { generated_at: new Date(opts.now ?? Date.now()).toISOString(), version: 1, cards: res.cards });
  return { ...res, written: true };
}
