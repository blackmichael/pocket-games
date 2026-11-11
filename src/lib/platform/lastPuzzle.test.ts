import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyIdentity, resolvePuzzle, seedIdentity } from './daily.js';
import { lastPuzzleHref, rememberPuzzle } from './lastPuzzle.js';

const origin = 'https://example.com';
let records: Map<string, string>;

beforeEach(() => {
  records = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => records.set(key, value)
  });
});
afterEach(() => vi.unstubAllGlobals());

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
    records.set('puzzle-room:last-puzzle:kings', url);
    expect(lastPuzzleHref('kings', origin)).toBeNull();
  });

  it('returns no remembered selection for a new game', () => {
    expect(lastPuzzleHref('fivefold', origin)).toBeNull();
    expect(lastPuzzleHref('unknown', origin)).toBeNull();
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
