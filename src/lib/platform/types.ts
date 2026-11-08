export interface PuzzleIdentity {
  gameId: string;
  mode: 'daily' | 'seed';
  seed: string;
  date?: string;
  generatorVersion: 1;
}

export function puzzleKey(identity: PuzzleIdentity): string {
  return JSON.stringify([identity.gameId, identity.mode, identity.date ?? null, identity.seed, identity.generatorVersion]);
}

export function puzzleUrl(identity: PuzzleIdentity, origin: string): string {
  const url = new URL('/games/' + identity.gameId + '/', origin);
  if (identity.mode === 'daily') url.searchParams.set('date', identity.date!);
  else url.searchParams.set('seed', identity.seed);
  url.searchParams.set('v', String(identity.generatorVersion));
  return url.href;
}
