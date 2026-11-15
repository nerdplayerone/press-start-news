import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCards, publish, mergeSameGame } from '../src/publish.js';
import { urlHash } from '../src/filter.js';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const card = (n, o = {}) => {
  const url = o.url ?? `https://ex.com/${n}`;
  return {
    id: urlHash(url), category: 'release', tldr: `Story ${n}.`, why_it_matters: 'Because.', relevance: 3, confidence: 'high',
    game_name: null, source: { outlet: 'VGC', url, published_at: o.at ?? '2026-11-15T09:00:00.000Z' }, also_on: [], image: null,
    created_at: '2026-11-15T09:05:00.000Z', ...o.extra,
  };
};

describe('buildCards', () => {
  it('merges, sorts newest first and trims to the archive limits', () => {
    const old = card('old', { at: '2026-11-01T09:00:00.000Z' });
    const a = card('a', { at: '2026-11-15T08:00:00.000Z' });
    const b = card('b', { at: '2026-11-15T10:00:00.000Z' });
    const c = card('c', { at: '2026-11-14T10:00:00.000Z' });
    const r = buildCards([old, a], [b, c], { now: NOW, maxDays: 7, maxCards: 2 });
    expect(r.cards.map((x) => x.tldr)).toEqual(['Story b.', 'Story a.']);
    expect(r.added).toBe(1);
  });
  it('removes cards listed in hidden.yml by URL or ID', () => {
    const a = card('a'), b = card('b'), c = card('c');
    const r = buildCards([a, b, c], [], { now: NOW, hidden: new Set([a.source.url, b.id]) });
    expect(r.cards.map((x) => x.tldr)).toEqual(['Story c.']);
  });
});

describe('mergeSameGame', () => {
  it('folds same-game, same-category cards within 24h into one, keeping the priority outlet', () => {
    const pri = { 'Xbox Wire': 1, VGC: 2, 'PC Gamer': 3 };
    const g = (n, outlet, at) => card(n, { at, extra: { game_name: 'Wolfenstein 3', source: { outlet, url: `https://${n}.ex/`, published_at: at } } });
    const out = mergeSameGame([
      g('a', 'PC Gamer', '2026-11-15T09:00:00.000Z'),
      g('b', 'Xbox Wire', '2026-11-15T10:00:00.000Z'),
      g('c', 'VGC', '2026-11-15T11:00:00.000Z'),
      card('d', { extra: { game_name: 'Hades II' } }),
    ], { priorityOf: (o) => pri[o] });
    expect(out).toHaveLength(2);
    const wolf = out.find((x) => x.game_name === 'Wolfenstein 3');
    expect(wolf.source.outlet).toBe('Xbox Wire');
    expect(wolf.also_on.map((x) => x.outlet)).toEqual(['VGC', 'PC Gamer']);
  });
  it('keeps same-game cards apart when they are days apart or a different category', () => {
    const out = mergeSameGame([
      card('a', { at: '2026-11-10T09:00:00.000Z', extra: { game_name: 'Hades II' } }),
      card('b', { at: '2026-11-15T09:00:00.000Z', extra: { game_name: 'Hades II' } }),
      card('c', { at: '2026-11-15T09:00:00.000Z', extra: { game_name: 'Hades II', category: 'industry' } }),
    ]);
    expect(out).toHaveLength(3);
  });
});

describe('publish', () => {
  it('writes a good file, and keeps the old cards.json when validation fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ps-'));
    const path = join(dir, 'cards.json');
    const good = await publish(path, [], [card('a')], { now: NOW });
    expect(good.written).toBe(true);
    const before = await readFile(path, 'utf8');
    const bad = await publish(path, [], [card('b', { extra: { tldr: 'word '.repeat(30) } })], { now: NOW });
    expect(bad.written).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(await readFile(path, 'utf8')).toBe(before);
  });
  it('starts from an empty list when cards.json is missing or broken', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ps-'));
    const path = join(dir, 'cards.json');
    await writeFile(path, 'not json');
    const { loadCards } = await import('../src/publish.js');
    expect(await loadCards(path)).toEqual([]);
  });
});
