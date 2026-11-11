import { games } from '#lib/catalog.js';
import { resolvePuzzle } from './daily.js';
import { puzzleUrl, type PuzzleIdentity } from './types.js';

const prefix = 'puzzle-room:last-puzzle:';

export function rememberPuzzle(identity: PuzzleIdentity, origin: string): void {
  try {
    localStorage.setItem(prefix + identity.gameId, puzzleUrl(identity, origin));
  } catch { /* Remembering a selection must never block play. */ }
}

export function lastPuzzleHref(gameId: string, origin: string): string | null {
  const game = games.find((entry) => entry.id === gameId);
  if (!game) return null;
  try {
    const raw = localStorage.getItem(prefix + gameId);
    if (!raw) return null;
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname !== game.href) return null;
    if (!url.searchParams.has('seed') && !url.searchParams.has('date')) return null;
    const { identity } = resolvePuzzle(gameId, url);
    if (!identity) return null;
    const pinned = new URL(puzzleUrl(identity, origin));
    return pinned.pathname + pinned.search;
  } catch {
    return null;
  }
}
