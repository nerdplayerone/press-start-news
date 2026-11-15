import { describe, it, expect } from 'vitest';
import { canonicalUrl, htmlToText, normaliseItem, fetchFeed } from '../src/fetch.js';
import { filterItems, urlHash, markSeen } from '../src/filter.js';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600_000).toISOString();
const item = (title, h = 1, url = `https://ex.com/${encodeURIComponent(title)}`) => ({ title, url, outlet: 'X', priority: 2, published_at: hoursAgo(h), summary: '' });

describe('canonicalUrl', () => {
  it('removes utm and tracking params and the hash', () => {
    expect(canonicalUrl('https://WWW.Ex.com/a?utm_source=rss&utm_medium=feed&id=7&fbclid=z#top')).toBe('https://www.ex.com/a?id=7');
  });
  it('returns null for junk', () => expect(canonicalUrl('not a url')).toBeNull());
});

describe('normalise', () => {
  it('strips HTML and entities, caps summary length, outputs UTC ISO', () => {
    expect(htmlToText('<p>Hi &amp; <b>bye</b>&#39;s</p>')).toBe("Hi & bye's");
    const n = normaliseItem({ title: 'T', link: 'https://ex.com/x?utm_campaign=1', pubDate: 'Sat, 14 Nov 2026 10:00:00 +0100', contentSnippet: 'a'.repeat(2000) }, { outlet: 'VGC', priority: 2 });
    expect(n.url).toBe('https://ex.com/x');
    expect(n.published_at).toBe('2026-11-14T09:00:00.000Z');
    expect(n.summary).toHaveLength(1500);
  });
  it('drops items without a date or link', () => {
    expect(normaliseItem({ title: 'T', link: 'https://ex.com' }, { outlet: 'A' })).toBeNull();
  });
});

describe('filterItems', () => {
  const denylist = ['deal', '% off', 'sale', 'best * deals', 'guide', 'how to', 'codes'];
  it('drops old, denylisted, seen and hidden items', () => {
    const seenItem = item('Seen story');
    const hiddenItem = item('Hidden story');
    const { kept, dropped } = filterItems([
      item('New console revealed'),
      item('Old news', 50),
      item('Best Black Friday controller deals'),
      item('Game is 50% off this weekend'),
      item('How to beat the boss'),
      item('Fortnite codes for November'),
      item('Steam Autumn Sale starts'),
      seenItem,
      hiddenItem,
    ], { now: NOW, seen: new Set([urlHash(seenItem.url)]), hidden: new Set([hiddenItem.url]), denylist });
    expect(kept.map((k) => k.title)).toEqual(['New console revealed']);
    expect(dropped).toEqual({ age: 1, seen: 1, hidden: 1, denylist: 5 });
  });
  it('matches whole words only, so "Salem" or "ideal" survive', () => {
    const { kept } = filterItems([item('Salem horror game dated'), item('An ideal sequel announced')], { now: NOW, denylist });
    expect(kept).toHaveLength(2);
  });
});

describe('markSeen', () => {
  it('adds hashes and prunes old ones', () => {
    const s = markSeen({ old: hoursAgo(24 * 30) }, ['https://ex.com/a'], { now: NOW });
    expect(Object.keys(s)).toEqual([urlHash('https://ex.com/a')]);
  });
});

describe('fetchFeed', () => {
  it('sends User-Agent and conditional headers, reuses cache on 304', async () => {
    let sent;
    const fakeFetch = async (_url, opts) => { sent = opts.headers; return new Response(null, { status: 304 }); };
    const r = await fetchFeed({ url: 'https://ex.com/feed' }, { userAgent: 'UA', fetchImpl: fakeFetch, cacheEntry: { etag: '"e1"', items: [{ title: 'cached' }] } });
    expect(sent['User-Agent']).toBe('UA');
    expect(sent['If-None-Match']).toBe('"e1"');
    expect(r.notModified).toBe(true);
    expect(r.items[0].title).toBe('cached');
  });
  it('throws on HTTP errors so the caller can log and continue', async () => {
    const fakeFetch = async () => new Response('nope', { status: 500 });
    await expect(fetchFeed({ url: 'x' }, { userAgent: 'UA', fetchImpl: fakeFetch })).rejects.toThrow('HTTP 500');
  });
});
