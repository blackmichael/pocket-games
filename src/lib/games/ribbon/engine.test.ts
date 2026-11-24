import { describe, expect, it } from 'vitest';
import { CELL_COUNT, SAVE_VERSION, SIZE, generate, hasBarrier, isSolved, move, validateSave, type Puzzle } from './engine';

const perimeterRows = [
  0, 6, 12, 18, 24, 30, 31, 32, 33, 34, 35, 29,
  28, 27, 26, 25, 19, 20, 21, 22, 23, 17, 16, 15,
  14, 13, 7, 8, 9, 10, 11, 5, 4, 3, 2, 1,
];
const perimeterColumns = [
  0, 6, 12, 18, 24, 30, 31, 25, 19, 13, 7, 8,
  14, 20, 26, 32, 33, 27, 21, 15, 9, 10, 16, 22,
  28, 34, 35, 29, 23, 17, 11, 5, 4, 3, 2, 1,
];
const endpointsOnly: Puzzle = {
  checkpoints: Array.from({ length: CELL_COUNT }, (_, cell) => cell === 0 ? 1 : cell === 1 ? 2 : 0),
  solution: perimeterRows,
  barriers: [],
};
const ordered: Puzzle = {
  checkpoints: Array.from({ length: CELL_COUNT }, (_, cell) => cell === 0 ? 1 : cell === 6 ? 2 : cell === 1 ? 3 : 0),
  solution: perimeterRows,
  barriers: [],
};
const walled: Puzzle = { ...endpointsOnly, barriers: [[7, 8]] };

/** Compare path geometry under all eight board symmetries and path reversal. */
function canonicalPath(path: readonly number[]): string {
  const forms: string[] = [];
  for (let reflection = 0; reflection < 2; reflection += 1) {
    for (let rotations = 0; rotations < 4; rotations += 1) {
      const transformed = path.map((cell) => {
        let row = Math.floor(cell / SIZE);
        let column = cell % SIZE;
        if (reflection) column = SIZE - 1 - column;
        for (let turn = 0; turn < rotations; turn += 1) {
          const previousRow = row;
          row = column;
          column = SIZE - 1 - previousRow;
        }
        return row * SIZE + column;
      });
      forms.push(transformed.join(','), transformed.reverse().join(','));
    }
  }
  return forms.sort()[0];
}

/** Independent rule-only enumeration, with a hard ceiling rather than a timeout. */
function countRoutes(puzzle: Puzzle): { count: number; complete: boolean } {
  const neighbors = Array.from({ length: CELL_COUNT }, (_, cell) =>
    Array.from({ length: CELL_COUNT }, (_, next) => next).filter((next) =>
      Math.abs(Math.floor(cell / SIZE) - Math.floor(next / SIZE)) + Math.abs(cell % SIZE - next % SIZE) === 1
      && !puzzle.barriers.some(([first, second]) =>
        (first === cell && second === next) || (first === next && second === cell),
      ),
    ),
  );
  const visited = new Set<number>();
  const last = Math.max(...puzzle.checkpoints);
  let count = 0;
  let nodes = 0;
  let complete = true;
  function visit(cell: number, expected: number): void {
    if (count >= 2 || !complete) return;
    if (++nodes > 500_000) {
      complete = false;
      return;
    }
    const checkpoint = puzzle.checkpoints[cell];
    if (checkpoint && checkpoint !== expected) return;
    if (checkpoint === last && visited.size !== CELL_COUNT - 1) return;
    if (checkpoint) expected += 1;
    visited.add(cell);
    if (visited.size === CELL_COUNT) {
      if (expected === last + 1) count += 1;
    } else {
      // Every remaining square must still be reachable from the current head.
      const reachable = new Set([cell]);
      const queue = [cell];
      for (let index = 0; index < queue.length; index += 1) {
        for (const next of neighbors[queue[index]]) {
          if (!visited.has(next) && !reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }
      if (reachable.size === CELL_COUNT - visited.size + 1) {
        for (const next of neighbors[cell]) if (!visited.has(next)) visit(next, expected);
      }
    }
    visited.delete(cell);
  }
  visit(puzzle.checkpoints.indexOf(1), 1);
  return { count, complete };
}

function expectWitness(puzzle: Puzzle): void {
  expect(puzzle.checkpoints).toHaveLength(CELL_COUNT);
  expect([...puzzle.solution].sort((a, b) => a - b)).toEqual(Array.from({ length: CELL_COUNT }, (_, cell) => cell));
  const labels = puzzle.solution.map((cell) => puzzle.checkpoints[cell]).filter(Boolean);
  expect(labels).toEqual(Array.from({ length: labels.length }, (_, index) => index + 1));
  expect(puzzle.checkpoints[puzzle.solution[0]]).toBe(1);
  expect(puzzle.checkpoints[puzzle.solution[CELL_COUNT - 1]]).toBe(labels.length);
  for (let index = 1; index < CELL_COUNT; index += 1) {
    const first = puzzle.solution[index - 1];
    const second = puzzle.solution[index];
    expect(Math.abs(Math.floor(first / SIZE) - Math.floor(second / SIZE)) + Math.abs(first % SIZE - second % SIZE)).toBe(1);
    expect(hasBarrier(puzzle, first, second)).toBe(false);
  }
  let path: number[] = [];
  for (const cell of puzzle.solution) {
    const result = move(puzzle, path, cell);
    expect(result.error).toBeNull();
    path = result.path;
  }
  expect(isSolved(puzzle, path)).toBe(true);
}

describe('Ribbon v1 generation', () => {
  const countVectors = [
    { seed: 'thread-count-9', count: 0 },
    { seed: 'thread-count-2', count: 1 },
    { seed: 'thread-count-1', count: 2 },
    { seed: 'thread-count-5', count: 3 },
    { seed: 'thread-count-0', count: 4 },
    { seed: 'thread-count-8', count: 5 },
    { seed: 'thread-count-16', count: 6 },
    { seed: 'thread-count-3', count: 7 },
    { seed: 'thread-count-12', count: 8 },
  ];

  it.each([
    {
      seed: '',
      solution: [25, 19, 20, 26, 32, 31, 30, 24, 18, 12, 6, 0, 1, 7, 13, 14, 15, 21, 27, 33, 34, 35, 29, 28, 22, 23, 17, 11, 5, 4, 3, 2, 8, 9, 10, 16],
      checkpoints: [0, 4, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 2, 0, 0, 0, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
      barriers: [[3, 9], [10, 11], [13, 19], [16, 17], [16, 22], [23, 29], [25, 26]],
    },
    {
      seed: 'thread-vector-雪',
      solution: [28, 34, 35, 29, 23, 22, 21, 15, 16, 17, 11, 5, 4, 10, 9, 3, 2, 1, 0, 6, 12, 13, 7, 8, 14, 20, 19, 18, 24, 30, 31, 32, 33, 27, 26, 25],
      checkpoints: [0, 0, 0, 0, 0, 2, 0, 0, 5, 3, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      barriers: [[13, 14], [14, 15], [17, 23], [20, 26], [24, 25], [25, 31], [26, 32]],
    },
  ])('freezes the complete v1 board for seed "$seed"', ({ seed, solution, checkpoints, barriers }) => {
    expect(generate(seed)).toEqual({ solution, checkpoints, barriers });
  });

  it.each(countVectors)('maps "$seed" to exactly $count barriers', ({ seed, count }) => {
    expect(generate(seed).barriers).toHaveLength(count);
  });

  it('produces every count from zero through eight across deterministic samples', () => {
    const counts = new Set<number>();
    for (let index = 0; index < 64; index += 1) {
      const puzzle = generate(`thread-count-${index}`);
      expect(puzzle.barriers.length).toBeGreaterThanOrEqual(0);
      expect(puzzle.barriers.length).toBeLessThanOrEqual(8);
      counts.add(puzzle.barriers.length);
    }
    expect([...counts].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('constructs legal ordered witnesses and distinct sorted canonical non-witness walls', () => {
    for (let index = 0; index < 64; index += 1) {
      const puzzle = generate(`thread-count-${index}`);
      expectWitness(puzzle);
      expect(new Set(puzzle.barriers.map((barrier) => barrier.join(','))).size).toBe(puzzle.barriers.length);
      expect(puzzle.barriers).toEqual([...puzzle.barriers].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
      for (const [first, second] of puzzle.barriers) {
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(second);
        expect(second).toBeLessThan(CELL_COUNT);
        expect(Math.abs(Math.floor(first / SIZE) - Math.floor(second / SIZE)) + Math.abs(first % SIZE - second % SIZE)).toBe(1);
        expect(Math.abs(puzzle.solution.indexOf(first) - puzzle.solution.indexOf(second))).not.toBe(1);
        expect(hasBarrier(puzzle, first, second)).toBe(true);
        expect(hasBarrier(puzzle, second, first)).toBe(true);
      }
    }
  });

  it('is independent of call order, output mutation, trimming, and normalization', () => {
    const expected = generate(' thread-雪 ');
    const mutated = generate(' thread-雪 ');
    mutated.checkpoints.fill(99);
    mutated.solution.reverse();
    mutated.barriers.splice(0);
    generate('other');
    expect(generate(' thread-雪 ')).toEqual(expected);
    expect(generate('thread-雪')).not.toEqual(expected);
    expect(generate('é')).not.toEqual(generate('e\u0301'));
    expect(generate('')).not.toEqual(generate(' '));
  });

  it('varies path geometry beyond rotations, reflections, and reversal', () => {
    const geometries = new Set<string>();
    for (let index = 0; index < 64; index += 1) {
      geometries.add(canonicalPath(generate(`thread-diversity-${index}`).solution));
    }
    expect(geometries.size).toBeGreaterThanOrEqual(48);
  });

  it('independently detects ambiguous boards rather than trusting the stored witness', () => {
    expect(countRoutes(endpointsOnly)).toEqual({ count: 2, complete: true });
  });

  it.each(countVectors)('independently proves the $count-barrier board "$seed" unique, including zero walls', ({ seed }) => {
    expect(countRoutes(generate(seed))).toEqual({ count: 1, complete: true });
  });

  it('enforces generated walls in moves and save validation without blocking legal witness progress', () => {
    const puzzle = generate('thread-count-12');
    for (const [first, second] of puzzle.barriers) {
      const firstIndex = puzzle.solution.indexOf(first);
      const secondIndex = puzzle.solution.indexOf(second);
      const path = puzzle.solution.slice(0, Math.min(firstIndex, secondIndex) + 1);
      const target = puzzle.solution[Math.max(firstIndex, secondIndex)];
      expect(move(puzzle, path, target)).toEqual({ path, error: expect.stringMatching(/barrier/i) });
      expect(validateSave({ version: SAVE_VERSION, path, elapsedMs: 1234 }, puzzle)?.path).toEqual(path);
      expect(validateSave({ version: SAVE_VERSION, path: [...path, target], elapsedMs: 1234 }, puzzle)).toBeNull();
      expect(validateSave({ version: 1, path: [...path, target] }, puzzle)).toBeNull();
    }
  });
});

describe('Ribbon moves', () => {
  it('starts only at checkpoint 1 and extends orthogonally', () => {
    expect(move(ordered, [], 6).error).not.toBeNull();
    expect(move(ordered, [], 0)).toEqual({ path: [0], error: null });
    expect(move(ordered, [0], 6)).toEqual({ path: [0, 6], error: null });
    expect(move(ordered, [0], 7).error).not.toBeNull();
    expect(move(ordered, [0, 6, 7, 8, 9, 10, 11], 12).error).not.toBeNull();
  });

  it.each([-1, CELL_COUNT, 1.5, NaN, Infinity])('rejects out-of-bounds cell %s without changing input', (cell) => {
    const path = [0, 6];
    expect(move(ordered, path, cell)).toEqual({ path, error: expect.any(String) });
    expect(path).toEqual([0, 6]);
  });

  it('rejects skipped checkpoints and premature arrival at the final checkpoint', () => {
    expect(move(ordered, [0], 1)).toEqual({ path: [0], error: expect.any(String) });
    expect(move(ordered, [0, 6, 7], 1)).toEqual({ path: [0, 6, 7], error: expect.any(String) });
    expect(move(endpointsOnly, [0], 1).error).not.toBeNull();
  });

  it('truncates to any already visited cell, including across checkpoints', () => {
    const path = [0, 6, 7, 8];
    expect(move(ordered, path, 6)).toEqual({ path: [0, 6], error: null });
    expect(move(ordered, path, 0)).toEqual({ path: [0], error: null });
    expect(move(ordered, path, 8)).toEqual({ path, error: null });
    expect(path).toEqual([0, 6, 7, 8]);
    expect(move(ordered, move(ordered, path, 0).path, 6).error).toBeNull();
  });

  it('rejects wall crossings in either direction without changing the path', () => {
    const forwards = [0, 6, 7];
    const backwards = [0, 6, 12, 13, 14, 8];
    expect(move(walled, forwards, 8)).toEqual({ path: forwards, error: expect.any(String) });
    expect(move(walled, backwards, 7)).toEqual({ path: backwards, error: expect.any(String) });
    expect(forwards).toEqual([0, 6, 7]);
    expect(backwards).toEqual([0, 6, 12, 13, 14, 8]);
    expect(hasBarrier(walled, 0, 6)).toBe(false);
    expect(hasBarrier(walled, 7, 7)).toBe(false);
  });

  it('allows detours and rewinds rather than treating rewind as a wall-crossing shortcut', () => {
    let path = [0, 6, 7];
    for (const cell of [13, 14, 8]) {
      const result = move(walled, path, cell);
      expect(result.error).toBeNull();
      path = result.path;
    }
    expect(move(walled, path, 7)).toEqual({ path: [0, 6, 7], error: null });
    expect(move(walled, path, 0)).toEqual({ path: [0], error: null });
    expect(move(walled, path, 9)).toEqual({ path: [...path, 9], error: null });
  });

  it('accepts completion by rules and rejects every edit after completion', () => {
    const almost = perimeterColumns.slice(0, -1);
    const completed = move(endpointsOnly, almost, 1);
    expect(completed).toEqual({ path: perimeterColumns, error: null });
    expect(move(endpointsOnly, completed.path, 0)).toEqual({ path: perimeterColumns, error: expect.any(String) });
    expect(move(endpointsOnly, completed.path, 1).error).not.toBeNull();
    expect(move(ordered, [0, 7], 8).error).not.toBeNull();
  });
});

describe('Ribbon completion', () => {
  it('accepts a legal alternate route, not just the construction witness', () => {
    expect(perimeterColumns).not.toEqual(endpointsOnly.solution);
    expect(isSolved(endpointsOnly, perimeterRows)).toBe(true);
    expect(isSolved(endpointsOnly, perimeterColumns)).toBe(true);
    expect(isSolved({ ...endpointsOnly, solution: [] }, perimeterColumns)).toBe(true);
  });

  it('accepts all legal wall-respecting solutions without comparing the stored witness', () => {
    const puzzle: Puzzle = { ...endpointsOnly, barriers: [[1, 7]] };
    expect(isSolved(puzzle, perimeterRows)).toBe(true);
    expect(isSolved(puzzle, perimeterColumns)).toBe(true);
    expect(isSolved({ ...puzzle, solution: [] }, perimeterColumns)).toBe(true);
    expect(move(puzzle, perimeterColumns.slice(0, -1), 1)).toEqual({ path: perimeterColumns, error: null });
  });

  it('rejects full routes crossing a wall even when they match the construction witness', () => {
    expect(isSolved(walled, perimeterRows)).toBe(false);
    expect(isSolved(walled, perimeterColumns)).toBe(false);
    expect(move(walled, perimeterRows.slice(0, -1), 1).error).not.toBeNull();
  });

  it('rejects partial, repeated, nonadjacent, reversed, and checkpoint-disordered paths', () => {
    expect(isSolved(ordered, [])).toBe(false);
    expect(isSolved(ordered, perimeterRows.slice(0, -1))).toBe(false);
    expect(isSolved(ordered, [...perimeterRows.slice(0, -1), 0])).toBe(false);
    const jumped = [...perimeterRows];
    [jumped[4], jumped[5]] = [jumped[5], jumped[4]];
    expect(isSolved(ordered, jumped)).toBe(false);
    expect(isSolved(ordered, [...perimeterRows].reverse())).toBe(false);
    const wrongOrder: Puzzle = { ...ordered, checkpoints: [...ordered.checkpoints] };
    wrongOrder.checkpoints[6] = 3;
    wrongOrder.checkpoints[1] = 2;
    expect(isSolved(wrongOrder, perimeterRows)).toBe(false);
  });
});

describe('Ribbon saves', () => {
  it('preserves a legal dead end so the player can undo instead of losing progress', () => {
    const path = [0, 6, 12, 13, 14, 8, 7];
    expect(validateSave({ version: 2, path, elapsedMs: 1234 }, ordered)).toEqual({ version: 2, path, elapsedMs: 1234 });
    expect(move(ordered, path, 1).error).not.toBeNull();
    expect(move(ordered, path, 13)).toEqual({ path: [0, 6, 12, 13], error: null });
  });

  it('restores empty, partial, and alternate completed timed paths without retaining aliases', () => {
    for (const path of [[], [0], [0, 6, 7], perimeterColumns]) {
      const value = { version: SAVE_VERSION, path: [...path], elapsedMs: 1234 };
      const restored = validateSave(value, endpointsOnly);
      expect(restored).toEqual(value);
      expect(restored).not.toBe(value);
      expect(restored?.path).not.toBe(value.path);
      value.path.push(99);
      expect(restored?.path).toEqual(path);
    }
  });

  it('migrates legacy paths without inventing elapsed time, even for completed or one-cell progress', () => {
    for (const path of [[], [0], [0, 6, 7], perimeterColumns]) {
      const value = { version: 1, path: [...path] };
      const restored = validateSave(value, endpointsOnly);
      expect(restored).toEqual({ version: SAVE_VERSION, path, elapsedMs: path.length === 0 ? 0 : null });
      expect(restored?.path).not.toBe(value.path);
      value.path.push(99);
      expect(restored?.path).toEqual(path);
      expect(validateSave(restored, endpointsOnly)).toEqual(restored);
    }
    expect(validateSave({ version: 1, path: [0], elapsedMs: 9876 }, endpointsOnly)?.elapsedMs).toBeNull();
    const deadEnd = [0, 6, 12, 13, 14, 8, 7];
    expect(validateSave({ version: 1, path: deadEnd }, ordered)).toEqual({ version: 2, path: deadEnd, elapsedMs: null });
  });

  it('keeps explicitly unrecorded timing for every legal path rather than fabricating a finish time', () => {
    for (const path of [[], [0], [0, 6, 7], perimeterColumns]) {
      expect(validateSave({ version: 2, path, elapsedMs: null }, endpointsOnly)).toEqual({
        version: 2, path, elapsedMs: null,
      });
    }
    expect(validateSave({ version: 2, path: [0, 7], elapsedMs: null }, endpointsOnly)).toBeNull();
  });

  it('accepts finite nonnegative safe integer elapsed durations', () => {
    for (const elapsedMs of [0, 1, 1234, Number.MAX_SAFE_INTEGER]) {
      for (const path of [[], [0, 6, 7], perimeterColumns]) {
        expect(validateSave({ version: 2, path, elapsedMs }, endpointsOnly)).toEqual({ version: 2, path, elapsedMs });
      }
    }
  });

  it.each([undefined, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '1234', true, {}, []].map((elapsedMs) => ({ elapsedMs })))(
    'rejects malformed or unsafe elapsed duration $elapsedMs', ({ elapsedMs }) => {
      for (const path of [[], [0, 6, 7], perimeterColumns]) {
        expect(validateSave({ version: 2, path, elapsedMs }, endpointsOnly)).toBeNull();
      }
    },
  );

  it('enforces walls for partial and completed saves in both formats', () => {
    const detour = [0, 6, 7, 13, 14, 8];
    for (const version of [1, 2]) {
      expect(validateSave({ version, path: [], elapsedMs: 1234 }, walled)).toEqual({
        version: 2, path: [], elapsedMs: version === 1 ? 0 : 1234,
      });
      expect(validateSave({ version, path: detour, elapsedMs: 1234 }, walled)).toEqual({
        version: 2, path: detour, elapsedMs: version === 1 ? null : 1234,
      });
      for (const path of [[0, 6, 7, 8], [0, 6, 12, 13, 14, 8, 7], perimeterRows, perimeterColumns]) {
        expect(validateSave({ version, path, elapsedMs: 1234 }, endpointsOnly)).not.toBeNull();
        expect(validateSave({ version, path, elapsedMs: 1234 }, walled)).toBeNull();
      }
      const alternate: Puzzle = { ...endpointsOnly, barriers: [[1, 7]] };
      expect(validateSave({ version, path: perimeterColumns, elapsedMs: 1234 }, alternate)).toEqual({
        version: 2, path: perimeterColumns, elapsedMs: version === 1 ? null : 1234,
      });
    }
  });

  it('restores legal legacy and timed witness progress against the current generated puzzle', () => {
    const puzzle = generate('thread-save');
    for (const path of [puzzle.solution.slice(0, 12), puzzle.solution]) {
      expect(validateSave({ version: 1, path }, puzzle)).toEqual({ version: 2, path, elapsedMs: null });
      expect(validateSave({ version: 2, path, elapsedMs: 1234 }, puzzle)).toEqual({ version: 2, path, elapsedMs: 1234 });
    }
  });

  it.each([
    null, undefined, [], 'save', 1, {}, { version: 2, path: [] }, { version: 1 },
    { version: 0, path: [] }, { version: 3, path: [], elapsedMs: 0 },
    { version: '2', path: [], elapsedMs: 0 }, { version: 2, elapsedMs: 0 },
  ])('rejects malformed save records %#', (value) => {
    expect(validateSave(value, ordered)).toBeNull();
  });

  it.each([
    '0,6', [6], [0, 0], [0, 7], [0, 6, '7'], [0, NaN], [0, Infinity],
    [0, -1], [0, 36], [0, 6.5], [0, null], [0, 1], Array(37).fill(0), Array(1),
  ].map((path) => ({ path })))('rejects malformed or rule-breaking paths %# in either save version', ({ path }) => {
    expect(validateSave({ version: 1, path }, ordered)).toBeNull();
    expect(validateSave({ version: 2, path, elapsedMs: 1234 }, ordered)).toBeNull();
  });

  it('checks checkpoint order and final-checkpoint arrival against the specific puzzle', () => {
    for (const version of [1, 2]) {
      const value = { version, path: [0, 6, 7], elapsedMs: 1234 };
      expect(validateSave(value, ordered)).not.toBeNull();
      const different: Puzzle = { ...ordered, checkpoints: [...ordered.checkpoints] };
      different.checkpoints[6] = 3;
      different.checkpoints[1] = 2;
      expect(validateSave(value, different)).toBeNull();
      expect(validateSave({ version, path: [0, 6, 7, 1], elapsedMs: 1234 }, ordered)).toBeNull();
    }
  });
});
