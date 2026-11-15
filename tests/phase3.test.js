// Steam calls are mocked: tests never hit the network.
import { describe, it, expect } from 'vitest';
import { dedupe } from '../src/dedupe.js';
import { isConfidentMatch, normaliseName, createSteamMatcher } from '../src/steam.js';

const it_ = (outlet, priority, title, hour = 9) => ({ outlet, priority, title, url: `https://${outlet.replace(/\W/g, '')}.example/${encodeURIComponent(title)}`, published_at: `2026-11-14T${String(hour).padStart(2, '0')}:00:00.000Z`, summary: '' });

describe('dedupe', () => {
  it('turns one story from 3 outlets into 1 group with the priority outlet as primary', () => {
    const groups = dedupe([
      it_('Gematsu', 2, 'Wolfenstein 3 announced', 8),
      it_('The Verge', 3, 'Xbox announces Wolfenstein 3', 9),
      it_('Xbox Wire', 1, 'Everything announced today: Wolfenstein 3, Halo Firefight and more', 10),
      it_('PC Gamer', 3, 'Hades II gets a new boss in free update', 9),
    ]);
    expect(groups).toHaveLength(2);
    const wolf = groups.find((g) => g.length === 3);
    expect(wolf[0].outlet).toBe('Xbox Wire');
  });
  it('keeps different stories apart, and never merges two items from one outlet', () => {
    const groups = dedupe([
      it_('Eurogamer', 2, 'What we have been playing this week'),
      it_('Rock Paper Shotgun', 3, 'What are we all playing this weekend?'),
      it_('VGC', 2, 'Wolfenstein 3 confirmed by MachineGames'),
      it_('VGC', 2, 'Wolfenstein 3 confirmed for PS5 by MachineGames'),
    ]);
    expect(groups).toHaveLength(4);
  });
  it('does not merge stories more than 24 hours apart', () => {
    const a = it_('Gematsu', 2, 'Wolfenstein 3 announced');
    const b = { ...it_('The Verge', 3, 'Xbox announces Wolfenstein 3'), published_at: '2026-11-16T09:00:00.000Z' };
    expect(dedupe([a, b])).toHaveLength(2);
  });
});

describe('Steam matcher', () => {
  it('accepts equal or near-equal names', () => {
    expect(isConfidentMatch('Elden Ring', 'ELDEN RING')).toBe(true);
    expect(isConfidentMatch('Baldurs Gate 3', "Baldur's Gate 3")).toBe(true);
    expect(isConfidentMatch('Hades 2', 'Hades II')).toBe(true);
    expect(isConfidentMatch('Cyberpunk 2077', 'Cyberpunk 2077 Ultimate Edition')).toBe(true);
  });
  it('rejects close-but-wrong names', () => {
    expect(isConfidentMatch('Hades III', 'Hades II')).toBe(false);
    expect(isConfidentMatch('Hades II', 'Hades')).toBe(false);
    expect(isConfidentMatch('Doom 2', 'DOOM II: Hell on Earth')).toBe(false);
    expect(isConfidentMatch('Halo Infinite', 'Halo: The Master Chief Collection')).toBe(false);
  });
  it('normalises names', () => expect(normaliseName('The Witcher® III: Wild Hunt')).toBe('witcher 3 wild hunt'));

  const fakeSteam = (searchItems, details) => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      const body = url.includes('storesearch') ? { items: searchItems } : details;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    return { calls, fetchImpl };
  };

  it('adds art on a confident match and caches it', async () => {
    const { calls, fetchImpl } = fakeSteam([{ id: 1145350, name: 'Hades II', type: 'app' }], { 1145350: { success: true, data: { type: 'game', name: 'Hades II', header_image: 'https://cdn.steam/h.jpg' } } });
    const steam = createSteamMatcher({ fetchImpl, delayMs: 0 });
    const card = await steam.addArt({ game_name: 'Hades II' });
    expect(card.image).toEqual({ url: 'https://cdn.steam/h.jpg', steam_appid: 1145350, steam_url: 'https://store.steampowered.com/app/1145350/' });
    await steam.lookup('Hades II');
    expect(calls).toHaveLength(2); // second lookup came from cache
  });
  it('leaves a card text-only for no game, no match, or a Steam error, and caches "no match"', async () => {
    const { calls, fetchImpl } = fakeSteam([{ id: 1, name: 'Hades', type: 'app' }], {});
    const steam = createSteamMatcher({ fetchImpl, delayMs: 0 });
    expect((await steam.addArt({ game_name: null })).image).toBeNull();
    expect((await steam.addArt({ game_name: 'Hades III' })).image).toBeNull();
    await steam.lookup('Hades III');
    expect(calls).toHaveLength(1);
    const broken = createSteamMatcher({ fetchImpl: async () => new Response('', { status: 500 }), delayMs: 0 });
    expect((await broken.addArt({ game_name: 'Elden Ring' }, { warn() {} })).image).toBeNull();
  });
});
