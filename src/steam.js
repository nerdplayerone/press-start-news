// Steam art step: match a game name to a Steam app and get its header image. A wrong image is worse than none.
import { readFile } from 'node:fs/promises';
import { saveJson } from './filter.js';

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const EDITION = /\b(definitive|deluxe|ultimate|complete|goty|game of the year|remastered|enhanced|anniversary|director'?s cut|standard)\s+edition\b/g;

export function normaliseName(name) {
  return String(name)
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(EDITION, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => ROMAN[w] ?? w)
    .filter((w, i) => !(i === 0 && w === 'the'))
    .join(' ');
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function similarity(a, b) {
  const x = normaliseName(a), y = normaliseName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

const numbers = (s) => normaliseName(s).split(' ').filter((w) => /^\d+$/.test(w)).join(',');

/** True only for equal or very close names with the same numbers (no sequel or year mix-ups). */
export function isConfidentMatch(wanted, candidate, min = 0.9) {
  return numbers(wanted) === numbers(candidate) && similarity(wanted, candidate) >= min;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Steam lookup with a cache ({ "<normalised name>": { at, match: {appid,name,image,url} | null } }).
 * opts: { cache, fetchImpl, userAgent, delayMs, now, cacheDays }
 */
export function createSteamMatcher({ cache = {}, fetchImpl = fetch, userAgent = 'PRESS-START-NewsBot/1.0', delayMs = 1500, now = () => Date.now(), cacheDays = 30 } = {}) {
  let lastCall = 0;
  const stats = { lookups: 0, cacheHits: 0, matches: 0, apiCalls: 0 };

  async function getJson(url) {
    const wait = lastCall + delayMs - now();
    if (wait > 0) await sleep(wait);
    lastCall = now();
    stats.apiCalls++;
    const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Steam HTTP ${res.status}`);
    return res.json();
  }

  async function lookup(gameName) {
    if (!gameName) return null;
    stats.lookups++;
    const key = normaliseName(gameName);
    const hit = cache[key];
    if (hit && now() - Date.parse(hit.at) < cacheDays * 86400_000) {
      stats.cacheHits++;
      if (hit.match) stats.matches++;
      return hit.match;
    }
    const search = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&cc=GB&l=english`);
    const cand = (search.items || []).filter((i) => i.type === 'app' || i.type === undefined).find((i) => isConfidentMatch(gameName, i.name));
    let match = null;
    if (cand) {
      const details = await getJson(`https://store.steampowered.com/api/appdetails?appids=${cand.id}`);
      const d = details?.[cand.id];
      if (d?.success && d.data?.header_image && d.data.type === 'game' && isConfidentMatch(gameName, d.data.name)) {
        match = { appid: cand.id, name: d.data.name, image: d.data.header_image, url: `https://store.steampowered.com/app/${cand.id}/` };
      }
    }
    cache[key] = { at: new Date(now()).toISOString(), match };
    if (match) stats.matches++;
    return match;
  }

  /** Adds image to a card in place when there is a confident match. Steam errors leave the card text-only. */
  async function addArt(card, log = console) {
    try {
      const m = await lookup(card.game_name);
      card.image = m ? { url: m.image, steam_appid: m.appid, steam_url: m.url } : null;
    } catch (err) {
      log.warn(`WARN Steam lookup failed for "${card.game_name}": ${err.message}`);
      card.image = null;
    }
    return card;
  }

  return { lookup, addArt, cache, stats };
}

export async function loadSteamCache(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return {}; }
}
export const saveSteamCache = saveJson;
