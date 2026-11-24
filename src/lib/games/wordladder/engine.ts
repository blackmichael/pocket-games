import { MOVE_ADDITIONS, WORDS } from './words';
import { ENDPOINT_WORDS, PLAYABLE_WORDS } from './words-v2';

export interface Puzzle {
  generatorVersion: 1 | 2;
  start: string;
  target: string;
  shortest: number;
}

export interface Save {
  version: 1;
  steps: string[];
  draft: string;
}

interface Graph {
  words: readonly string[];
  vocabulary: ReadonlySet<string>;
  masks: Uint32Array;
  neighbors: number[][];
  endpoints: number[];
}

const graphs: Partial<Record<1 | 2, Graph>> = {};

function graphFor(version: 1 | 2): Graph {
  const existing = graphs[version];
  if (existing) return existing;
  if (version !== 1 && version !== 2) throw new Error('Unsupported Word Ladder generator version.');
  const words = version === 1 ? WORDS : PLAYABLE_WORDS;
  const vocabulary = new Set(words);
  if (version === 1) for (const word of MOVE_ADDITIONS) vocabulary.add(word);
  const masks = Uint32Array.from(words, word => {
    let mask = 0;
    for (let position = 0; position < 4; position++) mask |= 1 << (word.charCodeAt(position) - 65);
    return mask;
  });
  // Build only the selected version. Wildcard buckets join single-letter moves.
  const neighbors: number[][] = words.map(() => []);
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    for (let position = 0; position < 4; position++) {
      const key = word.slice(0, position) + '*' + word.slice(position + 1);
      const bucket = buckets.get(key);
      if (bucket) {
        for (const other of bucket) {
          neighbors[index].push(other);
          neighbors[other].push(index);
        }
        bucket.push(index);
      } else buckets.set(key, [index]);
    }
  }
  // All dictionary words are legal moves; endpoints use the largest component.
  const visited = new Uint8Array(words.length);
  let largest: number[] = [];
  for (let index = 0; index < words.length; index++) {
    if (visited[index]) continue;
    const component = [index];
    visited[index] = 1;
    for (let head = 0; head < component.length; head++) {
      for (const next of neighbors[component[head]]) {
        if (visited[next]) continue;
        visited[next] = 1;
        component.push(next);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  largest.sort((left, right) => left - right);
  const familiar = version === 2 ? new Set(ENDPOINT_WORDS) : null;
  const endpoints = familiar ? largest.filter(index => familiar.has(words[index])) : largest;
  const graph = { words, vocabulary, masks, neighbors, endpoints };
  graphs[version] = graph;
  return graph;
}

function advance(state: number): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

/** Frozen FNV-1a/xorshift32 selection; v2 restricts endpoints, not BFS moves. */
export function generate(seed: string, generatorVersion: 1 | 2 = 2): Puzzle {
  const { words, masks, neighbors, endpoints } = graphFor(generatorVersion);
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    const unit = seed.charCodeAt(index);
    hash = Math.imul(hash ^ (unit & 255), 16777619) >>> 0;
    hash = Math.imul(hash ^ (unit >>> 8), 16777619) >>> 0;
  }
  const state = advance(hash);
  const start = endpoints[state % endpoints.length];
  const distances = new Int16Array(words.length).fill(-1);
  distances[start] = 0;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    for (const next of neighbors[current]) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[current] + 1;
      queue.push(next);
    }
  }
  let count = 0;
  for (const target of endpoints) {
    if (distances[target] >= 4 && (masks[start] & masks[target]) === 0) count++;
  }
  if (count === 0) throw new Error('Word Ladder vocabulary has no eligible target.');
  let selection = advance(state) % count;
  for (const target of endpoints) {
    if (distances[target] < 4 || (masks[start] & masks[target]) !== 0) continue;
    if (selection-- === 0) return { generatorVersion, start: words[start], target: words[target], shortest: distances[target] };
  }
  throw new Error('Word Ladder target selection failed.');
}

/** No normalization: callers supply exactly four uppercase ASCII letters. */
export function isWord(word: string, generatorVersion: 1 | 2 = 2): boolean {
  return graphFor(generatorVersion).vocabulary.has(word);
}

export function moveError(current: string, next: string, generatorVersion: 1 | 2 = 2): string | null {
  if (next.length !== 4 || /[^A-Z]/.test(next)) return 'Enter exactly four letters.';
  if (!isWord(next, generatorVersion)) return 'That word is not in the dictionary.';
  if (!isWord(current, generatorVersion)) return 'The current word is not in the dictionary.';
  let changes = 0;
  for (let position = 0; position < 4; position++) {
    if (current[position] !== next[position]) changes++;
  }
  if (changes !== 1) return 'Change exactly one letter.';
  return null;
}

export function isSolved(puzzle: Puzzle, steps: readonly string[]): boolean {
  return (steps.length === 0 ? puzzle.start : steps[steps.length - 1]) === puzzle.target;
}

/** Restore only reachable states using this puzzle's versioned vocabulary. */
export function validateSave(value: unknown, puzzle: Puzzle): Save | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.steps)) return null;
  if (typeof record.draft !== 'string' || record.draft.length > 4 || /[^A-Z]/.test(record.draft)) return null;
  const steps: string[] = [];
  let current = puzzle.start;
  for (const next of record.steps) {
    if (current === puzzle.target || typeof next !== 'string' || moveError(current, next, puzzle.generatorVersion) !== null) return null;
    steps.push(next);
    current = next;
  }
  if (current === puzzle.target && record.draft !== '') return null;
  return { version: 1, steps, draft: record.draft };
}
