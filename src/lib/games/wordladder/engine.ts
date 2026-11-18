import { WORDS } from './words';

export interface Puzzle {
  start: string;
  target: string;
  shortest: number;
}

export interface Save {
  version: 1;
  steps: string[];
  draft: string;
}

const vocabulary = new Set(WORDS);
const letterMasks = Uint32Array.from(WORDS, (word) => {
  let mask = 0;
  for (let position = 0; position < 4; position += 1) mask |= 1 << (word.charCodeAt(position) - 65);
  return mask;
});

// Build once, only when this game's lazy engine is imported. Wildcard buckets
// join exactly the words that differ at one position, without pairwise scans.
const neighbors: number[][] = WORDS.map(() => []);
const buckets = new Map<string, number[]>();
for (let index = 0; index < WORDS.length; index += 1) {
  const word = WORDS[index];
  for (let position = 0; position < 4; position += 1) {
    const key = word.slice(0, position) + '*' + word.slice(position + 1);
    const bucket = buckets.get(key);
    if (bucket) {
      for (const other of bucket) {
        neighbors[index].push(other);
        neighbors[other].push(index);
      }
      bucket.push(index);
    } else {
      buckets.set(key, [index]);
    }
  }
}
buckets.clear();

// Isolated words remain valid moves/vocabulary, but not generated endpoints.
const visited = new Uint8Array(WORDS.length);
let largest: number[] = [];
for (let index = 0; index < WORDS.length; index += 1) {
  if (visited[index]) continue;
  const component = [index];
  visited[index] = 1;
  for (let head = 0; head < component.length; head += 1) {
    for (const next of neighbors[component[head]]) {
      if (visited[next]) continue;
      visited[next] = 1;
      component.push(next);
    }
  }
  if (component.length > largest.length) largest = component;
}
largest.sort((left, right) => left - right);

function advance(state: number): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

/** Frozen v1: UTF-16LE FNV-1a, xorshift32, then full BFS; see attribution. */
export function generate(seed: string): Puzzle {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    const unit = seed.charCodeAt(index);
    hash = Math.imul(hash ^ (unit & 255), 16777619) >>> 0;
    hash = Math.imul(hash ^ (unit >>> 8), 16777619) >>> 0;
  }
  const state = advance(hash);
  const start = largest[state % largest.length];
  const distances = new Int16Array(WORDS.length).fill(-1);
  distances[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const next of neighbors[current]) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[current] + 1;
      queue.push(next);
    }
  }
  let count = 0;
  for (let target = 0; target < WORDS.length; target += 1) {
    if (distances[target] >= 4 && (letterMasks[start] & letterMasks[target]) === 0) count += 1;
  }
  // The frozen largest component has eligible targets from every start.
  if (count === 0) throw new Error('Word Ladder vocabulary has no eligible target.');
  let selection = advance(state) % count;
  for (let target = 0; target < WORDS.length; target += 1) {
    if (distances[target] < 4 || (letterMasks[start] & letterMasks[target]) !== 0) continue;
    if (selection-- === 0) {
      return { start: WORDS[start], target: WORDS[target], shortest: distances[target] };
    }
  }
  throw new Error('Word Ladder target selection failed.');
}

/** No normalization: callers supply exactly four uppercase ASCII letters. */
export function isWord(word: string): boolean {
  return vocabulary.has(word);
}

export function moveError(current: string, next: string): string | null {
  if (next.length !== 4 || /[^A-Z]/.test(next)) return 'Enter exactly four letters.';
  if (!isWord(next)) return 'That word is not in the dictionary.';
  if (!isWord(current)) return 'The current word is not in the dictionary.';
  let changes = 0;
  for (let position = 0; position < 4; position += 1) {
    if (current[position] !== next[position]) changes += 1;
  }
  if (changes !== 1) return 'Change exactly one letter.';
  return null;
}

export function isSolved(puzzle: Puzzle, steps: readonly string[]): boolean {
  return (steps.length === 0 ? puzzle.start : steps[steps.length - 1]) === puzzle.target;
}

/** Restore only reachable states of this puzzle; repeats are intentionally legal. */
export function validateSave(value: unknown, puzzle: Puzzle): Save | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.steps)) {
    return null;
  }
  if (
    typeof record.draft !== 'string' ||
    record.draft.length > 4 ||
    /[^A-Z]/.test(record.draft)
  ) return null;
  const steps: string[] = [];
  let current = puzzle.start;
  for (const next of record.steps) {
    if (current === puzzle.target || typeof next !== 'string' || moveError(current, next) !== null) {
      return null;
    }
    steps.push(next);
    current = next;
  }
  if (current === puzzle.target && record.draft !== '') return null;
  return { version: 1, steps, draft: record.draft };
}
