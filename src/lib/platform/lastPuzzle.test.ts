import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localDate, dailyIdentity, resolvePuzzle, seedIdentity } from './daily.js';
import { lastPuzzleHref, rememberPuzzle } from './lastPuzzle.js';

const origin = 'https://example.com';
let records: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  records = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value)
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('per-game catalog puzzle memory', () => {
  it('keeps games independent and replaces only the selected game', () => {
    rememberPuzzle(seedIdentity('fivefold', 'first'), origin);
    rememberPuzzle(dailyIdentity('kings', '2026-11-10'), origin);
    rememberPuzzle(seedIdentity('sunmoon', 'pets'), origin);
    rememberPuzzle(seedIdentity('fivefold', 'second'), origin);
    expect(lastPuzzleHref('fivefold', origin)).toBe('/games/fivefold/?seed=second&v=1');
    expect(lastPuzzleHref('kings', origin)).toBe('/games/kings/?date=2026-11-10&v=1');
    expect(lastPuzzleHref('sunmoon', origin)).toBe('/games/catdog/?seed=pets&v=2');
  });

  it.each(['', ' a+b & café 🌱 ', 'e\u0301'])('preserves exact seed %j', (seed) => {
    const identity = seedIdentity('sunmoon', seed);
    rememberPuzzle(identity, origin);
    expect(resolvePuzzle('sunmoon', new URL(lastPuzzleHref('sunmoon', origin)!, origin)).identity).toEqual(identity);
  });

  it.each([
    ['sunmoon', 'Catdog', 'catdog'],
    ['wordladder', 'Word Ladder', 'wordladder'],
    ['thread', 'Ribbon', 'ribbon']
  ])('preserves a selected %s (%s) v1 link instead of silently upgrading its board', (gameId, _title, path) => {
    rememberPuzzle(seedIdentity(gameId, 'legacy', 1), origin);
    expect(lastPuzzleHref(gameId, origin)).toBe(`/games/${path}/?seed=legacy&v=1`);
  });

  it('retains Ribbon v1 daily and exact custom-seed selections throughout the same day', () => {
    const opened = new Date(2026, 10, 12, 0, 1);
    const later = new Date(2026, 10, 12, 23, 59);
    const identities = [
      dailyIdentity('thread', '2020-01-01'),
      ...['', ' a+b & café 🌱 ', 'e\u0301'].map((seed) => seedIdentity('thread', seed))
    ];
    for (const identity of identities) {
      rememberPuzzle(identity, origin, opened);
      const href = lastPuzzleHref('thread', origin, later)!;
      const url = new URL(href, origin);
      expect(url.pathname).toBe('/games/ribbon/');
      expect(url.searchParams.get('v')).toBe('1');
      expect(resolvePuzzle('thread', url).identity).toEqual(identity);
    }
  });

  it('keeps stored same-day Word Ladder v1 selections pinned to v1', () => {
    const opened = new Date(2026, 10, 12, 0, 1);
    const later = new Date(2026, 10, 12, 23, 59);
    const identities = [
      dailyIdentity('wordladder', '2020-01-01', 1),
      ...['', ' a+b & café 🌱 ', 'e\u0301'].map((seed) => seedIdentity('wordladder', seed, 1))
    ];
    for (const identity of identities) {
      const params = identity.mode === 'daily'
        ? new URLSearchParams({ date: identity.date!, v: '1' })
        : new URLSearchParams({ seed: identity.seed, v: '1' });
      const stored = JSON.stringify({ date: localDate(opened), url: origin + '/games/wordladder/?' + params });
      records.set('puzzle-room:last-puzzle:wordladder', stored);
      const href = lastPuzzleHref('wordladder', origin, later)!;
      expect(new URL(href, origin).searchParams.get('v')).toBe('1');
      expect(resolvePuzzle('wordladder', new URL(href, origin)).identity).toEqual(identity);
      expect(records.get('puzzle-room:last-puzzle:wordladder')).toBe(stored);
      expect(lastPuzzleHref('wordladder', origin, new Date(2026, 10, 13))).toBeNull();
    }
  });

  it('pins new Word Ladder daily and exact custom-seed selections to v2', () => {
    const identities = [
      dailyIdentity('wordladder', '2026-11-12'),
      ...['', ' a+b & café 🌱 ', 'e\u0301'].map((seed) => seedIdentity('wordladder', seed))
    ];
    for (const identity of identities) {
      expect(identity.generatorVersion).toBe(2);
      rememberPuzzle(identity, origin);
      const url = new URL(lastPuzzleHref('wordladder', origin)!, origin);
      expect(url.pathname).toBe('/games/wordladder/');
      expect(url.searchParams.get('v')).toBe('2');
      expect(resolvePuzzle('wordladder', url).identity).toEqual(identity);
      expect(JSON.parse(records.get('puzzle-room:last-puzzle:wordladder')!)).toEqual({
        date: localDate(), url: url.href
      });
    }
  });

  it('remembers new Ribbon selections as pinned v1 under the original thread storage key', () => {
    rememberPuzzle(seedIdentity('sunmoon', 'pets'), origin);
    rememberPuzzle(dailyIdentity('thread', '2026-11-12'), origin);
    expect(lastPuzzleHref('thread', origin)).toBe('/games/ribbon/?date=2026-11-12&v=1');
    rememberPuzzle(seedIdentity('thread', 'new board'), origin);
    expect(lastPuzzleHref('thread', origin)).toBe('/games/ribbon/?seed=new+board&v=1');
    expect(JSON.parse(records.get('puzzle-room:last-puzzle:thread')!)).toEqual({
      date: localDate(), url: origin + '/games/ribbon/?seed=new+board&v=1'
    });
    expect(records.has('puzzle-room:last-puzzle:ribbon')).toBe(false);
    expect(lastPuzzleHref('sunmoon', origin)).toBe('/games/catdog/?seed=pets&v=2');
  });

  it.each(['sunmoon', 'kings', 'fivefold', 'wordladder', 'thread'])('rejects remembered v3 links for %s', (gameId) => {
    const path = gameId === 'sunmoon' ? 'catdog' : gameId === 'thread' ? 'ribbon' : gameId;
    records.set('puzzle-room:last-puzzle:' + gameId, JSON.stringify({
      date: localDate(), url: `/games/${path}/?seed=unavailable&v=3`
    }));
    expect(lastPuzzleHref(gameId, origin)).toBeNull();
  });

  it.each(['/games/ribbon/', '/games/thread/'])('rejects remembered Ribbon v2 links at %s', (path) => {
    records.set('puzzle-room:last-puzzle:thread', JSON.stringify({
      date: localDate(), url: path + '?seed=unavailable&v=2'
    }));
    expect(lastPuzzleHref('thread', origin)).toBeNull();
  });

  it('canonicalizes same-day legacy Ribbon navigation without changing its v1 identity', () => {
    const identities = [
      dailyIdentity('thread', '2020-01-01'),
      ...['', ' a+b & café 🌱 ', 'e\u0301'].map((seed) => seedIdentity('thread', seed))
    ];
    for (const identity of identities) {
      rememberPuzzle(identity, origin);
      const key = 'puzzle-room:last-puzzle:thread';
      const saved = JSON.parse(records.get(key)!);
      saved.url = saved.url.replace('/games/ribbon/', '/games/thread/');
      records.set(key, JSON.stringify(saved));
      const href = lastPuzzleHref('thread', origin)!;
      expect(new URL(href, origin).pathname).toBe('/games/ribbon/');
      expect(resolvePuzzle('thread', new URL(href, origin)).identity).toEqual(identity);
      expect(lastPuzzleHref('thread', origin, new Date(2026, 10, 13))).toBeNull();
    }
  });

  it.each([
    'https://evil.example/games/thread/?seed=a&v=1',
    '/games/thread/', '/games/thread/?v=1', '/games/thread/?seed=a&v=3',
    '/games/thread/?seed=a&seed=b&v=1', '/games/thread/?date=2026-02-30&v=1',
    '/games/thread/?seed=a&date=2026-11-12&v=1',
    '/games/kings/?seed=a&v=1', '/games/thread/extra/?seed=a&v=1'
  ])('rejects invalid legacy Ribbon navigation %s', (url) => {
    records.set('puzzle-room:last-puzzle:thread', JSON.stringify({ date: localDate(), url }));
    expect(lastPuzzleHref('thread', origin)).toBeNull();
  });

  it('does not accept legacy Ribbon navigation for another game', () => {
    records.set('puzzle-room:last-puzzle:kings', JSON.stringify({
      date: localDate(), url: '/games/thread/?seed=legacy&v=1'
    }));
    expect(lastPuzzleHref('kings', origin)).toBeNull();
  });

  it.each([
    'https://evil.example/games/kings/?seed=a&v=1',
    '/games/fivefold/?seed=a&v=1',
    '/games/unknown/?seed=a&v=1',
    '/games/kings/',
    '/games/kings/?seed=a&v=2',
    '/games/kings/?seed=a&seed=b&v=1',
    '/games/kings/?date=2026-02-30&v=1',
    '/games/kings/?seed=a&date=2026-11-11&v=1',
    'http://['
  ])('ignores invalid stored destination %s', (url) => {
    records.set('puzzle-room:last-puzzle:kings', JSON.stringify({ date: localDate(), url }));
    expect(lastPuzzleHref('kings', origin)).toBeNull();
  });

  it('returns no remembered selection for a new game', () => {
    expect(lastPuzzleHref('fivefold', origin)).toBeNull();
    expect(lastPuzzleHref('unknown', origin)).toBeNull();
  });

  it.each([
    ['America/New_York', '2026-03-08T05:00:00Z', '2026-03-09T03:59:59Z', '2026-03-09T04:00:00Z'],
    ['America/New_York', '2026-11-01T04:00:00Z', '2026-11-02T04:59:59Z', '2026-11-02T05:00:00Z'],
    ['Asia/Kathmandu', '2026-01-01T18:15:00Z', '2026-01-02T18:14:59Z', '2026-01-02T18:15:00Z']
  ])('expires at local midnight in %s, not after a fixed duration', (timezone, opened, sameDay, nextDay) => {
    vi.stubEnv('TZ', timezone);
    rememberPuzzle(seedIdentity('fivefold', 'night'), origin, new Date(opened));
    rememberPuzzle(dailyIdentity('kings', '2020-01-01'), origin, new Date(opened));
    rememberPuzzle(seedIdentity('thread', 'night'), origin, new Date(opened));
    expect(lastPuzzleHref('fivefold', origin, new Date(sameDay))).toBe('/games/fivefold/?seed=night&v=1');
    expect(lastPuzzleHref('kings', origin, new Date(sameDay))).toBe('/games/kings/?date=2020-01-01&v=1');
    expect(lastPuzzleHref('thread', origin, new Date(sameDay))).toBe('/games/ribbon/?seed=night&v=1');
    expect(lastPuzzleHref('fivefold', origin, new Date(nextDay))).toBeNull();
    expect(lastPuzzleHref('kings', origin, new Date(nextDay))).toBeNull();
    expect(lastPuzzleHref('thread', origin, new Date(nextDay))).toBeNull();
  });

  it('does not expire or remove puzzle progress when navigation memory expires', () => {
    const progressKey = 'puzzle-room:save:1:["fivefold","seed",null,"night",1]';
    const progress = '{"version":1,"guesses":["CRANE"],"draft":""}';
    records.set(progressKey, progress);
    rememberPuzzle(seedIdentity('fivefold', 'night'), origin, new Date(2026, 10, 12, 23, 59));
    expect(lastPuzzleHref('fivefold', origin, new Date(2026, 10, 13))).toBeNull();
    expect(records.get(progressKey)).toBe(progress);
  });

  it('ignores old undated navigation memory instead of treating it as selected today', () => {
    records.set('puzzle-room:last-puzzle:kings', origin + '/games/kings/?seed=yesterday&v=1');
    expect(lastPuzzleHref('kings', origin)).toBeNull();
  });

  it('keeps navigation available when storage rejects reads and writes', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('Denied'); },
      setItem() { throw new Error('Denied'); }
    });
    rememberPuzzle(seedIdentity('kings', 'a'), origin);
    expect(lastPuzzleHref('kings', origin)).toBeNull();
  });
});
