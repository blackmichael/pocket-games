import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDate, dailyIdentity, isCalendarDate, resolvePuzzle, seedIdentity } from './daily';
import { puzzleKey, puzzleUrl } from './types';

const origin = 'https://example.com';
const resolve = (gameId: string, query: string, now?: Date) =>
  resolvePuzzle(gameId, new URL('/games/' + (gameId === 'sunmoon' ? 'catdog' : gameId === 'thread' ? 'ribbon' : gameId) + '/' + query, origin), now);

afterEach(() => vi.unstubAllEnvs());

describe('browser-local daily identity', () => {
  it.each([
    ['UTC', '2026-01-01T23:59:59Z', '2026-01-01'],
    ['UTC', '2026-01-02T00:00:00Z', '2026-01-02'],
    ['America/Los_Angeles', '2026-01-02T07:59:59Z', '2026-01-01'],
    ['America/Los_Angeles', '2026-01-02T08:00:00Z', '2026-01-02'],
    ['Asia/Kathmandu', '2026-01-01T18:14:59Z', '2026-01-01'],
    ['Asia/Kathmandu', '2026-01-01T18:15:00Z', '2026-01-02'],
    ['America/New_York', '2026-03-08T06:59:59Z', '2026-03-08'],
    ['America/New_York', '2026-03-08T07:00:00Z', '2026-03-08'],
    ['America/New_York', '2026-11-01T05:59:59Z', '2026-11-01'],
    ['America/New_York', '2026-11-01T06:00:00Z', '2026-11-01'],
    ['America/New_York', '2026-03-09T03:59:59Z', '2026-03-08'],
    ['America/New_York', '2026-03-09T04:00:00Z', '2026-03-09'],
    ['America/New_York', '2026-11-02T04:59:59Z', '2026-11-01'],
    ['America/New_York', '2026-11-02T05:00:00Z', '2026-11-02']
  ])('selects the local daily in %s at %s', (timezone, instant, date) => {
    vi.stubEnv('TZ', timezone);
    const now = new Date(instant);
    expect(localDate(now)).toBe(date);
    for (const gameId of ['kings', 'fivefold', 'sunmoon', 'wordladder', 'thread']) {
      expect(resolve(gameId, '', now).identity).toEqual(dailyIdentity(gameId, date));
      expect(resolve(gameId, '?v=1', now).identity).toEqual(dailyIdentity(gameId, date, 1));
      expect(resolve(gameId, '?date=2026-01-01', now).identity).toEqual(dailyIdentity(gameId, '2026-01-01'));
    }
  });

  it.each(['', '0000-01-01', '2026-02-29', '2026-04-31', '2026-1-01'])('rejects invalid date %s', (date) => {
    expect(isCalendarDate(date)).toBe(false);
  });
  it('accepts leap days', () => expect(isCalendarDate('2024-02-29')).toBe(true));

  it('keeps the original Fivefold daily identity and storage key', () => {
    const identity = resolve('fivefold', '?date=2026-01-01', new Date(2026, 0, 2, 12)).identity;
    expect(identity).toEqual({
      gameId: 'fivefold', mode: 'daily', date: '2026-01-01',
      seed: '["daily","fivefold","2026-01-01","standard",1]', generatorVersion: 1
    });
    expect(puzzleKey(identity!)).toBe('["fivefold","daily","2026-01-01","[\\"daily\\",\\"fivefold\\",\\"2026-01-01\\",\\"standard\\",1]",1]');
  });

  it.each(['2020-01-01', '2026-11-08', '2026-11-09', '2027-01-01'])('preserves v1 links for every game on daily %s', (date) => {
    for (const gameId of ['kings', 'fivefold', 'sunmoon', 'wordladder', 'thread']) {
      const version = 1;
      const identity = dailyIdentity(gameId, date, 1);
      expect(identity).toEqual({
        gameId, mode: 'daily', date, generatorVersion: version,
        seed: JSON.stringify(['daily', gameId, date, 'standard', version])
      });
      expect(resolve(gameId, '?date=' + date + '&v=' + version).identity).toEqual(identity);
    }
  });


  it('uses the current generator for unversioned arbitrary seeds', () => {
    for (const gameId of ['kings', 'fivefold', 'sunmoon', 'wordladder', 'thread']) {
      for (const seed of ['', 'random-seed', '2026-01-01']) {
        const identity = seedIdentity(gameId, seed);
        expect(identity).toEqual({ gameId, mode: 'seed', seed, generatorVersion: gameId === 'sunmoon' ? 2 : 1 });
        expect(resolve(gameId, '?' + new URLSearchParams({ seed })).identity).toEqual(identity);
      }
    }
  });

  it.each(['', 'a+b & café 🌱', ' e\u0301 '])('preserves the exact Catdog seed %j', (seed) => {
    const identity = resolve('sunmoon', '?' + new URLSearchParams({ seed, v: '1' })).identity;
    expect(identity).toEqual({ gameId: 'sunmoon', mode: 'seed', seed, generatorVersion: 1 });
  });

  it('roundtrips daily and Unicode/empty seed links for every supported version', () => {
    for (const gameId of ['kings', 'fivefold', 'sunmoon', 'wordladder', 'thread']) {
      const versions: (1 | 2)[] = gameId === 'sunmoon' ? [1, 2] : [1];
      const identities = versions.flatMap((version) => [
        ...['', 'a+b & café 🌱', ' e\u0301 ', '2026-01-01'].map((seed) => seedIdentity(gameId, seed, version)),
        ...['2026-01-01', '2026-11-08', '2027-01-01'].map((date) => dailyIdentity(gameId, date, version))
      ]);
      for (const first of identities) {
        const url = new URL(puzzleUrl(first, origin));
        const path = gameId === 'sunmoon' ? 'catdog' : gameId === 'thread' ? 'ribbon' : gameId;
        expect(url.pathname).toBe('/games/' + path + '/');
        expect(url.searchParams.get('v')).toBe(String(first.generatorVersion));
        const result = resolvePuzzle(gameId, url);
        expect(result.error).toBeNull();
        expect(result.identity).toEqual(first);
        expect(puzzleKey(result.identity!)).toBe(puzzleKey(first));
      }
    }
  });

  it('keeps different games and daily/seeded progress separate', () => {
    const seeded = seedIdentity('kings', 'same seed');
    expect(puzzleKey(seeded)).not.toBe(puzzleKey(seedIdentity('fivefold', 'same seed')));
    const daily = dailyIdentity('kings', '2026-11-08');
    expect(puzzleKey(daily)).not.toBe(puzzleKey(seedIdentity('kings', daily.seed)));
  });

  it('preserves Catdog v2 without reusing v1 daily or custom-seed saves', () => {
    const gameId = 'sunmoon';
    for (const date of ['2020-01-01', '2026-11-12']) {
      const legacy = dailyIdentity(gameId, date, 1);
      const current = dailyIdentity(gameId, date, 2);
      expect(current).toEqual({
        gameId, mode: 'daily', date, generatorVersion: 2,
        seed: JSON.stringify(['daily', gameId, date, 'standard', 2])
      });
      expect(resolve(gameId, '?date=' + date + '&v=2').identity).toEqual(current);
      expect(puzzleKey(current)).not.toBe(puzzleKey(legacy));
    }
    const legacy = seedIdentity(gameId, 'same seed', 1);
    const current = seedIdentity(gameId, 'same seed', 2);
    expect(puzzleKey(current)).not.toBe(puzzleKey(legacy));
    expect(resolve(gameId, '?seed=same+seed&v=1').identity).toEqual(legacy);
    expect(resolve(gameId, '?seed=same+seed&v=2').identity).toEqual(current);
  });

  it('defaults Ribbon daily identities to v1 with the original thread identity and storage key', () => {
    const date = '2026-11-12';
    const current = dailyIdentity('thread', date);
    expect(current).toEqual({
      gameId: 'thread', mode: 'daily', date, generatorVersion: 1,
      seed: JSON.stringify(['daily', 'thread', date, 'standard', 1])
    });
    expect(resolve('thread', '?date=' + date).identity).toEqual(current);
    expect(resolve('thread', '?date=' + date + '&v=1').identity).toEqual(current);
    expect(puzzleKey(current)).toBe(JSON.stringify(['thread', 'daily', date, current.seed, 1]));
    expect(puzzleUrl(current, origin)).toBe(origin + '/games/ribbon/?date=' + date + '&v=1');
  });

  it.each(['', 'a+b & café 🌱', ' e\u0301 ', '2026-01-01'])('keeps exact Ribbon v1 seed %j under the original thread identity', (seed) => {
    const current = seedIdentity('thread', seed);
    expect(current).toEqual({ gameId: 'thread', mode: 'seed', seed, generatorVersion: 1 });
    expect(resolve('thread', '?' + new URLSearchParams({ seed })).identity).toEqual(current);
    expect(resolve('thread', '?' + new URLSearchParams({ seed, v: '1' })).identity).toEqual(current);
    expect(puzzleKey(current)).toBe(JSON.stringify(['thread', 'seed', null, seed, 1]));
    const url = new URL(puzzleUrl(current, origin));
    expect(url.pathname).toBe('/games/ribbon/');
    expect(url.searchParams.get('seed')).toBe(seed);
    expect(url.searchParams.get('v')).toBe('1');
  });

  it.each([
    '?date=2026-02-30', '?seed=a&date=2026-01-01', '?seed=a&seed=b', '?seed=&seed=',
    '?date=', '?v=', '?date=2026-01-01&date=2026-01-02', '?v=1&v=1', '?v=2&v=2', '?v=1&v=2',
    '?v=3&v=3', '?v=2&v=3', '?v=3&v=1',
    '?v=0', '?v=4', '?v=01', '?v=1.0', '?v=latest', '?v=%202', '?v=2%20', '?v=03', '?v=3.0', '?v=%203', '?v=3%20'
  ])('does not silently replace invalid identity %s', (query) => {
    for (const gameId of ['fivefold', 'kings', 'sunmoon', 'wordladder', 'thread']) {
      const result = resolve(gameId, query);
      expect(result.identity).toBeNull();
      expect(result.error).not.toBeNull();
    }
  });

  it.each(['', 'seed=a&', 'date=2026-11-08&', 'date=2027-01-01&'])('rejects unavailable versions in %s', (query) => {
    for (const gameId of ['fivefold', 'kings', 'sunmoon', 'wordladder', 'thread']) {
      for (const version of gameId === 'sunmoon' ? [3, 4] : [2, 3]) {
        const result = resolve(gameId, '?' + query + 'v=' + version);
        expect(result.identity).toBeNull();
        expect(result.error).not.toBeNull();
      }
    }
  });
});
