import { describe, expect, it } from 'vitest';
import { chicagoDate, dailyIdentity, isCalendarDate, resolvePuzzle, seedIdentity } from './daily';
import { puzzleKey, puzzleUrl } from './types';

const origin = 'https://example.com';
const resolve = (gameId: string, query: string, now?: Date) =>
  resolvePuzzle(gameId, new URL('/games/' + gameId + '/' + query, origin), now);

describe('Chicago daily identity', () => {
  it.each([
    ['2026-01-02T05:59:59Z', '2026-01-01'], ['2026-01-02T06:00:00Z', '2026-01-02'],
    ['2026-07-02T04:59:59Z', '2026-07-01'], ['2026-07-02T05:00:00Z', '2026-07-02'],
    ['2026-03-08T05:59:59Z', '2026-03-07'], ['2026-03-08T06:00:00Z', '2026-03-08'],
    ['2026-03-08T07:59:59Z', '2026-03-08'], ['2026-03-08T08:00:00Z', '2026-03-08'],
    ['2026-11-01T04:59:59Z', '2026-10-31'], ['2026-11-01T05:00:00Z', '2026-11-01'],
    ['2026-11-01T06:59:59Z', '2026-11-01'], ['2026-11-01T07:00:00Z', '2026-11-01'],
    ['2026-11-08T05:59:59Z', '2026-11-07'], ['2026-11-08T06:00:00Z', '2026-11-08'],
    ['2026-11-09T05:59:59Z', '2026-11-08'], ['2026-11-09T06:00:00Z', '2026-11-09']
  ])('maps %s to %s', (instant, date) => expect(chicagoDate(new Date(instant))).toBe(date));

  it.each(['', '0000-01-01', '2026-02-29', '2026-04-31', '2026-1-01'])('rejects invalid date %s', (date) => {
    expect(isCalendarDate(date)).toBe(false);
  });
  it('accepts leap days', () => expect(isCalendarDate('2024-02-29')).toBe(true));

  it('keeps the original Fivefold daily identity and storage key', () => {
    const identity = resolve('fivefold', '', new Date('2026-01-02T05:00:00Z')).identity;
    expect(identity).toEqual({
      gameId: 'fivefold', mode: 'daily', date: '2026-01-01',
      seed: '["daily","fivefold","2026-01-01","standard",1]', generatorVersion: 1
    });
    expect(puzzleKey(identity!)).toBe('["fivefold","daily","2026-01-01","[\\"daily\\",\\"fivefold\\",\\"2026-01-01\\",\\"standard\\",1]",1]');
  });

  it.each(['2020-01-01', '2026-11-08', '2026-11-09', '2027-01-01'])('uses each game’s sole version for daily %s', (date) => {
    for (const gameId of ['kings', 'fivefold']) {
      const version = 1;
      const identity = dailyIdentity(gameId, date);
      expect(identity).toEqual({
        gameId, mode: 'daily', date, generatorVersion: version,
        seed: JSON.stringify(['daily', gameId, date, 'standard', version])
      });
      expect(resolve(gameId, '?date=' + date).identity).toEqual(identity);
      expect(resolve(gameId, '?date=' + date + '&v=' + version).identity).toEqual(identity);
    }
  });

  it.each([
    ['2026-11-08T05:59:59Z', '2026-11-07'],
    ['2026-11-08T06:00:00Z', '2026-11-08'],
    ['2026-11-09T05:59:59Z', '2026-11-08'],
    ['2026-11-09T06:00:00Z', '2026-11-09']
  ])('selects the daily at Chicago instant %s', (instant, date) => {
    const now = new Date(instant);
    for (const gameId of ['kings', 'fivefold']) {
      const version = 1;
      expect(resolve(gameId, '', now).identity).toEqual(dailyIdentity(gameId, date));
      expect(resolve(gameId, '?v=' + version, now).identity).toEqual(dailyIdentity(gameId, date));
    }
  });

  it('uses v1 for arbitrary seeds in both games', () => {
    for (const gameId of ['kings', 'fivefold']) {
      for (const seed of ['', 'random-seed', '2026-01-01']) {
        const identity = seedIdentity(gameId, seed);
        expect(identity).toEqual({ gameId, mode: 'seed', seed, generatorVersion: 1 });
        expect(resolve(gameId, '?' + new URLSearchParams({ seed })).identity).toEqual(identity);
      }
    }
  });

  it('roundtrips daily and Unicode/empty seed links with the supported version', () => {
    for (const gameId of ['kings', 'fivefold']) {
      const identities = [
        ...['', 'a+b & café 🌱', '2026-01-01'].map((seed) => seedIdentity(gameId, seed)),
        ...['2026-01-01', '2026-11-08', '2027-01-01'].map((date) => dailyIdentity(gameId, date))
      ];
      for (const first of identities) {
        const url = new URL(puzzleUrl(first, origin));
        expect(url.searchParams.get('v')).toBe('1');
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

  it.each([
    '?date=2026-02-30', '?seed=a&date=2026-01-01', '?seed=a&seed=b', '?seed=&seed=',
    '?date=', '?v=', '?date=2026-01-01&date=2026-01-02', '?v=1&v=1', '?v=2&v=2', '?v=1&v=2',
    '?v=0', '?v=3', '?v=01', '?v=1.0', '?v=latest', '?v=%202', '?v=2%20'
  ])('does not silently replace invalid identity %s', (query) => {
    for (const gameId of ['fivefold', 'kings']) {
      const result = resolve(gameId, query);
      expect(result.identity).toBeNull();
      expect(result.error).not.toBeNull();
    }
  });

  it.each(['', 'seed=a&', 'date=2026-11-08&', 'date=2027-01-01&'])('rejects unsupported versions in %s', (query) => {
    for (const gameId of ['fivefold', 'kings']) {
      const result = resolve(gameId, '?' + query + 'v=2');
      expect(result.identity).toBeNull();
      expect(result.error).not.toBeNull();
    }
  });
});
