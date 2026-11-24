// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WordLadder from './WordLadder.svelte';
import { generate, type Save } from './engine.js';
import { WORDS, MOVE_ADDITIONS } from './words.js';
import { PLAYABLE_WORDS } from './words-v2.js';
import { puzzleKey, type PuzzleIdentity } from '#lib/platform/types.js';

const identity = (generatorVersion: 1 | 2): PuzzleIdentity => ({ gameId: 'wordladder', mode: 'seed', seed: 'fixed-seed', generatorVersion });
const storageKey = (value: PuzzleIdentity) => 'puzzle-room:save:1:' + puzzleKey(value);
let component: Record<string, never> | undefined;
let target: HTMLElement;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

beforeEach(() => {
  localStorage.clear();
  target = document.createElement('main'); document.body.append(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove(); localStorage.clear();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

async function render(value: PuzzleIdentity, saved?: Save) {
  if (saved) localStorage.setItem(storageKey(value), JSON.stringify(saved));
  component = mount(WordLadder, { target, props: { identity: value } });
  await tick();
}

async function enter(word: string) {
  for (const key of [...word.toLowerCase(), 'Enter']) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await tick();
  }
}

function route(start: string, destination: string, words: readonly string[], avoid?: string): string[] {
  const vocabulary = new Set(words);
  const previous = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (current === destination) {
      const path: string[] = [];
      for (let word = destination; word !== start; word = previous.get(word)!) path.push(word);
      return path.reverse();
    }
    for (let position = 0; position < 4; position++) for (let letter = 65; letter <= 90; letter++) {
      const next = current.slice(0, position) + String.fromCharCode(letter) + current.slice(position + 1);
      if (next === avoid || !vocabulary.has(next) || previous.has(next)) continue;
      previous.set(next, current); queue.push(next);
    }
  }
  throw new Error(`No fixture route from ${start} to ${destination}`);
}

it('restores and continues a v1 save without leaking it into the v2 puzzle', async () => {
  const legacy = identity(1);
  const saved: Save = { version: 1, steps: ['BURN'], draft: 'TURN' };
  await render(legacy, saved);
  expect(target.querySelector('.destination strong')!.textContent).toBe('DINE');
  expect(target.querySelector('.entry-instruction strong')!.textContent).toBe('BURN');
  await enter('');
  const legacyProgress = JSON.parse(localStorage.getItem(storageKey(legacy))!);
  expect(legacyProgress.steps).toEqual(['BURN', 'TURN']);
  await unmount(component!); component = undefined;
  const current = identity(2);
  await render(current);
  expect(target.querySelectorAll('.history li')).toHaveLength(1);
  expect(localStorage.getItem(storageKey(current))).toBeNull();
  expect(JSON.parse(localStorage.getItem(storageKey(legacy))!)).toEqual(legacyProgress);
});

it('uses the smaller dictionary for an explicit v1 board', async () => {
  const value = identity(1);
  const puzzle = generate(value.seed, 1);
  const steps = route(puzzle.start, 'CAGE', [...WORDS, ...MOVE_ADDITIONS], puzzle.target);
  await render(value, { version: 1, steps, draft: '' });
  await enter('CAFE');
  expect(target.querySelector('.entry-instruction strong')!.textContent).toBe('CAGE');
  expect(JSON.parse(localStorage.getItem(storageKey(value))!).steps).toEqual(steps);
  expect(target.querySelector('[aria-label="Next word: CAFE"]')).not.toBeNull();
});

it('plays and resumes an expanded v2 word, completes a longer route, and shares its pinned v2 link', async () => {
  const value = identity(2);
  const puzzle = generate(value.seed, 2);
  const steps = route(puzzle.start, 'CAGE', PLAYABLE_WORDS, puzzle.target);
  await render(value, { version: 1, steps, draft: '' });
  await enter('CAFE');
  expect(target.querySelector('.history .latest .word')!.getAttribute('aria-label')).toBe('CAFE');
  expect(JSON.parse(localStorage.getItem(storageKey(value))!).steps).toEqual([...steps, 'CAFE']);
  await unmount(component!); component = undefined;
  await render(value);
  expect(target.querySelector('.entry-instruction strong')!.textContent).toBe('CAFE');
  await enter('CAGE');
  for (const word of route('CAGE', puzzle.target, PLAYABLE_WORDS)) await enter(word);
  const completed = JSON.parse(localStorage.getItem(storageKey(value))!);
  expect(completed.steps.length).toBeGreaterThan(puzzle.shortest);
  expect(target.querySelector('.history .latest .word')!.getAttribute('aria-label')).toBe(puzzle.target);
  expect(target.querySelector<HTMLDialogElement>('#ladder-result')!.open).toBe(true);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  const copy = [...target.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Copy')!;
  copy.click();
  await vi.waitFor(() => expect(target.querySelector('#ladder-share')).not.toBeNull());
  const shareText = target.querySelector<HTMLTextAreaElement>('#ladder-share')!.value;
  const url = new URL(shareText.trim().split('\n').at(-1)!);
  expect(url.pathname).toBe('/games/wordladder/');
  expect(url.searchParams.get('seed')).toBe(value.seed);
  expect(url.searchParams.get('v')).toBe('2');
});
