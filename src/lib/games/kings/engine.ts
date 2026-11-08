export const SIZE = 10;
// Independent of generator v1: reject incompatible pre-publication board saves.
export const SAVE_VERSION = 3;

export interface Puzzle {
  solution: number[];
  regions: number[];
}

export interface SavedGame {
  version: 3;
  selected: number[];
  elapsedMs: number | null;
}

function hash(seed: string): number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    state = Math.imul(state ^ (unit & 255), 16777619) >>> 0;
    state = Math.imul(state ^ (unit >>> 8), 16777619) >>> 0;
  }
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

/**
 * Frozen v1 mapping: row-major Fisher–Yates candidate orders, depth-first column
 * search, shuffled labels at the king cells, then random frontier edges. Neighbor
 * insertion order is north, east, south, west. Each shuffle swap and frontier
 * removal consumes one random draw, including stale edges; search uses no draws.
 */
export function generate(seed: string): Puzzle {
  let state = hash(seed + '\u0000kings-v1');
  function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  const candidates = new Uint8Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row += 1) {
    const start = row * SIZE;
    for (let column = 0; column < SIZE; column += 1) candidates[start + column] = column;
    for (let index = SIZE - 1; index > 0; index -= 1) {
      const other = random() % (index + 1);
      const value = candidates[start + index];
      candidates[start + index] = candidates[start + other];
      candidates[start + other] = value;
    }
  }

  const solution = Array<number>(SIZE);
  function place(row: number, used: number): boolean {
    if (row === SIZE) return true;
    const start = row * SIZE;
    for (let index = 0; index < SIZE; index += 1) {
      const column = candidates[start + index];
      if ((used & (1 << column)) !== 0 ||
        (row > 0 && Math.abs(column - solution[row - 1]) <= 1)) continue;
      solution[row] = column;
      if (place(row + 1, used | (1 << column))) return true;
    }
    return false;
  }
  // Exhaustive finite search always reaches a legal permutation on this board.
  place(0, 0);

  const cells = SIZE * SIZE;
  const regions = Array<number>(cells).fill(-1);
  for (let row = 0; row < SIZE; row += 1) regions[row * SIZE + solution[row]] = row;
  // Color labels must not reveal which row contains their king.
  for (let row = SIZE - 1; row > 0; row -= 1) {
    const otherRow = random() % (row + 1);
    const cell = row * SIZE + solution[row];
    const otherCell = otherRow * SIZE + solution[otherRow];
    const label = regions[cell];
    regions[cell] = regions[otherCell];
    regions[otherCell] = label;
  }

  // Each undirected grid edge enters the frontier at most once: only when its
  // first endpoint is assigned. Pack region and destination into one integer.
  const frontier = new Uint16Array(2 * SIZE * (SIZE - 1));
  let frontierLength = 0;
  function addFrontier(cell: number, region: number): void {
    const row = Math.floor(cell / SIZE);
    const column = cell % SIZE;
    const label = region * cells;
    if (row > 0 && regions[cell - SIZE] === -1) frontier[frontierLength++] = label + cell - SIZE;
    if (column < SIZE - 1 && regions[cell + 1] === -1) frontier[frontierLength++] = label + cell + 1;
    if (row < SIZE - 1 && regions[cell + SIZE] === -1) frontier[frontierLength++] = label + cell + SIZE;
    if (column > 0 && regions[cell - 1] === -1) frontier[frontierLength++] = label + cell - 1;
  }
  for (let row = 0; row < SIZE; row += 1) {
    const cell = row * SIZE + solution[row];
    addFrontier(cell, regions[cell]);
  }
  while (frontierLength > 0) {
    const index = random() % frontierLength;
    const edge = frontier[index];
    frontierLength -= 1;
    frontier[index] = frontier[frontierLength];
    const cell = edge % cells;
    if (regions[cell] !== -1) continue;
    const region = Math.floor(edge / cells);
    regions[cell] = region;
    addFrontier(cell, region);
  }
  return { solution, regions };
}

export function isLegalPlacement(selected: readonly number[], cell: number): boolean {
  if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE || selected.includes(cell)) return false;
  const row = Math.floor(cell / SIZE);
  const column = cell % SIZE;
  for (const existing of selected) {
    if (!Number.isInteger(existing) || existing < 0 || existing >= SIZE * SIZE) return false;
    const otherRow = Math.floor(existing / SIZE);
    const otherColumn = existing % SIZE;
    if (row === otherRow || column === otherColumn || (Math.abs(row - otherRow) <= 1 && Math.abs(column - otherColumn) <= 1)) return false;
  }
  return true;
}
/** Selected kings that clash with a valid board square, including its region. */
export function placementConflicts(selected: readonly number[], cell: number, puzzle: Puzzle): number[] {
  const row = Math.floor(cell / SIZE);
  const column = cell % SIZE;
  return selected.filter((existing) => {
    const otherRow = Math.floor(existing / SIZE);
    const otherColumn = existing % SIZE;
    return row === otherRow || column === otherColumn ||
      (Math.abs(row - otherRow) <= 1 && Math.abs(column - otherColumn) <= 1) ||
      puzzle.regions[cell] === puzzle.regions[existing];
  });
}


export function isSolved(selected: readonly number[], puzzle: Puzzle): boolean {
  if (selected.length !== SIZE) return false;
  const rows = new Set<number>();
  const columns = new Set<number>();
  const regions = new Set<number>();
  for (const cell of selected) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= SIZE * SIZE) return false;
    const row = Math.floor(cell / SIZE);
    const column = cell % SIZE;
    const region = puzzle.regions[cell];
    if (rows.has(row) || columns.has(column) || regions.has(region)) return false;
    rows.add(row); columns.add(column); regions.add(region);
  }
  for (let first = 0; first < selected.length; first += 1) {
    for (let second = first + 1; second < selected.length; second += 1) {
      if (Math.abs(Math.floor(selected[first] / SIZE) - Math.floor(selected[second] / SIZE)) <= 1 && Math.abs(selected[first] % SIZE - selected[second] % SIZE) <= 1) return false;
    }
  }
  return true;
}

export function parseSavedGame(value: unknown, puzzle: Puzzle): SavedGame | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SAVE_VERSION || !Array.isArray(record.selected) || record.selected.length > SIZE) return null;
  const selected: number[] = [];
  let usedRegions = 0;
  for (const cell of record.selected) {
    if (typeof cell !== 'number' || !isLegalPlacement(selected, cell)) return null;
    const regionBit = 1 << puzzle.regions[cell];
    if ((usedRegions & regionBit) !== 0) return null;
    usedRegions |= regionBit;
    selected.push(cell);
  }
  const elapsedMs = record.elapsedMs;
  if (elapsedMs === null) {
    if (selected.length !== SIZE) return null;
  } else if (typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) {
    return null;
  }
  return { version: SAVE_VERSION, selected, elapsedMs };
}
