import { ACCEPTED_GUESSES, ANSWERS } from './words';

export type LetterState = 'absent' | 'present' | 'correct';

export const GAME_VERSION = 1;
export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export interface SavedGame {
  version: 1;
  guesses: string[];
  draft: string;
}

/**
 * Version 1: FNV-1a over UTF-16LE bytes (no BOM or normalization), one
 * xorshift32 step, then unsigned modulo into the frozen ordered answer pool.
 * See DICTIONARY-LICENSE.txt for the exact reproducible algorithm and data.
 * Hashing is O(seed.length); selecting the answer is O(1).
 */
export function generate(seed: string): { answer: string } {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    state = Math.imul(state ^ (unit & 255), 16777619) >>> 0;
    state = Math.imul(state ^ (unit >>> 8), 16777619) >>> 0;
  }
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return { answer: ANSWERS[(state >>> 0) % ANSWERS.length] };
}

/** Canonical inputs are exactly five uppercase ASCII letters. */
export function isAllowedGuess(guess: string): boolean {
  return ACCEPTED_GUESSES.has(guess);
}

/** Reserve exact matches before spending remaining copies on present letters. */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  if (
    guess.length !== WORD_LENGTH ||
    answer.length !== WORD_LENGTH ||
    /[^A-Z]/.test(guess) ||
    /[^A-Z]/.test(answer)
  ) {
    throw new RangeError('Scoring requires two five-letter uppercase ASCII words.');
  }

  const result: LetterState[] = Array<LetterState>(WORD_LENGTH).fill('absent');
  const remaining = Array<number>(26).fill(0);

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (guess[index] === answer[index]) {
      result[index] = 'correct';
    } else {
      remaining[answer.charCodeAt(index) - 65] += 1;
    }
  }

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (result[index] === 'correct') continue;
    const letter = guess.charCodeAt(index) - 65;
    if (remaining[letter] > 0) {
      result[index] = 'present';
      remaining[letter] -= 1;
    }
  }

  return result;
}

/** Treat browser storage as untrusted; never partially restore a broken game. */
export function parseSavedGame(value: unknown, answer: string): SavedGame | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== GAME_VERSION || !Array.isArray(record.guesses)) return null;
  if (record.guesses.length > MAX_GUESSES) return null;
  if (
    typeof record.draft !== 'string' ||
    record.draft.length > WORD_LENGTH ||
    /[^A-Z]/.test(record.draft)
  ) return null;

  const guesses: string[] = [];
  let won = false;
  for (const guess of record.guesses) {
    if (won || typeof guess !== 'string' || !isAllowedGuess(guess)) return null;
    guesses.push(guess);
    won = guess === answer;
  }

  if ((won || guesses.length === MAX_GUESSES) && record.draft !== '') return null;
  return { version: GAME_VERSION, guesses, draft: record.draft };
}
