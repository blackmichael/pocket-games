export const SIZE = 6;
export const CELL_COUNT = SIZE * SIZE;
export const SAVE_VERSION = 2;

/** Canonical orthogonally adjacent cell endpoints, with the smaller cell first. */
export type Barrier = readonly [number, number];

export interface Puzzle {
  checkpoints: number[];
  /** A construction witness, never the criterion for accepting a player's path. */
  solution: number[];
  barriers: Barrier[];
}

export interface SavedGame {
  version: 2;
  path: number[];
  /** null means this attempt began before elapsed time was recorded. */
  elapsedMs: number | null;
}

const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const row = Math.floor(cell / SIZE);
  const column = cell % SIZE;
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(cell - SIZE);
  if (column < SIZE - 1) neighbors.push(cell + 1);
  if (row < SIZE - 1) neighbors.push(cell + SIZE);
  if (column > 0) neighbors.push(cell - 1);
  return neighbors;
});

function hash(seed: string): number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    state = Math.imul(state ^ (unit & 255), 16777619) >>> 0;
    state = Math.imul(state ^ (unit >>> 8), 16777619) >>> 0;
  }
  return state >>> 0;
}

function adjacent(first: number, second: number): boolean {
  return Math.abs(Math.floor(first / SIZE) - Math.floor(second / SIZE))
    + Math.abs(first % SIZE - second % SIZE) === 1;
}

export function hasBarrier(puzzle: Puzzle, from: number, to: number): boolean {
  return puzzle.barriers.some(([first, second]) =>
    (first === from && second === to) || (first === to && second === from),
  );
}

function checkpointCount(puzzle: Puzzle): number {
  let count = 0;
  for (const checkpoint of puzzle.checkpoints) count = Math.max(count, checkpoint);
  return count;
}

/** Valid resumable paths may be dead ends; they must obey every rule so far. */
function legalPath(puzzle: Puzzle, path: readonly number[]): boolean {
  if (path.length > CELL_COUNT) return false;
  const visited = new Uint8Array(CELL_COUNT);
  const last = checkpointCount(puzzle);
  let expected = 1;
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || visited[cell]) return false;
    if (index === 0 ? puzzle.checkpoints[cell] !== 1 : !adjacent(path[index - 1], cell)) return false;
    if (index > 0 && hasBarrier(puzzle, path[index - 1], cell)) return false;
    const checkpoint = puzzle.checkpoints[cell];
    if (checkpoint > 0) {
      if (checkpoint !== expected || (checkpoint === last && index !== CELL_COUNT - 1)) return false;
      expected += 1;
    }
    visited[cell] = 1;
  }
  return path.length !== CELL_COUNT || expected === last + 1;
}

interface SearchResult {
  alternative: number[] | null;
  exhausted: boolean;
}

/** Exhaustive when exhausted=true; the work budget never depends on wall time. */
function findAlternative(
  checkpoints: readonly number[],
  solution: readonly number[],
  neighbors: readonly (readonly number[])[] = NEIGHBORS,
): SearchResult {
  const nodeLimit = 20_000;
  const last = Math.max(...checkpoints);
  const finish = solution[CELL_COUNT - 1];
  const visited = new Uint8Array(CELL_COUNT);
  const path = new Uint8Array(CELL_COUNT);
  const flood = new Uint8Array(CELL_COUNT);
  const queue = new Uint8Array(CELL_COUNT);
  let nodes = 0;
  let exhausted = true;
  let alternative: number[] | null = null;

  function search(cell: number, depth: number, expected: number, differs: boolean): boolean {
    nodes += 1;
    if (nodes > nodeLimit) {
      exhausted = false;
      return true;
    }
    path[depth] = cell;
    differs ||= cell !== solution[depth];
    if (checkpoints[cell] === expected) expected += 1;
    if (depth === CELL_COUNT - 1) {
      if (cell === finish && expected === last + 1 && differs) {
        alternative = Array.from(path);
        return true;
      }
      return false;
    }
    visited[cell] = 1;

    // In the remaining graph only the current head and final checkpoint can
    // have degree one. A stranded interior square cannot be filled later.
    for (let unvisited = 0; unvisited < CELL_COUNT; unvisited += 1) {
      if (visited[unvisited]) continue;
      let degree = 0;
      for (const neighbor of neighbors[unvisited]) {
        if (!visited[neighbor] || neighbor === cell) degree += 1;
      }
      if (degree < (unvisited === finish ? 1 : 2)) {
        visited[cell] = 0;
        return false;
      }
    }

    // Periodic flood pruning catches disconnected pockets. This affects only
    // search cost, not the set of legal solutions being counted.
    if (depth % 4 === 0) {
      flood.fill(0);
      queue[0] = cell;
      flood[cell] = 1;
      let length = 1;
      for (let index = 0; index < length; index += 1) {
        for (const neighbor of neighbors[queue[index]]) {
          if (!visited[neighbor] && !flood[neighbor]) {
            flood[neighbor] = 1;
            queue[length++] = neighbor;
          }
        }
      }
      if (length !== CELL_COUNT - depth) {
        visited[cell] = 0;
        return false;
      }
    }

    for (const next of neighbors[cell]) {
      if (visited[next]) continue;
      const checkpoint = checkpoints[next];
      if (checkpoint > 0 && (checkpoint !== expected || (checkpoint === last && depth !== CELL_COUNT - 2))) continue;
      if (search(next, depth + 1, expected, differs)) {
        visited[cell] = 0;
        return true;
      }
    }
    visited[cell] = 0;
    return false;
  }

  search(solution[0], 0, 1, false);
  return { alternative, exhausted };
}

/**
 * V1 witness construction: UTF-16LE FNV-1a(seed + NUL + thread-v1), Mulberry32,
 * row-serpentine initial path, then 768 backbite proposals. Each proposal draws
 * an endpoint bit and an index into its in-bounds neighbors, ordered north,
 * east, south, west. The already-connected neighbor consumes a draw but does
 * not change the path. A backbite reverses the prefix before the chosen neighbor, preserving a
 * Hamiltonian path without a template bank or unbounded construction search.
 *
 * Initial clues occur every five steps, including both endpoints. Deterministic
 * DFS adds inversion-pair clues to exclude alternate routes; an inconclusive
 * 20,000-node search instead splits the longest unclued interval. Every added
 * clue comes from the witness, and construction stops only after exhaustive
 * proof of uniqueness. At worst all 36 cells are clues, so construction is bounded.
 * Finally, try removing each internal clue once in witness order, retaining a
 * removal only when another bounded search proves uniqueness. Renumber after
 * each attempt; inconclusive pruning never removes a clue.
 */
function generateUnwalled(seed: string): Puzzle {
  let state = hash(seed + '\u0000thread-v1');
  function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  const solution = Array.from({ length: CELL_COUNT }, (_, index) => {
    const row = Math.floor(index / SIZE);
    const column = index % SIZE;
    return row * SIZE + (row % 2 === 0 ? column : SIZE - column - 1);
  });
  for (let proposal = 0; proposal < 768; proposal += 1) {
    if (random() & 1) solution.reverse();
    const neighbors = NEIGHBORS[solution[0]];
    const index = solution.indexOf(neighbors[random() % neighbors.length]);
    for (let left = 0, right = index - 1; left < right; left += 1, right -= 1) {
      const swap = solution[left];
      solution[left] = solution[right];
      solution[right] = swap;
    }
  }

  const marked = new Uint8Array(CELL_COUNT);
  for (let index = 0; index < CELL_COUNT; index += 5) marked[index] = 1;
  marked[CELL_COUNT - 1] = 1;
  const checkpoints = Array<number>(CELL_COUNT).fill(0);
  function numberClues(): void {
    checkpoints.fill(0);
    let label = 0;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      if (marked[index]) checkpoints[solution[index]] = ++label;
    }
  }
  while (true) {
    numberClues();
    const result = findAlternative(checkpoints, solution);
    if (result.exhausted && result.alternative === null) break;

    if (result.alternative !== null) {
      const positions = new Uint8Array(CELL_COUNT);
      result.alternative.forEach((cell, index) => { positions[cell] = index; });
      // Prefer inversion pairs inside a current clue interval. Numbering both
      // excludes this alternate route without specifying exact arrival steps.
      let first = -1;
      let second = -1;
      let separation = -1;
      for (let left = 1; left < CELL_COUNT - 1; left += 1) {
        if (marked[left]) continue;
        for (let right = left + 1; right < CELL_COUNT - 1 && !marked[right]; right += 1) {
          if (positions[solution[left]] > positions[solution[right]] && right - left > separation) {
            first = left;
            second = right;
            separation = right - left;
          }
        }
      }
      if (first !== -1) {
        marked[first] = 1;
        marked[second] = 1;
        continue;
      }
    }

    let start = 0;
    let gapStart = 0;
    let gapLength = 0;
    for (let end = 1; end < CELL_COUNT; end += 1) {
      if (!marked[end]) continue;
      if (end - start > gapLength) {
        gapStart = start;
        gapLength = end - start;
      }
      start = end;
    }
    marked[gapStart + Math.floor(gapLength / 2)] = 1;
  }

  for (let index = 1; index < CELL_COUNT - 1; index += 1) {
    if (!marked[index]) continue;
    marked[index] = 0;
    numberClues();
    const result = findAlternative(checkpoints, solution);
    if (!result.exhausted || result.alternative !== null) marked[index] = 1;
  }
  numberClues();
  return { checkpoints, solution, barriers: [] };
}

/**
 * V1 barriers use an independent Mulberry32 uint32 stream, initialized with
 * UTF-16LE FNV-1a(seed + NUL + thread-v1-barriers). The state increment is
 * 0x6d2b79f5. The first draw modulo 9 chooses 0–8 barriers inclusive.
 * Candidates are the 25 non-witness grid edges, canonicalized smaller endpoint
 * first and enumerated by ascending (first, second). For each i below the count,
 * consume one draw and swap i with i + draw % (25 - i). Take that prefix and
 * sort by (first, second). No other draw, clock, or external input is used.
 *
 * Starting from the uniquely solvable unwalled board, try each internal clue
 * once in witness order. Renumber after every attempt; retain a removal only
 * when the same 20,000-node DFS exhaustively proves uniqueness, with barriers
 * removed from every traversal, degree check, and flood. Inconclusive searches
 * restore the clue. Endpoints and the witness never change. Zero-wall puzzles
 * remain genuinely unique by this same exhaustive proof, not by a stored route.
 */
export function generate(seed: string): Puzzle {
  const puzzle = generateUnwalled(seed);

  const positions = new Uint8Array(CELL_COUNT);
  puzzle.solution.forEach((cell, index) => { positions[cell] = index; });
  const candidates: Barrier[] = [];
  for (let first = 0; first < CELL_COUNT; first += 1) {
    for (const second of NEIGHBORS[first]) {
      if (second > first && Math.abs(positions[first] - positions[second]) !== 1) {
        candidates.push([first, second]);
      }
    }
  }
  let state = hash(seed + '\u0000thread-v1-barriers');
  function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }
  const barrierCount = random() % 9;
  for (let index = 0; index < barrierCount; index += 1) {
    const selected = index + random() % (candidates.length - index);
    const swap = candidates[index];
    candidates[index] = candidates[selected];
    candidates[selected] = swap;
  }
  puzzle.barriers = candidates.slice(0, barrierCount).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const neighbors = NEIGHBORS.map((adjacentCells, cell) =>
    adjacentCells.filter((next) => !hasBarrier(puzzle, cell, next)),
  );
  const marked = puzzle.solution.map((cell) => puzzle.checkpoints[cell] > 0);
  function numberClues(): void {
    puzzle.checkpoints.fill(0);
    let label = 0;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      if (marked[index]) puzzle.checkpoints[puzzle.solution[index]] = ++label;
    }
  }
  for (let index = 1; index < CELL_COUNT - 1; index += 1) {
    if (!marked[index]) continue;
    marked[index] = false;
    numberClues();
    const result = findAlternative(puzzle.checkpoints, puzzle.solution, neighbors);
    if (!result.exhausted || result.alternative !== null) marked[index] = true;
  }
  numberClues();
  return puzzle;
}

export function isSolved(puzzle: Puzzle, path: readonly number[]): boolean {
  return path.length === CELL_COUNT && legalPath(puzzle, path);
}

export function move(puzzle: Puzzle, path: readonly number[], cell: number): { path: number[]; error: string | null } {
  const unchanged = (error: string) => ({ path: [...path], error });
  if (isSolved(puzzle, path)) return unchanged('This ribbon is already complete.');
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return unchanged('Choose a cell on the board.');
  if (!legalPath(puzzle, path)) return unchanged('This path cannot be continued.');
  const existing = path.indexOf(cell);
  if (existing !== -1) return { path: path.slice(0, existing + 1), error: null };
  if (path.length === 0) {
    if (puzzle.checkpoints[cell] !== 1) return unchanged('Start at checkpoint 1.');
    return { path: [cell], error: null };
  }
  if (!adjacent(path[path.length - 1], cell)) return unchanged('Move one cell horizontally or vertically.');
  if (hasBarrier(puzzle, path[path.length - 1], cell)) return unchanged('A barrier blocks this move.');
  const checkpoint = puzzle.checkpoints[cell];
  if (checkpoint > 0) {
    let expected = 1;
    for (const visited of path) if (puzzle.checkpoints[visited] > 0) expected += 1;
    if (checkpoint !== expected) return unchanged(`Visit checkpoint ${expected} next.`);
    if (checkpoint === checkpointCount(puzzle) && path.length !== CELL_COUNT - 1) {
      return unchanged('Fill every cell before the final checkpoint.');
    }
  }
  return { path: [...path, cell], error: null };
}

export function validateSave(value: unknown, puzzle: Puzzle): SavedGame | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ((record.version !== 1 && record.version !== SAVE_VERSION)
    || !Array.isArray(record.path) || !legalPath(puzzle, record.path)) return null;
  const elapsedMs = record.version === 1 ? (record.path.length === 0 ? 0 : null) : record.elapsedMs;
  if (elapsedMs !== null && (typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0)) return null;
  return { version: SAVE_VERSION, path: [...record.path], elapsedMs };
}
