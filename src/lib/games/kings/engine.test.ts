import { describe, expect, it } from 'vitest';
import { generate, isLegalPlacement, placementConflicts, isSolved, parseSavedGame, SIZE, type Puzzle } from './engine';

const legalColumns = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
const legalCells = legalColumns.map((column, row) => row * SIZE + column);
const rowRegions: Puzzle = {
  solution: legalColumns,
  regions: Array.from({ length: SIZE * SIZE }, (_, cell) => Math.floor(cell / SIZE)),
};

const seedVectors = [
  {
    seed: '',
    solution: [9, 4, 6, 0, 3, 8, 2, 7, 5, 1],
    regions: [
      '3311111444', '3336611444', '0336111188', '0333111188', '0333111188',
      '0771111585', '9777215555', '9777225555', '9972222555', '9999222555',
    ],
  },
  {
    seed: 'fixed-seed',
    solution: [6, 4, 2, 5, 9, 1, 3, 8, 0, 7],
    regions: [
      '3333366688', '3333006688', '3333002688', '3337022688', '5557222888',
      '5557777888', '5557777118', '9557471111', '9955444441', '9995444444',
    ],
  },
  {
    seed: '王冠♚👑',
    solution: [7, 2, 8, 5, 3, 6, 0, 9, 1, 4],
    regions: [
      '5555588888', '5555778881', '5555777111', '5552777111', '5552200011',
      '6662200001', '6699900000', '6669900333', '4499990333', '4499993333',
    ],
  },
];

function expectConnectedRegions(regions: readonly number[]): void {
  expect(regions).toHaveLength(100);
  expect([...new Set(regions)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (let region = 0; region < SIZE; region += 1) {
    const members = regions.flatMap((value, cell) => value === region ? [cell] : []);
    expect(members.length).toBeGreaterThan(0);
    const pending = [members[0]];
    const visited = new Set<number>(pending);
    while (pending.length > 0) {
      const cell = pending.pop()!;
      const row = Math.floor(cell / SIZE);
      const column = cell % SIZE;
      const neighbors: number[] = [];
      if (row > 0) neighbors.push(cell - SIZE);
      if (row < SIZE - 1) neighbors.push(cell + SIZE);
      if (column > 0) neighbors.push(cell - 1);
      if (column < SIZE - 1) neighbors.push(cell + 1);
      for (const neighbor of neighbors) {
        if (regions[neighbor] === region && !visited.has(neighbor)) {
          visited.add(neighbor);
          pending.push(neighbor);
        }
      }
    }
    expect(visited.size).toBe(members.length);
  }
}

/** Ignore label renaming, reflection, and rotation when counting geometry. */
function canonicalGeometry(board: readonly number[], relabel: boolean): string {
  let canonical: string | undefined;
  for (let reflection = 0; reflection < 2; reflection += 1) {
    for (let turns = 0; turns < 4; turns += 1) {
      const transformed = Array<number>(SIZE * SIZE);
      for (let cell = 0; cell < board.length; cell += 1) {
        let row = Math.floor(cell / SIZE);
        let column = reflection === 0 ? cell % SIZE : SIZE - 1 - cell % SIZE;
        for (let turn = 0; turn < turns; turn += 1) {
          const previousRow = row;
          row = column;
          column = SIZE - 1 - previousRow;
        }
        transformed[row * SIZE + column] = board[cell];
      }
      const labels = new Map<number, number>();
      const key = transformed.map((value) => {
        if (!relabel) return value;
        if (!labels.has(value)) labels.set(value, labels.size);
        return labels.get(value)!;
      }).join('');
      if (canonical === undefined || key < canonical) canonical = key;
    }
  }
  return canonical!;
}

describe('Kings v1 generation', () => {
  it.each(seedVectors)('freezes the v1 mapping for seed "$seed"', ({ seed, solution, regions }) => {
    expect(generate(seed)).toEqual({ solution, regions: [...regions.join('')].map(Number) });
  });

  it('assigns every cell to connected regions rooted in ten legal kings', () => {
    const seeds = [...seedVectors.map(({ seed }) => seed), ...Array.from({ length: 100 }, (_, index) => `sample-${index}`)];
    for (const seed of seeds) {
      const puzzle = generate(seed);
      expect(puzzle.solution).toHaveLength(SIZE);
      expect([...puzzle.solution].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expectConnectedRegions(puzzle.regions);
      const selected: number[] = [];
      const kingsPerRegion = Array<number>(SIZE).fill(0);
      for (let row = 0; row < SIZE; row += 1) {
        const cell = row * SIZE + puzzle.solution[row];
        expect(isLegalPlacement(selected, cell)).toBe(true);
        expect(placementConflicts(selected, cell, puzzle)).toEqual([]);
        kingsPerRegion[puzzle.regions[cell]] += 1;
        selected.push(cell);
      }
      expect(kingsPerRegion).toEqual(Array<number>(SIZE).fill(1));
      expect(isSolved(selected, puzzle)).toBe(true);
    }
  });

  it('regenerates independently of request order and returned-array mutations', () => {
    const seeds = [...seedVectors.map(({ seed }) => seed), ...Array.from({ length: 30 }, (_, index) => `order-${index}`)];
    const expected = seeds.map((seed) => generate(seed));
    for (let index = seeds.length - 1; index >= 0; index -= 1) {
      const puzzle = generate(seeds[index]);
      expect(puzzle).toEqual(expected[index]);
      puzzle.solution.fill(-1);
      puzzle.regions.fill(-1);
      expect(generate(seeds[index])).toEqual(expected[index]);
    }
  });

  it('varies arrangements, region geometry, and colors beyond board symmetries', () => {
    const arrangements = new Set<string>();
    const layouts = new Set<string>();
    const arrangementGeometry = new Set<string>();
    const layoutGeometry = new Set<string>();
    const colorsByRow = Array.from({ length: SIZE }, () => new Set<number>());
    for (let index = 0; index < 1000; index += 1) {
      const puzzle = generate(`variety-${index}`);
      arrangements.add(puzzle.solution.join(''));
      layouts.add(puzzle.regions.join(''));
      const kings = Array<number>(SIZE * SIZE).fill(0);
      for (let row = 0; row < SIZE; row += 1) {
        const cell = row * SIZE + puzzle.solution[row];
        kings[cell] = 1;
        colorsByRow[row].add(puzzle.regions[cell]);
      }
      arrangementGeometry.add(canonicalGeometry(kings, false));
      layoutGeometry.add(canonicalGeometry(puzzle.regions, true));
    }
    expect(arrangements.size).toBeGreaterThan(950);
    expect(layouts.size).toBeGreaterThan(950);
    expect(arrangementGeometry.size).toBeGreaterThan(900);
    expect(layoutGeometry.size).toBeGreaterThan(900);
    expect(colorsByRow.map((colors) => colors.size)).toEqual(Array<number>(SIZE).fill(SIZE));
  });
});

describe('Kings placement rules', () => {
  it('accepts both board corners and separated kings', () => {
    expect(isLegalPlacement([], 0)).toBe(true);
    expect(isLegalPlacement([], 99)).toBe(true);
    expect(isLegalPlacement([0], 99)).toBe(true);
    expect(isLegalPlacement([44], 66)).toBe(true);
    expect(isLegalPlacement([44], 52)).toBe(true);
    expect(isLegalPlacement([0, 12], 24)).toBe(true);
  });

  it.each([
    ['same row', 45],
    ['same column', 4],
    ['duplicate', 44],
    ['upper-left diagonal', 33],
    ['upper-right diagonal', 35],
    ['lower-left diagonal', 53],
    ['lower-right diagonal', 55],
  ])('rejects a %s conflict', (_reason, cell) => {
    expect(isLegalPlacement([44], cell as number)).toBe(false);
  });

  it.each([-1, 100, 1.5, NaN, Infinity])('rejects invalid cell %s in either position', (cell) => {
    expect(isLegalPlacement([], cell)).toBe(false);
    expect(isLegalPlacement([cell], 44)).toBe(false);
  });

  it('identifies every conflicting king without flagging separated kings', () => {
    expect(placementConflicts([33, 4, 40, 99], 44, rowRegions)).toEqual([33, 4, 40]);
    expect(placementConflicts([0], 99, rowRegions)).toEqual([]);
  });

  it('identifies a region conflict even when rows, columns, and neighbors are clear', () => {
    const regions = [...rowRegions.regions];
    regions[77] = regions[44];
    expect(isLegalPlacement([44], 77)).toBe(true);
    expect(placementConflicts([44], 77, { ...rowRegions, regions })).toEqual([44]);
  });
});

describe('Kings completion', () => {
  it('accepts any legal solution rather than requiring the generated target', () => {
    const alternative = legalColumns.map((column, row) => row * SIZE + SIZE - 1 - column);
    expect(isSolved(legalCells, rowRegions)).toBe(true);
    expect(isSolved([...legalCells].reverse(), rowRegions)).toBe(true);
    expect(isSolved(alternative, rowRegions)).toBe(true);
  });

  it('rejects empty, incomplete, and overfull boards', () => {
    expect(isSolved([], rowRegions)).toBe(false);
    expect(isSolved(legalCells.slice(0, 9), rowRegions)).toBe(false);
    expect(isSolved([...legalCells, 98], rowRegions)).toBe(false);
  });

  it.each([
    ['duplicate', [...legalCells.slice(0, 9), legalCells[0]]],
    ['same row', [...legalCells.slice(0, 9), 9]],
    ['same column', [...legalCells.slice(0, 9), 90]],
    ['touching diagonal', [0, 1, 4, 6, 8, 2, 3, 5, 7, 9].map((column, row) => row * SIZE + column)],
  ])('rejects a full board with a %s conflict', (_reason, selected) => {
    expect(isSolved(selected as number[], rowRegions)).toBe(false);
  });

  it.each([-1, 100, 1.5, NaN, Infinity])('rejects a full board containing invalid cell %s', (cell) => {
    expect(isSolved([...legalCells.slice(0, 9), cell], rowRegions)).toBe(false);
  });

  it('rejects otherwise legal kings when two occupy the same region', () => {
    const regions = [...rowRegions.regions];
    regions[legalCells[1]] = regions[legalCells[0]];
    expect(isSolved(legalCells, { ...rowRegions, regions })).toBe(false);
  });
});

describe('Kings saved games', () => {
  it.each([1, 2])('rejects incompatible unpublished save format %s', (version) => {
    for (const selected of [[], [99], legalCells]) {
      expect(parseSavedGame({ version, selected, elapsedMs: 12345 }, rowRegions)).toBeNull();
    }
  });

  it('restores accumulated time for valid generated partial and completed boards', () => {
    const puzzle = generate('fixed-seed');
    const selected = puzzle.solution.map((column, row) => row * SIZE + column);
    const partial = selected.slice(0, 3);
    expect(parseSavedGame({ version: 3, selected: partial, elapsedMs: 12345 }, puzzle))
      .toEqual({ version: 3, selected: partial, elapsedMs: 12345 });
    expect(parseSavedGame({ version: 3, selected, elapsedMs: 67890 }, puzzle))
      .toEqual({ version: 3, selected, elapsedMs: 67890 });
    expect(parseSavedGame({ version: 3, selected, elapsedMs: null }, puzzle))
      .toEqual({ version: 3, selected, elapsedMs: null });
  });

  it('rejects region-conflicting partial and completed saves', () => {
    const puzzle = generate('fixed-seed');
    expect(parseSavedGame({ version: 3, selected: [0, 12], elapsedMs: 1000 }, puzzle)).toBeNull();
    expect(parseSavedGame({ version: 3, selected: legalCells, elapsedMs: null }, puzzle)).toBeNull();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1000', undefined, null])
    ('rejects invalid active-board elapsed time %s', (elapsedMs) => {
      expect(parseSavedGame({ version: 3, selected: [], elapsedMs }, rowRegions)).toBeNull();
    });

  it.each([
    { reason: 'shared row', selected: [0, 2] },
    { reason: 'shared column', selected: [0, 10] },
    { reason: 'touching diagonal', selected: [0, 11] },
    { reason: 'duplicate', selected: [0, 0] },
    { reason: 'negative index', selected: [-1] },
    { reason: 'index beyond the board', selected: [100] },
    { reason: 'fractional index', selected: [1.5] },
    { reason: 'NaN index', selected: [NaN] },
    { reason: 'infinite index', selected: [Infinity] },
    { reason: 'string index', selected: ['99'] },
    { reason: 'null index', selected: [null] },
    { reason: 'too many kings', selected: [...legalCells, 98] },
  ])('rejects saved positions with $reason', ({ selected }) => {
    expect(parseSavedGame({ version: 3, selected, elapsedMs: 0 }, rowRegions)).toBeNull();
  });

  it.each([
    { value: null },
    { value: undefined },
    { value: 'saved game' },
    { value: [] },
    { value: {} },
    { value: { version: 4, selected: [], elapsedMs: 0 } },
    { value: { version: '3', selected: [], elapsedMs: 0 } },
    { value: { selected: [] } },
    { value: { version: 3 } },
    { value: { version: 3, selected: {}, elapsedMs: 0 } },
  ])('rejects malformed or incompatible saved data: $value', ({ value }) => {
    expect(parseSavedGame(value, rowRegions)).toBeNull();
  });
});
