import { describe, expect, it } from 'vitest';
import {
  GAME_VERSION,
  MAX_GUESSES,
  generate,
  isAllowedGuess,
  parseSavedGame,
  scoreGuess
} from './engine';
import { ANSWERS } from './words';

describe('versioned deterministic generation', () => {
  // Fixed independently with UTF-16LE bytes and unsigned BigInt arithmetic.
  it.each([
    ['', 'MAGIC'],
    ['a', 'TRUCK'],
    ['fivefold', 'STASH'],
    ['2026-11-07', 'STILL'],
    ['["daily","fivefold","2026-01-01","standard",1]', 'GRAVE'],
    ['hello', 'CHANT'],
    ['caf\u00e9', 'WITCH'],
    ['cafe\u0301', 'SANDY'],
    ['\ud83e\udde9', 'YIELD'],
    ['\ud800', 'BLEND'],
    [' seed ', 'JOKER']
  ])('pins the version-1 answer for seed %j', (seed, answer) => {
    expect(GAME_VERSION).toBe(1);
    expect(generate(seed)).toEqual({ answer });
    expect(generate(seed)).toEqual({ answer });
  });

  it('keeps every curated answer legal', () => {
    expect(ANSWERS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(ANSWERS).size).toBe(ANSWERS.length);
    for (const answer of ANSWERS) {
      expect(answer).toMatch(/^[A-Z]{5}$/);
      expect(isAllowedGuess(answer)).toBe(true);
    }
  });

  it('selects legal answers across arbitrary seed families', () => {
    const pool = new Set(ANSWERS);
    for (let index = 0; index < 2048; index += 1) {
      const seed = `${index}\u0000${String.fromCharCode(index)}\ud83e\udde9`;
      const { answer } = generate(seed);
      expect(pool.has(answer)).toBe(true);
      expect(isAllowedGuess(answer)).toBe(true);
    }
  });
});

describe('English guess validation', () => {
  it.each(['APPLE', 'ADIEU', 'CRANE', 'HELLO', 'GEESE', 'SHEEP', 'FUZZY'])(
    'accepts a real uppercase English word: %s',
    (guess) => expect(isAllowedGuess(guess)).toBe(true)
  );

  it.each(['', 'A', 'FOUR', 'LONGER', 'ABCDE', 'ZZZZZ', 'apple', 'Apple', 'CAFÉE', '12345', ' APPLE', 'APPLE\n'])(
    'rejects noncanonical or non-dictionary input: %j',
    (guess) => expect(isAllowedGuess(guess)).toBe(false)
  );
});

describe('two-pass letter scoring', () => {
  it.each([
    ['APPLE', 'APPLE', ['correct', 'correct', 'correct', 'correct', 'correct']],
    ['ZZZZZ', 'APPLE', ['absent', 'absent', 'absent', 'absent', 'absent']],
    ['ALLEY', 'APPLE', ['correct', 'present', 'absent', 'present', 'absent']],
    ['LEVEL', 'HELLO', ['present', 'correct', 'absent', 'absent', 'present']],
    ['GEESE', 'THOSE', ['absent', 'absent', 'absent', 'correct', 'correct']],
    ['SHEEP', 'SPEED', ['correct', 'absent', 'correct', 'correct', 'present']],
    ['PAPAL', 'APPLE', ['present', 'present', 'correct', 'absent', 'present']]
  ] as const)('scores %s against %s without inventing letter copies', (guess, answer, expected) => {
    expect(scoreGuess(guess, answer)).toEqual(expected);
  });

  it('does not leak mutable scoring state between calls', () => {
    const previous = scoreGuess('APPLE', 'APPLE');
    previous[0] = 'absent';
    expect(scoreGuess('APPLE', 'APPLE')).toEqual(Array(5).fill('correct'));
  });

  it.each([
    ['FOUR', 'APPLE'],
    ['APPLE', 'LONGER'],
    ['apple', 'APPLE'],
    ['APPLE', 'APP1E']
  ])('rejects invalid scoring dimensions or alphabet', (guess, answer) => {
    expect(() => scoreGuess(guess, answer)).toThrow(RangeError);
  });
});

describe('saved game parsing', () => {
  const answer = 'APPLE';
  const sixMisses = Array<string>(MAX_GUESSES).fill('CRANE');

  it('accepts empty, partial, and full unsubmitted drafts', () => {
    for (const draft of ['', 'A', 'APPL', 'APPLE']) {
      expect(parseSavedGame({ version: 1, guesses: [], draft }, answer)).toEqual({
        version: 1,
        guesses: [],
        draft
      });
    }
  });

  it('preserves valid repeated guesses and repeated letters', () => {
    const value = { version: 1, guesses: ['GEESE', 'GEESE', 'SHEEP'], draft: 'LL' };
    expect(parseSavedGame(value, answer)).toEqual(value);
  });

  it('accepts a win, a six-miss loss, and a final-turn win with empty drafts', () => {
    for (const guesses of [
      ['APPLE'],
      sixMisses,
      [...sixMisses.slice(0, -1), 'APPLE']
    ]) {
      const value = { version: 1, guesses, draft: '' };
      expect(parseSavedGame(value, answer)).toEqual(value);
    }
  });

  it('returns a fresh save and guess list', () => {
    const value = { version: 1, guesses: ['CRANE'], draft: 'A' };
    const restored = parseSavedGame(value, answer);
    expect(restored).toEqual(value);
    expect(restored).not.toBe(value);
    expect(restored?.guesses).not.toBe(value.guesses);
    restored?.guesses.push('APPLE');
    expect(value.guesses).toEqual(['CRANE']);
  });

  it.each([
    null,
    undefined,
    true,
    1,
    'save',
    [],
    {},
    { guesses: [], draft: '' },
    { version: 0, guesses: [], draft: '' },
    { version: 2, guesses: [], draft: '' },
    { version: '1', guesses: [], draft: '' },
    { version: 1, guesses: null, draft: '' },
    { version: 1, guesses: 'CRANE', draft: '' },
    { version: 1, guesses: [null], draft: '' },
    { version: 1, guesses: [1], draft: '' },
    { version: 1, guesses: ['CRANE', 'ZZZZZ'], draft: '' },
    { version: 1, guesses: ['crane'], draft: '' },
    { version: 1, guesses: ['CRANE\n'], draft: '' },
    { version: 1, guesses: [], draft: null },
    { version: 1, guesses: [], draft: 0 },
    { version: 1, guesses: [], draft: 'LONGER' },
    { version: 1, guesses: [], draft: 'lower' },
    { version: 1, guesses: [], draft: 'A B' },
    { version: 1, guesses: [], draft: 'A\n' },
    { version: 1, guesses: [], draft: 'CAFÉ' }
  ])('rejects corrupted or unsupported records: %j', (value) => {
    expect(parseSavedGame(value, answer)).toBeNull();
  });

  it('rejects sparse guess arrays rather than skipping invalid entries', () => {
    expect(parseSavedGame({ version: 1, guesses: Array(1), draft: '' }, answer)).toBeNull();
  });

  it('rejects overlong histories, moves after a win, and terminal drafts', () => {
    for (const value of [
      { version: 1, guesses: [...sixMisses, 'CRANE'], draft: '' },
      { version: 1, guesses: ['APPLE', 'CRANE'], draft: '' },
      { version: 1, guesses: ['APPLE', 'APPLE'], draft: '' },
      { version: 1, guesses: ['APPLE'], draft: 'A' },
      { version: 1, guesses: sixMisses, draft: 'A' }
    ]) {
      expect(parseSavedGame(value, answer)).toBeNull();
    }
  });
});
