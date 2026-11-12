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
    expect(lastPuzzleHref('sunmoon', origin)).toBe('/games/catdog/?seed=pets&v=1');
  });

  it.each(['', ' a+b & café 🌱 ', 'e\u0301'])('preserves exact seed %j', (seed) => {
    const identity = seedIdentity('sunmoon', seed);
    rememberPuzzle(identity, origin);
    expect(resolvePuzzle('sunmoon', new URL(lastPuzzleHref('sunmoon', origin)!, origin)).identity).toEqual(identity);
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
    expect(lastPuzzleHref('fivefold', origin, new Date(sameDay))).toBe('/games/fivefold/?seed=night&v=1');
    expect(lastPuzzleHref('kings', origin, new Date(sameDay))).toBe('/games/kings/?date=2020-01-01&v=1');
    expect(lastPuzzleHref('fivefold', origin, new Date(nextDay))).toBeNull();
    expect(lastPuzzleHref('kings', origin, new Date(nextDay))).toBeNull();
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
