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

const CATDOG_V2_START_DATE = '2026-11-09';
type GeneratorVersion = PuzzleIdentity['generatorVersion'];

function supportsVersion(gameId: string, version: number): version is GeneratorVersion {
  return version === 1 || (gameId === 'sunmoon' && version === 2);
}

export function dailyIdentity(gameId: string, date: string, generatorVersion: GeneratorVersion = gameId === 'sunmoon' && date >= CATDOG_V2_START_DATE ? 2 : 1): PuzzleIdentity {
  if (!supportsVersion(gameId, generatorVersion)) throw new RangeError('Unsupported generator version for this game.');
  return { gameId, mode: 'daily', date, generatorVersion,
    seed: JSON.stringify(['daily', gameId, date, 'standard', generatorVersion]) };
}

export function seedIdentity(gameId: string, seed: string, generatorVersion: GeneratorVersion = gameId === 'sunmoon' ? 2 : 1): PuzzleIdentity {
  if (!supportsVersion(gameId, generatorVersion)) throw new RangeError('Unsupported generator version for this game.');
  return { gameId, mode: 'seed', seed, generatorVersion };
}

export function resolvePuzzle(gameId: string, url: URL, now = new Date()): { identity: PuzzleIdentity | null; error: string | null } {
  const params = url.searchParams;
  if (['date', 'seed', 'v'].some((key) => params.getAll(key).length > 1))
    return { identity: null, error: 'This puzzle link contains repeated parameters. Open New seed to choose a date or seed.' };
  if (params.has('date') && params.has('seed'))
    return { identity: null, error: 'Choose either a daily date or a custom seed, not both.' };
  let version: GeneratorVersion | undefined;
  if (params.has('v')) {
    const requested = params.get('v');
    const parsed = requested === '1' ? 1 : requested === '2' ? 2 : 0;
    if (!supportsVersion(gameId, parsed))
      return { identity: null, error: 'This generator version is not available for this game.' };
    version = parsed;
  }
  if (params.has('seed')) return { identity: seedIdentity(gameId, params.get('seed')!, version), error: null };
  const date = params.get('date') ?? chicagoDate(now);
  if (!isCalendarDate(date)) return { identity: null, error: 'That date is not valid. Use a calendar date in YYYY-MM-DD format.' };
  return { identity: dailyIdentity(gameId, date, version), error: null };
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(date + 'T12:00:00Z'));
}
