export const SIZE = 6;
export const SAVE_VERSION = 2;
export const MAX_DIFFICULTY = 30;

export type Cell = 0 | 1 | 2;

export interface Clue {
  a: number;
  b: number;
  same: boolean;
}

export interface Puzzle {
  givens: Cell[];
  clues: Clue[];
  solution: Cell[];
}

export interface SavedGame {
  version: 2;
  board: Cell[];
  elapsedMs: number;
}

const CELLS = SIZE * SIZE;
const FULL_ROW = (1 << SIZE) - 1;
const HALF = SIZE / 2;

// Ascending bit masks; column zero is the least significant bit, 1 means sun.
const ROW_PATTERNS: number[] = [];
for (let mask = 0; mask <= FULL_ROW; mask += 1) {
  let suns = 0;
  for (let column = 0; column < SIZE; column += 1) suns += (mask >>> column) & 1;
  const moons = FULL_ROW ^ mask;
  if (suns === HALF && (mask & (mask >>> 1) & (mask >>> 2)) === 0 &&
    (moons & (moons >>> 1) & (moons >>> 2)) === 0) ROW_PATTERNS.push(mask);
}
const NATURAL_ORDER = new Uint8Array(SIZE * ROW_PATTERNS.length);
for (let row = 0; row < SIZE; row += 1) NATURAL_ORDER.set(ROW_PATTERNS, row * ROW_PATTERNS.length);

function hash(seed: string): number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    state = Math.imul(state ^ (unit & 255), 16777619) >>> 0;
    state = Math.imul(state ^ (unit >>> 8), 16777619) >>> 0;
  }
  return state;
}

/**
 * Reusable row-pattern solver. Every traversal is finite (at most 14^6 leaves),
 * stops at its solution limit, and uses neither random draws nor a time budget.
 * Repeated rows and columns are intentionally legal: this is not Takuzu.
 */
function makeSolver(clues: readonly Clue[], order: Uint8Array = NATURAL_ORDER) {
  const horizontal = Array.from({ length: SIZE }, () => [] as Clue[]);
  const vertical = Array.from({ length: SIZE }, () => [] as Clue[]);
  for (const clue of clues) {
    const row = Math.floor(clue.b / SIZE);
    (Math.floor(clue.a / SIZE) === row ? horizontal : vertical)[row].push(clue);
  }
  const candidates = new Uint8Array(order.length);
  const lengths = new Uint8Array(SIZE);
  const sunCounts = new Uint8Array(SIZE);
  const rows = new Uint8Array(SIZE);

  return (givens: readonly Cell[], limit: number, first?: Cell[]): number => {
    // Givens and within-row clues do not change during a traversal.
    for (let row = 0; row < SIZE; row += 1) {
      lengths[row] = 0;
      const offset = row * ROW_PATTERNS.length;
      for (let index = 0; index < ROW_PATTERNS.length; index += 1) {
        const mask = order[offset + index];
        let valid = true;
        for (let column = 0; column < SIZE; column += 1) {
          const given = givens[row * SIZE + column];
          if (given !== 0 && given !== (((mask >>> column) & 1) === 1 ? 1 : 2)) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;
        for (const clue of horizontal[row]) {
          if ((((mask >>> (clue.a % SIZE)) & 1) === ((mask >>> (clue.b % SIZE)) & 1)) !== clue.same) {
            valid = false;
            break;
          }
        }
        if (valid) candidates[offset + lengths[row]++] = mask;
      }
      if (lengths[row] === 0) return 0;
    }
    sunCounts.fill(0);
    let count = 0;
    function visit(row: number): void {
      if (row === SIZE) {
        count += 1;
        if (count === 1 && first) {
          for (let cell = 0; cell < CELLS; cell += 1) {
            first[cell] = ((rows[Math.floor(cell / SIZE)] >>> (cell % SIZE)) & 1) === 1 ? 1 : 2;
          }
        }
        return;
      }
      const offset = row * ROW_PATTERNS.length;
      for (let index = 0; index < lengths[row]; index += 1) {
        const mask = candidates[offset + index];
        if (row >= 2 && ((mask & rows[row - 1] & rows[row - 2]) !== 0 ||
          ((~(mask | rows[row - 1] | rows[row - 2])) & FULL_ROW) !== 0)) continue;
        let valid = true;
        for (const clue of vertical[row]) {
          if ((((rows[row - 1] >>> (clue.a % SIZE)) & 1) === ((mask >>> (clue.b % SIZE)) & 1)) !== clue.same) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;
        for (let column = 0; column < SIZE; column += 1) {
          const next = sunCounts[column] + ((mask >>> column) & 1);
          if (next > HALF || next + SIZE - row - 1 < HALF) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;
        rows[row] = mask;
        for (let column = 0; column < SIZE; column += 1) sunCounts[column] += (mask >>> column) & 1;
        visit(row + 1);
        for (let column = 0; column < SIZE; column += 1) sunCounts[column] -= (mask >>> column) & 1;
        if (count >= limit) return;
      }
    }
    visit(0);
    return count;
  };
}
/**
 * Cells left after forced line-pattern deductions and relation propagation.
 * A solvable puzzle scores 0–36; no guessing or solution lookup is used.
 */
export function difficulty(puzzle: Pick<Puzzle, 'givens' | 'clues'>): number {
  const board = Uint8Array.from(puzzle.givens);
  const same = new Uint8Array(SIZE * 2);
  const different = new Uint8Array(SIZE * 2);
  for (const clue of puzzle.clues) {
    const horizontal = clue.b - clue.a === 1;
    const line = horizontal ? Math.floor(clue.a / SIZE) : SIZE + clue.a % SIZE;
    const offset = horizontal ? clue.a % SIZE : Math.floor(clue.a / SIZE);
    (clue.same ? same : different)[line] |= 1 << offset;
  }
  let unresolved = 0;
  for (const value of board) if (value === 0) unresolved += 1;
  let changed: boolean;
  do {
    changed = false;
    for (const { a, b, same } of puzzle.clues) {
      if ((board[a] === 0) === (board[b] === 0)) continue;
      const fixed = board[a] === 0 ? b : a;
      const other = fixed === a ? b : a;
      board[other] = same ? board[fixed] : 3 - board[fixed];
      unresolved -= 1;
      changed = true;
    }
    for (let line = 0; line < SIZE * 2; line += 1) {
      const start = line < SIZE ? line * SIZE : line - SIZE;
      const step = line < SIZE ? 1 : SIZE;
      let fixedSuns = 0;
      let fixedMoons = 0;
      for (let offset = 0; offset < SIZE; offset += 1) {
        const value = board[start + offset * step];
        if (value === 1) fixedSuns |= 1 << offset;
        if (value === 2) fixedMoons |= 1 << offset;
      }
      let everySun = FULL_ROW;
      let anySun = 0;
      for (const mask of ROW_PATTERNS) {
        if ((mask & fixedSuns) !== fixedSuns || (mask & fixedMoons) !== 0) continue;
        const changes = mask ^ (mask >>> 1);
        if ((changes & same[line]) !== 0 || (changes & different[line]) !== different[line]) continue;
        everySun &= mask;
        anySun |= mask;
      }
      for (let offset = 0; offset < SIZE; offset += 1) {
        const cell = start + offset * step;
        if (board[cell] !== 0) continue;
        const bit = 1 << offset;
        if ((everySun & bit) !== 0) board[cell] = 1;
        else if ((anySun & bit) === 0) board[cell] = 2;
        else continue;
        unresolved -= 1;
        changed = true;
      }
    }
  } while (changed);
  return unresolved;
}

/**
 * FNV-1a over little-endian UTF-16 code units of the exact seed plus
 * "\0sunmoon-v1", then Mulberry32 unsigned draws. Modulo Fisher–Yates
 * shuffles consume a draw per swap, including self-swaps. Shuffle ascending
 * legal row masks separately for rows 0–5; depth-first column-checked search
 * selects the first legal solution. Shuffle right/down edges in row-major
 * order (right before down), then draw the clue count (6–10). Shuffle cells,
 * add givens until unique, and attempt removals in reverse addition order.
 * Replace relations touching givens with equivalent fixed pets until stable,
 * then minimize givens in reverse shuffled-cell order. No time budgets,
 * external data, or fallback puzzles.
 */
export function generate(seed: string): Puzzle {
  let state = hash(seed + '\u0000sunmoon-v1');
  function random(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }
  function shuffle(values: number[] | Uint8Array, start = 0, length = values.length): void {
    for (let index = length - 1; index > 0; index -= 1) {
      const other = random() % (index + 1);
      const value = values[start + index];
      values[start + index] = values[start + other];
      values[start + other] = value;
    }
  }

  const order = new Uint8Array(NATURAL_ORDER);
  for (let row = 0; row < SIZE; row += 1) shuffle(order, row * ROW_PATTERNS.length, ROW_PATTERNS.length);
  const givens = Array<Cell>(CELLS).fill(0);
  const solution = Array<Cell>(CELLS).fill(0);
  // A row alternating with its complement always supplies a legal completion.
  makeSolver([], order)(givens, 1, solution);

  const edges: number[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (cell % SIZE < SIZE - 1) edges.push(cell * CELLS + cell + 1);
    if (cell < CELLS - SIZE) edges.push(cell * CELLS + cell + SIZE);
  }
  shuffle(edges);
  const clueCount = 6 + random() % 5;
  const clues = edges.slice(0, clueCount).map((edge): Clue => {
    const a = Math.floor(edge / CELLS);
    const b = edge % CELLS;
    return { a, b, same: solution[a] === solution[b] };
  });
  const cells = Array.from({ length: CELLS }, (_, cell) => cell);
  shuffle(cells);
  const count = makeSolver(clues);
  let added = 0;
  // At worst all 36 givens force the constructed solution; each loop is bounded.
  while (count(givens, 2) !== 1 && added < CELLS) {
    const cell = cells[added++];
    givens[cell] = solution[cell];
  }
  for (let index = added - 1; index >= 0; index -= 1) {
    const cell = cells[index];
    givens[cell] = 0;
    if (count(givens, 2) !== 1) givens[cell] = solution[cell];
  }
  function propagateGivens(): void {
    let removed: boolean;
    do {
      let kept = 0;
      removed = false;
      for (const clue of clues) {
        const { a, b, same } = clue;
        if (givens[a] !== 0 || givens[b] !== 0) {
          const fixed = givens[a] !== 0 ? a : b;
          const other = fixed === a ? b : a;
          givens[other] = same ? givens[fixed] : (3 - givens[fixed]) as Cell;
          removed = true;
        } else {
          clues[kept++] = clue;
        }
      }
      clues.length = kept;
    } while (removed);
  }
  propagateGivens();
  const remainingCount = makeSolver(clues);
  for (let index = cells.length - 1; index >= 0; index -= 1) {
    const cell = cells[index];
    if (givens[cell] === 0) continue;
    givens[cell] = 0;
    if (remainingCount(givens, 2) !== 1) givens[cell] = solution[cell];
  }
  const puzzle = { givens, clues, solution };
  let score = difficulty(puzzle);
  while (score > MAX_DIFFICULTY) {
    let bestCell = -1;
    let bestScore = score;
    for (const cell of cells) {
      if (givens[cell] !== 0) continue;
      givens[cell] = solution[cell];
      const candidateScore = difficulty(puzzle);
      givens[cell] = 0;
      if (candidateScore < bestScore) {
        bestCell = cell;
        bestScore = candidateScore;
      }
      if (bestScore === 0) break;
    }
    // At least one unresolved cell improves the score; each pass adds a given.
    givens[bestCell] = solution[bestCell];
    propagateGivens();
    score = difficulty(puzzle);
  }
  return puzzle;
}

/** Every participant in a broken rule, in ascending cell order. */
export function conflictingCells(board: readonly Cell[], puzzle: Puzzle): number[] {
  const marked = new Uint8Array(CELLS);
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (puzzle.givens[cell] !== 0 && board[cell] !== puzzle.givens[cell]) marked[cell] = 1;
  }
  for (let axis = 0; axis < 2; axis += 1) {
    const step = axis === 0 ? 1 : SIZE;
    for (let line = 0; line < SIZE; line += 1) {
      const start = axis === 0 ? line * SIZE : line;
      let suns = 0;
      let moons = 0;
      for (let offset = 0; offset < SIZE; offset += 1) {
        const value = board[start + offset * step];
        if (value === 1) suns += 1;
        if (value === 2) moons += 1;
      }
      if (suns > HALF || moons > HALF) {
        for (let offset = 0; offset < SIZE; offset += 1) {
          const cell = start + offset * step;
          if ((board[cell] === 1 && suns > HALF) || (board[cell] === 2 && moons > HALF)) marked[cell] = 1;
        }
      }
      for (let offset = 0; offset < SIZE - 2; offset += 1) {
        const cell = start + offset * step;
        if (board[cell] !== 0 && board[cell] === board[cell + step] && board[cell] === board[cell + 2 * step]) {
          marked[cell] = 1;
          marked[cell + step] = 1;
          marked[cell + 2 * step] = 1;
        }
      }
    }
  }
  for (const { a, b, same } of puzzle.clues) {
    if ((board[a] === 1 || board[a] === 2) && (board[b] === 1 || board[b] === 2) &&
      (board[a] === board[b]) !== same) {
      marked[a] = 1;
      marked[b] = 1;
    }
  }
  const conflicts: number[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) if (marked[cell]) conflicts.push(cell);
  return conflicts;
}

export function isSolved(board: readonly Cell[], puzzle: Puzzle): boolean {
  if (board.length !== CELLS) return false;
  for (let cell = 0; cell < CELLS; cell += 1) if (board[cell] !== 1 && board[cell] !== 2) return false;
  return conflictingCells(board, puzzle).length === 0;
}

/** Select an empty or incorrect editable cell from an unsigned 32-bit UI draw. */
export function chooseHintCell(board: readonly Cell[], puzzle: Puzzle, randomValue: number): number | null {
  let remaining = 0;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (puzzle.givens[cell] === 0 && board[cell] !== puzzle.solution[cell]) remaining += 1;
  }
  if (remaining === 0) return null;
  let choice = randomValue % remaining;
  for (let cell = 0; cell < CELLS; cell += 1) {
    if (puzzle.givens[cell] === 0 && board[cell] !== puzzle.solution[cell]) {
      if (choice === 0) return cell;
      choice -= 1;
    }
  }
  return null;
}

export function parseSavedGame(value: unknown, puzzle: Puzzle): SavedGame | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== SAVE_VERSION || !Array.isArray(record.board) || record.board.length !== CELLS ||
    typeof record.elapsedMs !== 'number' || !Number.isInteger(record.elapsedMs) || record.elapsedMs < 0) return null;
  const board: Cell[] = [];
  for (let cell = 0; cell < CELLS; cell += 1) {
    const entry: unknown = record.board[cell];
    if (entry !== 0 && entry !== 1 && entry !== 2) return null;
    if (puzzle.givens[cell] !== 0 && entry !== puzzle.givens[cell]) return null;
    board.push(entry);
  }
  return { version: SAVE_VERSION, board, elapsedMs: record.elapsedMs };
}
