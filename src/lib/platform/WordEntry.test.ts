// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Fivefold from '#lib/games/fivefold/Fivefold.svelte';
import WordLadder from '#lib/games/wordladder/WordLadder.svelte';
import { generate as fivefold } from '#lib/games/fivefold/engine.js';
import { type PuzzleIdentity } from './types.js';

let component: Record<string, never> | undefined;
let target: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  target = document.createElement('main');
  document.body.append(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  localStorage.clear();
  vi.useRealTimers();
});

async function press(...keys: string[]) {
  for (const key of keys) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await tick();
  }
}

const games = [
  { name: 'Fivefold', view: Fivefold, gameId: 'fivefold', version: 1, invalid: 'ZZZZZ', entry: '.board-row.current', status: '#fivefold-status', valid: fivefold('fixed-seed').answer },
  { name: 'Word Ladder', view: WordLadder, gameId: 'wordladder', version: 1, invalid: 'ZZZZ', entry: '.draft', status: '#ladder-status', valid: 'BURN' }
] as const;

it.each(games)('$name briefly marks rejected entries without consuming or clearing them', async (game) => {
  const identity: PuzzleIdentity = { gameId: game.gameId, mode: 'seed', seed: 'fixed-seed', generatorVersion: game.version };
  component = mount(game.view, { target, props: { identity } });
  await tick();
  await press(...game.invalid, 'Enter');
  const entry = target.querySelector(game.entry)!;
  const error = target.querySelector(game.status)!.textContent;
  expect(entry.classList.contains('word-rejected')).toBe(true);
  expect(entry.textContent?.replace(/\s/g, '')).toBe(game.invalid);
  await vi.advanceTimersByTimeAsync(500);
  await tick();
  expect(entry.classList.contains('word-rejected')).toBe(false);
  expect(entry.textContent?.replace(/\s/g, '')).toBe(game.invalid);
  expect(target.querySelector(game.status)!.textContent).toBe(error);
  await press('Enter');
  expect(entry.classList.contains('word-rejected')).toBe(true);
  await press('Backspace');
  expect(entry.classList.contains('word-rejected')).toBe(false);
  expect(entry.textContent?.replace(/\s/g, '')).toBe(game.invalid.slice(0, -1));
  await press(...Array(game.invalid.length - 1).fill('Backspace'), ...game.valid, 'Enter');
  expect(target.querySelector('.word-rejected')).toBeNull();
  if (game.name === 'Fivefold') expect(target.querySelector('.board-row')!.textContent?.replace(/\s/g, '')).toBe(game.valid);
  else expect(target.querySelector('.history .latest .word')!.getAttribute('aria-label')).toBe(game.valid);
});

it.each(games)('$name cues incomplete entries and cleans up a pending cue on unmount', async (game) => {
  const identity: PuzzleIdentity = { gameId: game.gameId, mode: 'seed', seed: 'fixed-seed', generatorVersion: game.version };
  component = mount(game.view, { target, props: { identity } });
  await tick();
  await press('A', 'Enter');
  expect(target.querySelector(game.entry)!.classList.contains('word-rejected')).toBe(true);
  await unmount(component);
  component = undefined;
  expect(vi.getTimerCount()).toBe(0);
});
