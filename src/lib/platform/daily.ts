import type { PuzzleIdentity } from './types';

export const DAILY_TIME_ZONE = 'America/Chicago';
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DAILY_TIME_ZONE, calendar: 'gregory', numberingSystem: 'latn',
  year: 'numeric', month: '2-digit', day: '2-digit'
});

export function chicagoDate(now = new Date()): string {
  const parts = dayFormatter.formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return part('year') + '-' + part('month') + '-' + part('day');
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(value + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dailyIdentity(gameId: string, date: string): PuzzleIdentity {
  const generatorVersion = 1;
  return { gameId, mode: 'daily', date, generatorVersion,
    seed: JSON.stringify(['daily', gameId, date, 'standard', generatorVersion]) };
}

export function seedIdentity(gameId: string, seed: string): PuzzleIdentity {
  const generatorVersion = 1;
  return { gameId, mode: 'seed', seed, generatorVersion };
}

export function resolvePuzzle(gameId: string, url: URL, now = new Date()): { identity: PuzzleIdentity | null; error: string | null } {
  const params = url.searchParams;
  if (['date', 'seed', 'v'].some((key) => params.getAll(key).length > 1))
    return { identity: null, error: 'This puzzle link contains repeated parameters. Open New seed to choose a date or seed.' };
  if (params.has('date') && params.has('seed'))
    return { identity: null, error: 'Choose either a daily date or a custom seed, not both.' };
  const version = '1';
  if (params.has('v') && params.get('v') !== version)
    return { identity: null, error: 'This generator version is not available for this game.' };
  if (params.has('seed')) return { identity: seedIdentity(gameId, params.get('seed')!), error: null };
  const date = params.get('date') ?? chicagoDate(now);
  if (!isCalendarDate(date)) return { identity: null, error: 'That date is not valid. Use a calendar date in YYYY-MM-DD format.' };
  return { identity: dailyIdentity(gameId, date), error: null };
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z'));
}
