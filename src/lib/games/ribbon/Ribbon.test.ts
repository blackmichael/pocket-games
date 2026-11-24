// @vitest-environment happy-dom
import { mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Ribbon from './Ribbon.svelte';
import { generate, type SavedGame } from './engine.js';
import { puzzleKey, type PuzzleIdentity } from '#lib/platform/types.js';

const identity: PuzzleIdentity = { gameId: 'thread', mode: 'seed', seed: 'catalog-preview', generatorVersion: 1 };
const puzzle = generate(identity.seed);
const saveKey = 'puzzle-room:save:1:' + puzzleKey(identity);
const rewindIndex = puzzle.solution.findIndex(cell => cell < 6 || cell >= 30 || cell % 6 === 0 || cell % 6 === 5);
const prefix = puzzle.solution.slice(0, Math.max(3, rewindIndex + 2));
let component: Record<string, never> | undefined;
let target: HTMLElement;
let clock: number;
const hitTestDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');

beforeEach(() => {
  localStorage.clear();
  clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  target = document.createElement('main');
  document.body.append(target);
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  target.remove();
  localStorage.clear();
  vi.restoreAllMocks();
  if (hitTestDescriptor) Object.defineProperty(document, 'elementFromPoint', hitTestDescriptor);
  else Reflect.deleteProperty(document, 'elementFromPoint');
});

async function render(saved?: SavedGame) {
  if (saved) localStorage.setItem(saveKey, JSON.stringify(saved));
  component = mount(Ribbon, { target, props: { identity } });
  await tick();
}

async function start() {
  target.querySelector<HTMLButtonElement>('.start-button')!.click();
  await tick();
}

async function lifecycle(type: 'pagehide' | 'pageshow', time: number) {
  clock = time;
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
  await tick();
}

function saved(): SavedGame { return JSON.parse(localStorage.getItem(saveKey)!); }

function pointer(type: string, position: readonly [number, number]): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: position[0], clientY: position[1] });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  return event as PointerEvent;
}

async function beginRewind() {
  await render({ version: 2, path: prefix, elapsedMs: 1234 });
  await start();
  const board = target.querySelector<HTMLDivElement>('.board')!;
  const captured = new Set<number>();
  board.setPointerCapture = id => { captured.add(id); };
  board.hasPointerCapture = id => captured.has(id);
  board.releasePointerCapture = id => { captured.delete(id); };
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300));
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number, y: number) =>
    x < 0 || y < 0 || x >= 300 || y >= 300 ? document.body :
      board.querySelector(`[data-cell="${Math.floor(y / 50) * 6 + Math.floor(x / 50)}"]`)
  });
  const earlier = prefix[rewindIndex];
  const x = (earlier % 6 + .5) * 50, y = (Math.floor(earlier / 6) + .5) * 50;
  const inside = [x, y] as const;
  const outside: readonly [number, number] = earlier % 6 === 0 ? [-10, y] : earlier % 6 === 5 ? [310, y] : earlier < 6 ? [x, -10] : [x, 310];
  board.querySelector(`[data-cell="${earlier}"]`)!.dispatchEvent(pointer('pointerdown', inside));
  return { board, inside, outside, captured };
}

describe('Ribbon page lifecycle', () => {
  it('excludes cached-page absences over repeated Back/Forward restores', async () => {
    await render(); await start();
    await lifecycle('pagehide', 1000);
    expect(saved().elapsedMs).toBe(1000);
    await lifecycle('pageshow', 61000);
    await lifecycle('pagehide', 62000);
    expect(saved().elapsedMs).toBe(2000);
    await lifecycle('pageshow', 122000);
    await lifecycle('pagehide', 123000);
    expect(saved().elapsedMs).toBe(3000);
  });

  it('keeps the frozen time when a cached component is disposed, then resumes from that time', async () => {
    await render(); await start();
    await lifecycle('pagehide', 1000);
    clock = 61000;
    await unmount(component!); component = undefined;
    expect(saved().elapsedMs).toBe(1000);
    await render(saved()); await start();
    await lifecycle('pagehide', 62000);
    expect(saved().elapsedMs).toBe(2000);
  });

  it('continues counting background-tab and help time', async () => {
    await render(); await start();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    clock = 1000; document.dispatchEvent(new Event('visibilitychange'));
    clock = 61000; visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange'));
    target.querySelector<HTMLButtonElement>('.help-trigger')!.click(); await tick();
    clock = 65000;
    target.querySelector<HTMLButtonElement>('dialog .close')!.click(); await tick();
    await lifecycle('pagehide', 66000);
    expect(saved().elapsedMs).toBe(66000);
  });

  it('does not start or save an untouched start gate on restoration', async () => {
    await render();
    await lifecycle('pagehide', 1000);
    await lifecycle('pageshow', 61000);
    await lifecycle('pagehide', 62000);
    expect(localStorage.getItem(saveKey)).toBeNull();
    expect(target.querySelector('time')!.textContent).toBe('0:00');
    expect(target.querySelector('.start-button')).not.toBeNull();
  });

  it('keeps a completed result frozen after restoration', async () => {
    await render({ version: 2, path: puzzle.solution, elapsedMs: 1234 });
    await lifecycle('pagehide', 1000);
    await lifecycle('pageshow', 61000);
    await lifecycle('pagehide', 62000);
    expect(saved()).toEqual({ version: 2, path: puzzle.solution, elapsedMs: 1234 });
    expect(target.querySelector<HTMLButtonElement>('.board button')!.disabled).toBe(true);
  });

  it('does not invent elapsed time for an untimed historical path', async () => {
    await render({ version: 2, path: prefix, elapsedMs: null }); await start();
    await lifecycle('pagehide', 1000);
    await lifecycle('pageshow', 61000);
    await lifecycle('pagehide', 62000);
    expect(saved()).toEqual({ version: 2, path: prefix, elapsedMs: null });
  });
});

describe('Ribbon tap rewind', () => {
  it.each(['off-board movement', 'off-board release', 'coalesced exit and return'])('preserves the path after %s', async kind => {
    const { board, inside, outside, captured } = await beginRewind();
    if (kind === 'off-board movement') board.dispatchEvent(pointer('pointermove', outside));
    if (kind === 'coalesced exit and return') {
      const event = pointer('pointermove', inside);
      Object.defineProperty(event, 'getCoalescedEvents', { value: () => [pointer('pointermove', outside), pointer('pointermove', inside)] });
      board.dispatchEvent(event);
    }
    board.dispatchEvent(pointer('pointerup', kind === 'coalesced exit and return' ? inside : outside));
    await tick();
    expect(saved().path).toEqual(prefix);
    expect(captured.size).toBe(0);
  });

  it('still rewinds a genuine tap to the selected earlier cell', async () => {
    const { board, inside, captured } = await beginRewind();
    board.dispatchEvent(pointer('pointerup', inside)); await tick();
    expect(saved().path).toEqual(prefix.slice(0, rewindIndex + 1));
    expect(captured.size).toBe(0);
  });

  it.each(['pointercancel', 'lostpointercapture'])('preserves the path on %s', async type => {
    const { board, inside } = await beginRewind();
    board.dispatchEvent(pointer(type, inside)); await tick();
    expect(saved().path).toEqual(prefix);
  });
});
