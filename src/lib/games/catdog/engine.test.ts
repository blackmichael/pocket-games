import { describe, expect, it } from 'vitest';
import { chooseHintCell, conflictingCells, generate, isSolved, parseSavedGame, SAVE_VERSION, SIZE, type Cell, type Clue, type Puzzle } from './engine';

const CELLS = SIZE * SIZE;
const blank = (): Cell[] => Array<Cell>(CELLS).fill(0);
const cells = (text: string): Cell[] => [...text].map((value) => Number(value) as Cell);
const legal = cells('112122221211112122221211112122221211');
const unrestricted = (): Puzzle => ({ givens: blank(), clues: [], solution: [...legal] });

const v1Vectors = [
  {
    seed: '',
    givens: '000002000000000000000000000000002100',
    solution: '121212212211122121211212221121112122',
    clues: [
      { a: 22, b: 23, same: false }, { a: 5, b: 11, same: false },
      { a: 34, b: 35, same: true }, { a: 16, b: 22, same: false },
      { a: 14, b: 15, same: false }, { a: 7, b: 13, same: false },
      { a: 13, b: 19, same: false }, { a: 27, b: 33, same: true },
      { a: 22, b: 28, same: false }, { a: 8, b: 14, same: true },
    ],
  },
  {
    seed: 'fixed-seed',
    givens: '020100000020000020000000020000000000',
    solution: '122112212121211221122112121221211212',
    clues: [
      { a: 23, b: 29, same: false }, { a: 8, b: 14, same: false },
      { a: 13, b: 14, same: true }, { a: 21, b: 22, same: true },
      { a: 18, b: 24, same: true }, { a: 22, b: 23, same: false },
      { a: 4, b: 5, same: false }, { a: 27, b: 28, same: true },
    ],
  },
  {
    seed: '日月☀️🌙',
    givens: '000001000001002000000010000000000000',
    solution: '211221122121112212221211121122212112',
    clues: [
      { a: 25, b: 31, same: false }, { a: 6, b: 7, same: false },
      { a: 2, b: 3, same: false }, { a: 17, b: 23, same: false },
      { a: 10, b: 11, same: false }, { a: 14, b: 20, same: false },
      { a: 1, b: 2, same: true }, { a: 24, b: 30, same: false },
    ],
  },
];

const v2Vectors = [
  {
    seed: '',
    givens: '100000100010000010000000000001000000',
    solution: '122121121212212112122121211221211212',
    clues: [
      { a: 13, b: 19, same: false }, { a: 14, b: 15, same: false },
      { a: 7, b: 8, same: false }, { a: 12, b: 18, same: false },
      { a: 9, b: 15, same: false }, { a: 27, b: 33, same: true },
      { a: 26, b: 32, same: true }, { a: 19, b: 20, same: true },
    ],
  },
  {
    seed: 'fixed-seed',
    givens: '000001000000000020000002000000000000',
    solution: '212121221211112122211212121221122112',
    clues: [
      { a: 25, b: 31, same: true }, { a: 6, b: 12, same: false },
      { a: 21, b: 27, same: true }, { a: 1, b: 7, same: false },
      { a: 30, b: 31, same: false }, { a: 19, b: 20, same: true },
      { a: 0, b: 6, same: true }, { a: 8, b: 9, same: false },
    ],
  },
  {
    seed: '日月☀️🌙',
    givens: '000202000000010200000002000001000000',
    solution: '121212122121212211121122212121211212',
    clues: [
      { a: 8, b: 9, same: false }, { a: 26, b: 32, same: false },
      { a: 24, b: 25, same: false }, { a: 0, b: 6, same: true },
      { a: 31, b: 32, same: true }, { a: 20, b: 26, same: false },
    ],
  },
  {
    seed: '\ud800',
    givens: '010000000000000000000020000020200200',
    solution: '212121122112211212122121121221211212',
    clues: [
      { a: 11, b: 17, same: true }, { a: 10, b: 11, same: false },
      { a: 4, b: 10, same: false }, { a: 34, b: 35, same: false },
      { a: 25, b: 26, same: false }, { a: 15, b: 16, same: false },
      { a: 7, b: 13, same: false },
    ],
  },
  {
    seed: 'sample-37',
    givens: '010100000000010202011010000000100010',
    solution: '212121122121211212211212122121121212',
    clues: [{ a: 6, b: 7, same: false }, { a: 6, b: 12, same: false }],
  },
];

/** Independent cell-by-cell search: deliberately does not reuse engine row masks. */
function completions(puzzle: Puzzle, limit = 2): Cell[][] {
  const board = blank();
  const rowCounts = Array.from({ length: SIZE }, () => [0, 0, 0]);
  const columnCounts = Array.from({ length: SIZE }, () => [0, 0, 0]);
  const cluesAt = Array.from({ length: CELLS }, () => [] as Clue[]);
  for (const clue of puzzle.clues) {
    cluesAt[clue.a].push(clue);
    cluesAt[clue.b].push(clue);
  }
  const found: Cell[][] = [];
  function visit(cell: number): void {
    if (cell === CELLS) {
      found.push([...board]);
      return;
    }
    const row = Math.floor(cell / SIZE);
    const column = cell % SIZE;
    const given = puzzle.givens[cell];
    for (const value of [1, 2] as const) {
      if (given !== 0 && given !== value) continue;
      if (rowCounts[row][value] === SIZE / 2 || columnCounts[column][value] === SIZE / 2) continue;
      if (column >= 2 && board[cell - 1] === value && board[cell - 2] === value) continue;
      if (row >= 2 && board[cell - SIZE] === value && board[cell - 2 * SIZE] === value) continue;
      let valid = true;
      for (const clue of cluesAt[cell]) {
        const peer = clue.a === cell ? clue.b : clue.a;
        if (board[peer] !== 0 && (board[peer] === value) !== clue.same) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      board[cell] = value;
      rowCounts[row][value] += 1;
      columnCounts[column][value] += 1;
      visit(cell + 1);
      columnCounts[column][value] -= 1;
      rowCounts[row][value] -= 1;
      board[cell] = 0;
      if (found.length >= limit) return;
    }
  }
  visit(0);
  return found;
}

function transformCell(cell: number, reflection: number, turns: number): number {
  let row = Math.floor(cell / SIZE);
  let column = reflection ? SIZE - 1 - cell % SIZE : cell % SIZE;
  for (let turn = 0; turn < turns; turn += 1) [row, column] = [column, SIZE - 1 - row];
  return row * SIZE + column;
}

/** Normalize the solution, or the actual clues/givens, over D4 and symbol swap. */
function canonical(puzzle: Puzzle, layout: boolean): string {
  let minimum: string | undefined;
  for (let reflection = 0; reflection < 2; reflection += 1) {
    for (let turns = 0; turns < 4; turns += 1) {
      for (let swap = 0; swap < 2; swap += 1) {
        const board = blank();
        const source = layout ? puzzle.givens : puzzle.solution;
        for (let cell = 0; cell < CELLS; cell += 1) {
          const value = source[cell];
          board[transformCell(cell, reflection, turns)] = swap && value !== 0 ? (3 - value) as Cell : value;
        }
        const edges = layout ? puzzle.clues.map(({ a, b, same }) => {
          const first = transformCell(a, reflection, turns);
          const second = transformCell(b, reflection, turns);
          return `${Math.min(first, second)}:${Math.max(first, second)}:${Number(same)}`;
        }).sort().join(',') : '';
        const key = `${board.join('')}|${edges}`;
        if (minimum === undefined || key < minimum) minimum = key;
      }
    }
  }
  return minimum!;
}

describe('Catdog generator v1', () => {
  it.each(v1Vectors)('freezes every puzzle field for seed "$seed"', ({ seed, givens, solution, clues }) => {
    expect(generate(seed, 1)).toEqual({ givens: cells(givens), solution: cells(solution), clues });
  });

  it('constructs valid puzzles with exactly one independently enumerated completion', () => {
    const seeds = [...v1Vectors.map(({ seed }) => seed), ...Array.from({ length: 100 }, (_, index) => `sample-${index}`)];
    for (const seed of seeds) {
      const puzzle = generate(seed, 1);
      expect(puzzle.givens).toHaveLength(CELLS);
      expect(puzzle.solution).toHaveLength(CELLS);
      expect(puzzle.givens.some((value) => value !== 0)).toBe(true);
      expect(puzzle.givens.filter((value) => value !== 0).length).toBeLessThan(CELLS / 2);
      expect(puzzle.clues.length).toBeGreaterThanOrEqual(8);
      expect(puzzle.clues.length).toBeLessThanOrEqual(12);
      const edges = new Set<string>();
      for (const { a, b, same } of puzzle.clues) {
        expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(CELLS);
        expect(a).toBeLessThan(b);
        expect(b - a === SIZE || (b - a === 1 && Math.floor(a / SIZE) === Math.floor(b / SIZE))).toBe(true);
        expect(typeof same).toBe('boolean');
        expect(puzzle.solution[a] === puzzle.solution[b]).toBe(same);
        edges.add(`${a}:${b}`);
      }
      expect(edges.size).toBe(puzzle.clues.length);
      for (let cell = 0; cell < CELLS; cell += 1) {
        expect([0, 1, 2]).toContain(puzzle.givens[cell]);
        expect([1, 2]).toContain(puzzle.solution[cell]);
        if (puzzle.givens[cell] !== 0) expect(puzzle.givens[cell]).toBe(puzzle.solution[cell]);
      }
      for (let line = 0; line < SIZE; line += 1) {
        const row = puzzle.solution.slice(line * SIZE, (line + 1) * SIZE);
        const column = Array.from({ length: SIZE }, (_, index) => puzzle.solution[index * SIZE + line]);
        for (const values of [row, column]) {
          expect(values.filter((value) => value === 1)).toHaveLength(3);
          expect(values.filter((value) => value === 2)).toHaveLength(3);
          for (let offset = 0; offset < SIZE - 2; offset += 1) {
            expect(values[offset] === values[offset + 1] && values[offset] === values[offset + 2]).toBe(false);
          }
        }
      }
      expect(conflictingCells(puzzle.givens, puzzle)).toEqual([]);
      expect(isSolved(puzzle.givens, puzzle)).toBe(false);
      expect(isSolved(puzzle.solution, puzzle)).toBe(true);
      expect(completions(puzzle)).toEqual([puzzle.solution]);
    }
  });

  it('removes every individually redundant given without changing the relation clues', () => {
    for (const { seed } of v1Vectors) {
      const puzzle = generate(seed, 1);
      for (let cell = 0; cell < CELLS; cell += 1) {
        if (puzzle.givens[cell] === 0) continue;
        const givens = [...puzzle.givens];
        givens[cell] = 0;
        expect(completions({ ...puzzle, givens })).toHaveLength(2);
      }
    }
  });

  it('is independent of request order and returned data mutations', () => {
    const seeds = ['', ' ', 'seed', 'seed ', 'Seed', 'é', 'e\u0301', ...v1Vectors.map(({ seed }) => seed)];
    const expected = seeds.map((seed) => generate(seed, 1));
    for (let index = seeds.length - 1; index >= 0; index -= 1) {
      const puzzle = generate(seeds[index], 1);
      expect(puzzle).toEqual(expected[index]);
      puzzle.givens.fill(2);
      puzzle.solution.fill(0);
      puzzle.clues[0].same = !puzzle.clues[0].same;
      puzzle.clues.pop();
      expect(generate(seeds[index], 1)).toEqual(expected[index]);
    }
    expect(generate('seed', 1)).not.toEqual(generate('seed ', 1));
    expect(generate('é', 1)).not.toEqual(generate('e\u0301', 1));
  });

  it('varies solution and clue geometry beyond symbol swaps, rotations, and reflections', () => {
    const arrangements = new Set<string>();
    const solutionGeometry = new Set<string>();
    const puzzleGeometry = new Set<string>();
    const clueCounts = new Set<number>();
    for (let index = 0; index < 160; index += 1) {
      const puzzle = generate(`variety-${index}`, 1);
      arrangements.add(puzzle.solution.join(''));
      solutionGeometry.add(canonical(puzzle, false));
      puzzleGeometry.add(canonical(puzzle, true));
      clueCounts.add(puzzle.clues.length);
    }
    expect(arrangements.size).toBeGreaterThan(120);
    expect(solutionGeometry.size).toBeGreaterThan(60);
    expect(puzzleGeometry.size).toBeGreaterThan(140);
    expect(clueCounts.size).toBe(5);
  });
});

describe('Catdog generator v2', () => {
  it.each(v2Vectors)('freezes every puzzle field for seed "$seed" and defaults to v2', ({ seed, givens, solution, clues }) => {
    const expected = { givens: cells(givens), solution: cells(solution), clues };
    expect(generate(seed, 2)).toEqual(expected);
    expect(generate(seed)).toEqual(expected);
    expect(generate(seed, 1)).not.toEqual(expected);
  });

  it.each([null, 0, 3, -1, 1.5, NaN, Infinity, '1', '2', false])('rejects unsupported runtime version %s', (version) => {
    expect(() => generate('version', version as 1 | 2)).toThrow(RangeError);
  });

  it('keeps a unique independently enumerated completion with no relation touching a given', () => {
    const seeds = [...v2Vectors.map(({ seed }) => seed), ...Array.from({ length: 100 }, (_, index) => `sample-${index}`)];
    for (const seed of seeds) {
      const puzzle = generate(seed, 2);
      expect(puzzle.givens).toHaveLength(CELLS);
      expect(puzzle.solution).toHaveLength(CELLS);
      const givenCount = puzzle.givens.filter((value) => value !== 0).length;
      expect(givenCount).toBeGreaterThan(0);
      expect(givenCount).toBeLessThan(CELLS);
      expect(puzzle.clues.length).toBeLessThanOrEqual(12);
      const edges = new Set<string>();
      for (const { a, b, same } of puzzle.clues) {
        expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(CELLS);
        expect(a).toBeLessThan(b);
        expect(b - a === SIZE || (b - a === 1 && Math.floor(a / SIZE) === Math.floor(b / SIZE))).toBe(true);
        expect(typeof same).toBe('boolean');
        expect(puzzle.givens[a]).toBe(0);
        expect(puzzle.givens[b]).toBe(0);
        expect(puzzle.solution[a] === puzzle.solution[b]).toBe(same);
        edges.add(`${a}:${b}`);
      }
      expect(edges.size).toBe(puzzle.clues.length);
      for (let cell = 0; cell < CELLS; cell += 1) {
        expect([0, 1, 2]).toContain(puzzle.givens[cell]);
        expect([1, 2]).toContain(puzzle.solution[cell]);
        if (puzzle.givens[cell] !== 0) expect(puzzle.givens[cell]).toBe(puzzle.solution[cell]);
      }
      // This solver checks balance, triples, givens and relations independently.
      expect(completions(puzzle)).toEqual([puzzle.solution]);
      expect(conflictingCells(puzzle.givens, puzzle)).toEqual([]);
      expect(isSolved(puzzle.givens, puzzle)).toBe(false);
      expect(isSolved(puzzle.solution, puzzle)).toBe(true);
    }
  });

  it('minimizes the propagated givens against only the surviving relations', () => {
    for (const { seed } of v2Vectors) {
      const puzzle = generate(seed, 2);
      for (let cell = 0; cell < CELLS; cell += 1) {
        if (puzzle.givens[cell] === 0) continue;
        const givens = [...puzzle.givens];
        givens[cell] = 0;
        expect(completions({ ...puzzle, givens })).toHaveLength(2);
      }
    }
  });

  it('isolates versions, exact UTF-16 seeds, request order and returned mutations', () => {
    const seeds = ['', ' ', 'seed', 'seed ', 'Seed', '\0', 'é', 'e\u0301', '\ud800', '\ufffd', ...v2Vectors.map(({ seed }) => seed)];
    const requests = seeds.flatMap((seed) => ([1, 2] as const).map((version) => ({ seed, version, expected: generate(seed, version) })));
    for (let index = requests.length - 1; index >= 0; index -= 1) {
      const { seed, version, expected } = requests[index];
      const puzzle = generate(seed, version);
      expect(puzzle).toEqual(expected);
      puzzle.givens.fill(2);
      puzzle.solution.fill(0);
      for (const clue of puzzle.clues) {
        clue.a = 35;
        clue.b = 0;
        clue.same = !clue.same;
      }
      puzzle.clues.length = 0;
      expect(generate(seed, version)).toEqual(expected);
      generate(seed, version === 1 ? 2 : 1).solution.fill(0);
      expect(generate(seed, version)).toEqual(expected);
    }
    for (const [a, b] of [['', ' '], ['', '\0'], ['seed', 'seed '], ['seed', 'Seed'], ['é', 'e\u0301'], ['\ud800', '\ufffd']]) {
      expect(generate(a, 2)).not.toEqual(generate(b, 2));
    }
  });

  it('varies actual solution and constraint geometry beyond symmetries and symbol swaps', () => {
    const arrangements = new Set<string>();
    const solutionGeometry = new Set<string>();
    const puzzleGeometry = new Set<string>();
    const clueCounts = new Set<number>();
    const givenCounts = new Set<number>();
    for (let index = 0; index < 160; index += 1) {
      const puzzle = generate(`variety-${index}`, 2);
      arrangements.add(puzzle.solution.join(''));
      solutionGeometry.add(canonical(puzzle, false));
      puzzleGeometry.add(canonical(puzzle, true));
      clueCounts.add(puzzle.clues.length);
      givenCounts.add(puzzle.givens.filter((value) => value !== 0).length);
    }
    expect(arrangements.size).toBeGreaterThan(120);
    expect(solutionGeometry.size).toBeGreaterThan(60);
    expect(puzzleGeometry.size).toBeGreaterThan(140);
    expect(clueCounts.size).toBeGreaterThan(3);
    expect(givenCounts.size).toBeGreaterThan(3);
  });

  it('plays and resumes propagated boards through the unchanged save format', () => {
    for (const { seed } of v2Vectors) {
      const puzzle = generate(seed, 2);
      const board = [...puzzle.givens];
      expect(SAVE_VERSION).toBe(1);
      for (let cell = 0; cell < CELLS; cell += 1) {
        if (puzzle.givens[cell] !== 0) continue;
        expect(isSolved(board, puzzle)).toBe(false);
        board[cell] = puzzle.solution[cell];
        expect(conflictingCells(board, puzzle)).toEqual([]);
        expect(parseSavedGame({ version: 1, board, elapsedMs: cell }, puzzle)?.board).toEqual(board);
      }
      expect(isSolved(board, puzzle)).toBe(true);
      const fixed = puzzle.givens.findIndex((value) => value !== 0);
      board[fixed] = 0;
      expect(parseSavedGame({ version: 1, board, elapsedMs: 100 }, puzzle)).toBeNull();
    }
  });
});

describe('Catdog hints', () => {
  it('can select every unresolved editable square, including incorrect filled entries', () => {
    const puzzle = unrestricted();
    puzzle.givens[0] = puzzle.solution[0];
    const board = [...puzzle.givens];
    board[2] = puzzle.solution[2];
    board[5] = puzzle.solution[5] === 1 ? 2 : 1;
    const eligible = Array.from({ length: CELLS }, (_, cell) => cell).filter((cell) => cell !== 0 && cell !== 2);
    const revealed = new Set(eligible.map((_, draw) => chooseHintCell(board, puzzle, draw)));
    expect(revealed).toEqual(new Set(eligible));
    expect(revealed.has(5)).toBe(true);
    expect(board[5]).not.toBe(puzzle.solution[5]);
  });

  it('finds the last wrong square on a full board for either end of the random draw range', () => {
    const puzzle = unrestricted();
    const board = [...puzzle.solution];
    board[35] = board[35] === 1 ? 2 : 1;
    expect(chooseHintCell(board, puzzle, 0)).toBe(35);
    expect(chooseHintCell(board, puzzle, 0xffff_ffff)).toBe(35);
    expect(isSolved(board, puzzle)).toBe(false);
  });

  it('does not offer or mutate already-correct entries', () => {
    const puzzle = unrestricted();
    const board = Object.freeze([...puzzle.solution]);
    expect(chooseHintCell(board, puzzle, 0)).toBeNull();
    expect(chooseHintCell(board, puzzle, 0xffff_ffff)).toBeNull();
    expect(board).toEqual(legal);
  });
});

describe('Catdog conflict feedback', () => {
  it('leaves blanks and legal partial placements unmarked', () => {
    const board = blank();
    expect(conflictingCells(board, unrestricted())).toEqual([]);
    board[0] = 1;
    board[1] = 1;
    board[2] = 2;
    board[3] = 2;
    expect(conflictingCells(board, unrestricted())).toEqual([]);
  });

  it.each([1, 2] as const)('marks every %s in an overquota row, not its other symbols', (value) => {
    const board = blank();
    for (const cell of [0, 1, 3, 5]) board[cell] = value;
    board[2] = value === 1 ? 2 : 1;
    expect(conflictingCells(board, unrestricted())).toEqual([0, 1, 3, 5]);
  });

  it.each([1, 2] as const)('marks every %s in an overquota column', (value) => {
    const board = blank();
    for (const cell of [0, 6, 18, 30]) board[cell] = value;
    board[12] = value === 1 ? 2 : 1;
    expect(conflictingCells(board, unrestricted())).toEqual([0, 6, 18, 30]);
  });

  it('marks horizontal and vertical triples through the last column and row', () => {
    const board = blank();
    for (const cell of [9, 10, 11]) board[cell] = 1;
    for (const cell of [23, 29, 35]) board[cell] = 2;
    expect(conflictingCells(board, unrestricted())).toEqual([9, 10, 11, 23, 29, 35]);
  });

  it('deduplicates overlapping triples and returns ascending cells', () => {
    const board = blank();
    for (const cell of [0, 1, 2, 3, 6, 12]) board[cell] = 1;
    expect(conflictingCells(board, unrestricted())).toEqual([0, 1, 2, 3, 6, 12]);
  });

  it('never treats a row wrap or a diagonal as adjacent', () => {
    const board = blank();
    for (const cell of [5, 6, 7, 14, 21]) board[cell] = 1;
    expect(conflictingCells(board, unrestricted())).toEqual([]);
  });

  it.each([true, false])('marks both endpoints of a filled violated same=%s clue', (same) => {
    const puzzle = unrestricted();
    puzzle.clues = [{ a: 0, b: 1, same }, { a: 29, b: 35, same }];
    const board = blank();
    board[0] = board[29] = 1;
    expect(conflictingCells(board, puzzle)).toEqual([]);
    board[1] = board[35] = same ? 2 : 1;
    expect(conflictingCells(board, puzzle)).toEqual([0, 1, 29, 35]);
    board[1] = board[35] = same ? 1 : 2;
    expect(conflictingCells(board, puzzle)).toEqual([]);
  });

  it('marks overwritten or erased givens and clears feedback after corrections', () => {
    const puzzle = unrestricted();
    puzzle.givens[0] = 1;
    puzzle.givens[35] = 2;
    const board = [...puzzle.givens];
    board[0] = 2;
    board[35] = 0;
    expect(conflictingCells(board, puzzle)).toEqual([0, 35]);
    board[0] = 1;
    board[35] = 2;
    expect(conflictingCells(board, puzzle)).toEqual([]);
  });
});

describe('Catdog completion', () => {
  it('accepts duplicate legal rows and columns and any rule-valid answer, not just the stored solution', () => {
    const puzzle = unrestricted();
    const alternative = legal.map((value): Cell => value === 1 ? 2 : 1);
    expect(isSolved(legal, puzzle)).toBe(true);
    expect(isSolved(alternative, puzzle)).toBe(true);
    expect(alternative).not.toEqual(puzzle.solution);
    puzzle.solution.fill(0);
    expect(isSolved(legal, puzzle)).toBe(true);
  });

  it('requires all 36 cells and valid symbols', () => {
    const puzzle = unrestricted();
    expect(isSolved(blank(), puzzle)).toBe(false);
    expect(isSolved(legal.slice(1), puzzle)).toBe(false);
    expect(isSolved([...legal, 1], puzzle)).toBe(false);
    const incomplete = [...legal];
    incomplete[35] = 0;
    expect(isSolved(incomplete, puzzle)).toBe(false);
    for (const value of [-1, 3, 1.5, NaN, Infinity, undefined, '1']) {
      const malformed = [...legal];
      malformed[0] = value as Cell;
      expect(isSolved(malformed, puzzle)).toBe(false);
    }
  });

  it('rejects full boards breaking balance, triples, relations, or givens', () => {
    const changed = [...legal];
    changed[0] = 2;
    expect(isSolved(changed, unrestricted())).toBe(false);
    const triples = cells('111222222111111222222111111222222111');
    expect(isSolved(triples, unrestricted())).toBe(false);
    const cluePuzzle = unrestricted();
    cluePuzzle.clues = [{ a: 0, b: 1, same: false }];
    expect(isSolved(legal, cluePuzzle)).toBe(false);
    const givenPuzzle = unrestricted();
    givenPuzzle.givens[0] = 2;
    expect(isSolved(legal, givenPuzzle)).toBe(false);
  });

  it('does not mutate inputs while reporting conflicts and completion', () => {
    const puzzle = generate('immutable-rules', 1);
    const before = JSON.stringify(puzzle);
    const board = Object.freeze([...puzzle.solution]);
    expect(conflictingCells(board, puzzle)).toEqual([]);
    expect(isSolved(board, puzzle)).toBe(true);
    expect(JSON.stringify(puzzle)).toBe(before);
  });
});

describe('Catdog save validation', () => {
  const puzzle = unrestricted();
  puzzle.givens[35] = 1;
  const save = (board = [...puzzle.givens], elapsedMs = 1234) => ({ version: SAVE_VERSION, board, elapsedMs });

  it('restores initial, conflicting, and solved drafts without treating mistakes as corruption', () => {
    expect(parseSavedGame(save(), puzzle)).toEqual(save());
    const conflict = [...puzzle.givens];
    for (const cell of [0, 1, 2, 3, 4]) conflict[cell] = 2;
    expect(conflictingCells(conflict, puzzle).length).toBeGreaterThan(0);
    expect(parseSavedGame(save(conflict, 0), puzzle)).toEqual(save(conflict, 0));
    expect(parseSavedGame(save([...legal]), puzzle)).toEqual(save([...legal]));
  });

  it('restores violated relation clues as editable drafts', () => {
    const related: Puzzle = { ...puzzle, clues: [{ a: 0, b: 1, same: true }] };
    const board = [...puzzle.givens];
    board[0] = 1;
    board[1] = 2;
    expect(conflictingCells(board, related)).toEqual([0, 1]);
    expect(parseSavedGame(save(board), related)).toEqual(save(board));
  });

  it('accepts finite nonnegative integer elapsed durations', () => {
    for (const elapsedMs of [0, 1, 1234, Number.MAX_SAFE_INTEGER]) {
      expect(parseSavedGame(save(undefined, elapsedMs), puzzle)?.elapsedMs).toBe(elapsedMs);
    }
  });

  it.each([null, -1, 1.1, NaN, Infinity, -Infinity, '1234', undefined])('rejects invalid elapsed time %s', (elapsedMs) => {
    expect(parseSavedGame({ ...save(), elapsedMs }, puzzle)).toBeNull();
  });

  it.each([null, undefined, [], 1, 'save', {}, { version: 2 }, { version: 0 }])('rejects invalid save records %s', (record) => {
    expect(parseSavedGame(record, puzzle)).toBeNull();
  });

  it('requires the exact save version and all fields', () => {
    for (const version of [undefined, null, 0, 2, '1']) {
      expect(parseSavedGame({ ...save(), version }, puzzle)).toBeNull();
    }
    expect(parseSavedGame({ version: SAVE_VERSION, board: [...puzzle.givens] }, puzzle)).toBeNull();
    expect(parseSavedGame({ version: SAVE_VERSION, elapsedMs: 0 }, puzzle)).toBeNull();
  });

  it('rejects malformed, sparse, wrong-sized, and non-array boards', () => {
    for (const board of [null, {}, '0'.repeat(CELLS), new Uint8Array(CELLS), [], puzzle.givens.slice(1), [...puzzle.givens, 0], Array(CELLS)]) {
      expect(parseSavedGame({ ...save(), board }, puzzle)).toBeNull();
    }
    for (const value of [-1, 3, 1.5, NaN, Infinity, undefined, null, '1', true]) {
      const board: unknown[] = [...puzzle.givens];
      board[0] = value;
      expect(parseSavedGame({ ...save(), board }, puzzle)).toBeNull();
    }
  });

  it('rejects erased and overwritten givens even if the rest is a legal board', () => {
    for (const value of [0, 2] as const) {
      const board = [...legal];
      board[35] = value;
      expect(parseSavedGame(save(board), puzzle)).toBeNull();
    }
    const generated = generate('save-givens', 1);
    const board = [...generated.givens];
    const cell = board.findIndex((value) => value !== 0);
    board[cell] = 0;
    expect(parseSavedGame(save(board), generated)).toBeNull();
  });

  it('returns a defensive copy and strips untrusted extra fields', () => {
    const original = { ...save(), solution: [], extra: true };
    const parsed = parseSavedGame(original, puzzle)!;
    expect(parsed).toEqual(save());
    expect(parsed.board).not.toBe(original.board);
    original.board[0] = 2;
    expect(parsed.board[0]).toBe(0);
    parsed.board[1] = 1;
    expect(original.board[1]).toBe(0);
  });
});
