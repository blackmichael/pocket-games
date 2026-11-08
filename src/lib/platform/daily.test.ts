import { describe, expect, it } from 'vitest';
import { chicagoDate, dailyIdentity, isCalendarDate, resolvePuzzle } from './daily';
import { puzzleKey, puzzleUrl } from './types';

describe('Chicago daily identity', () => {
  it.each([
    ['2026-01-02T05:59:59Z', '2026-01-01'], ['2026-01-02T06:00:00Z', '2026-01-02'],
    ['2026-07-02T04:59:59Z', '2026-07-01'], ['2026-07-02T05:00:00Z', '2026-07-02'],
    ['2026-03-08T07:59:59Z', '2026-03-08'], ['2026-03-08T08:00:00Z', '2026-03-08'],
    ['2026-11-01T06:59:59Z', '2026-11-01'], ['2026-11-01T07:00:00Z', '2026-11-01']
  ])('maps %s to %s', (instant, date) => expect(chicagoDate(new Date(instant))).toBe(date));
  it('rejects impossible dates but accepts leap days', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(isCalendarDate('2026-04-31')).toBe(false);
  });
  it('resolves today from the supplied instant rather than UTC date', () => {
    expect(resolvePuzzle('fivefold', new URL('https://example.com/games/fivefold/'), new Date('2026-01-02T05:00:00Z')).identity)
      .toEqual({
        gameId: 'fivefold',
        mode: 'daily',
        date: '2026-01-01',
        seed: '["daily","fivefold","2026-01-01","standard",1]',
        generatorVersion: 1
      });
  });
  it('roundtrips daily and arbitrary Unicode/empty seed links without losing identity', () => {
    for (const seed of ['', 'a+b & café 🌱', '2026-01-01']) {
      const first = resolvePuzzle('fivefold', new URL('https://example.com/games/fivefold/?' + new URLSearchParams({seed}))).identity!;
      const second = resolvePuzzle('fivefold', new URL(puzzleUrl(first, 'https://example.com'))).identity!;
      expect(puzzleKey(second)).toBe(puzzleKey(first));
      expect(second.seed).toBe(seed);
    }
    const first = dailyIdentity('fivefold', '2026-01-01');
    expect(resolvePuzzle('fivefold', new URL(puzzleUrl(first, 'https://example.com'))).identity).toEqual(first);
  });
  it.each([
    '?date=2026-02-30', '?v=2', '?seed=a&date=2026-01-01', '?seed=a&seed=b',
    '?date=', '?v=', '?date=2026-01-01&date=2026-01-02', '?v=1&v=1'
  ])('does not silently replace invalid identity %s', (query) => {
    const result = resolvePuzzle('fivefold', new URL('https://example.com/games/fivefold/' + query));
    expect(result.identity).toBeNull(); expect(result.error).not.toBeNull();
  });
});
