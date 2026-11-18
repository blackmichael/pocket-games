import { describe, expect, it } from 'vitest';
import { generate, isSolved, isWord, moveError, validateSave, type Puzzle, type Save } from './engine';
import { WORDS } from './words';

const dictionary = new Set(WORDS);

// Independent graph oracle: substitute all ASCII letters, not engine buckets.
function adjacent(word: string): string[] {
  const result: string[] = [];
  for (let position = 0; position < 4; position += 1) {
    for (let letter = 65; letter <= 90; letter += 1) {
      const candidate = word.slice(0, position) + String.fromCharCode(letter) + word.slice(position + 1);
      if (candidate !== word && dictionary.has(candidate)) result.push(candidate);
    }
  }
  return result;
}

function shortestPath(start: string, target: string): string[] | null {
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === target) {
      const path: string[] = [];
      let word = target;
      while (word !== start) {
        path.push(word);
        word = previous.get(word)!;
      }
      return path.reverse();
    }
    for (const next of adjacent(current)) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  return null;
}

const coldWarm: Puzzle = { start: 'COLD', target: 'WARM', shortest: 4 };
const solution = ['CORD', 'CARD', 'WARD', 'WARM'];
function save(overrides: Partial<Save> = {}): Save {
  return { version: 1, steps: [], draft: '', ...overrides };
}

describe('frozen vocabulary', () => {
  it('pins the complete sorted ASCII word extract', async () => {
    expect(WORDS).toHaveLength(2584);
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect([...WORDS].sort()).toEqual(WORDS);
    expect(WORDS.every((word) => /^[A-Z]{4}$/.test(word))).toBe(true);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(WORDS.join('\n') + '\n'));
    expect(Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(
      'caa32dbb73b5cd7705dd77ce556da17c91be6d3704812a8c6db8a8c5cd1b9467'
    );
  });

  it.each(['COLD', 'WARM', 'GRAY', 'GREY', 'FUCK', 'SHIT', 'ARSE', 'JOHN'])(
    'accepts ordinary words, British spellings, and unfiltered language: %s',
    (word) => expect(isWord(word)).toBe(true)
  );

  it.each(['', 'ABC', 'AAAAA', 'cold', 'Cold', 'CÖLD', ' COLD', 'COLD\n', '1234', 'ZZZZ', 'NASA', 'ZEUS', 'FOHS', 'AAHS', 'AALS', 'FOID', 'INLY'])(
    'rejects noncanonical inputs, names, abbreviations, and excluded obscure entries: %j',
    (word) => expect(isWord(word)).toBe(false)
  );

  it('pins graph connectivity independently', () => {
    const unseen = new Set(WORDS);
    const sizes: number[] = [];
    let degreeSum = 0;
    for (const word of WORDS) {
      const neighbors = adjacent(word);
      degreeSum += neighbors.length;
      if (!unseen.delete(word)) continue;
      const queue = [word];
      for (let head = 0; head < queue.length; head += 1) {
        for (const next of adjacent(queue[head])) if (unseen.delete(next)) queue.push(next);
      }
      sizes.push(queue.length);
    }
    expect(degreeSum / 2).toBe(11799);
    expect(sizes).toHaveLength(99);
    expect(Math.max(...sizes)).toBe(2448);
  });
});

describe('deterministic generator v1', () => {
  // Reference vectors derived from unsigned BigInt FNV-1a/xorshift and a
  // separately constructed graph, without importing the engine implementation.
  it.each([
    ['', { start: 'FLOG', target: 'SICS', shortest: 7 }],
    ['fixed-seed', { start: 'BURP', target: 'DINE', shortest: 5 }],
    ['catalog-preview', { start: 'PEES', target: 'MOOR', shortest: 5 }],
    [' ladder ', { start: 'GUFF', target: 'PONE', shortest: 6 }],
    ['🪜', { start: 'JERK', target: 'WIND', shortest: 6 }],
    ['é', { start: 'LIMN', target: 'FOGS', shortest: 5 }],
    ['e\u0301', { start: 'MANY', target: 'FEEL', shortest: 5 }],
    ['["daily","wordladder","2026-11-15","standard",1]', { start: 'FAZE', target: 'DUTY', shortest: 7 }],
    ['endpoint-2513', { start: 'EMIR', target: 'SLAP', shortest: 15 }]
  ] as const)('pins seed %j without normalization', (seed, expected) => {
    expect(generate(seed)).toEqual(expected);
  });

  it('chooses disjoint-letter dictionary endpoints with the true shortest distance', () => {
    const pairs = new Set<string>();
    for (let index = 0; index < 64; index += 1) {
      const seed = `connectivity-${index}`;
      const puzzle = generate(seed);
      expect(generate(seed)).toEqual(puzzle);
      expect(isWord(puzzle.start) && isWord(puzzle.target)).toBe(true);
      expect([...puzzle.start].every((letter) => !puzzle.target.includes(letter))).toBe(true);
      expect(puzzle.shortest).toBeGreaterThanOrEqual(4);
      const path = shortestPath(puzzle.start, puzzle.target);
      expect(path).not.toBeNull();
      expect(path?.length).toBe(puzzle.shortest);
      expect(validateSave(save({ steps: path! }), puzzle)).not.toBeNull();
      pairs.add(`${puzzle.start}/${puzzle.target}`);
    }
    expect(pairs.size).toBeGreaterThan(50);
  });
});

describe('moves and completion', () => {
  it.each([['COLD', 'CORD'], ['CORD', 'COLD'], ['CARD', 'WARD'], ['WARD', 'WARM']])(
    'accepts one changed letter: %s → %s',
    (current, next) => expect(moveError(current, next)).toBeNull()
  );

  it.each(['', 'C', 'COL', 'COLDS', 'cold', 'CORD\n', 'C0RD', 'CÖRD', 'ZZZZ', 'COLD', 'CARD', 'WARM'])(
    'rejects malformed, unknown, unchanged or multi-letter moves: %j',
    (next) => expect(moveError('COLD', next)).not.toBeNull()
  );

  it('rejects an invalid current word instead of normalizing it', () => {
    expect(moveError('cold', 'CORD')).not.toBeNull();
  });

  it('completes exactly at the destination', () => {
    expect(isSolved(coldWarm, [])).toBe(false);
    expect(isSolved(coldWarm, solution.slice(0, -1))).toBe(false);
    expect(isSolved(coldWarm, solution)).toBe(true);
  });
});

describe('puzzle-aware save validation', () => {
  it('restores untouched, draft, and completed states', () => {
    for (const value of [
      save(), save({ draft: 'WA' }),
      save({ steps: ['CORD', 'CARD'], draft: 'WARD' }), save({ steps: solution })
    ]) expect(validateSave(value, coldWarm)).toEqual(value);
  });

  it('permits repeats and has no move limit', () => {
    const steps = Array.from({ length: 1000 }, (_, index) => index % 2 === 0 ? 'CORD' : 'COLD');
    const value = save({ steps: [...steps, ...solution] });
    expect(validateSave(value, coldWarm)).toEqual(value);
    expect(isSolved(coldWarm, value.steps)).toBe(true);
  });

  it('copies accepted steps instead of retaining the storage object', () => {
    const value = save({ steps: ['CORD'] });
    const parsed = validateSave(value, coldWarm)!;
    value.steps.push('ZZZZ');
    expect(parsed.steps).toEqual(['CORD']);
  });

  it.each([
    null, false, 1, 'save', [], {},
    { version: 2, steps: [], draft: '' },
    { version: 1, steps: null, draft: '' },
    save({ steps: ['COLD'] }), save({ steps: ['CARD'] }),
    save({ steps: ['CORD', 'CARD', 'COLD'] }), save({ steps: ['cord'] }),
    save({ steps: ['ZZZZ'] }), save({ steps: [null] } as unknown as Partial<Save>),
    save({ steps: solution, draft: 'A' }),
    save({ steps: [...solution, 'WARD'] }),
    save({ draft: 'ABCDE' }), save({ draft: 'a' }), save({ draft: 'É' }),
    save({ draft: 'A\n' }), save({ draft: '\n' }), save({ draft: ' ' }),
    save({ draft: 1 } as unknown as Partial<Save>)
  ])('rejects malformed or unreachable records: %j', (value) => {
    expect(validateSave(value, coldWarm)).toBeNull();
  });

  it('rejects a valid-looking chain belonging to a different puzzle', () => {
    expect(validateSave(save({ steps: ['CORD', 'CARD'] }), {
      start: 'WARM', target: 'COLD', shortest: 4
    })).toBeNull();
  });
});
