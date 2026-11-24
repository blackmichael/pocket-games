<script lang="ts">
  import { onMount, tick } from 'svelte';
  import GameHelp from '#lib/platform/GameHelp.svelte';
  import ResultDialog from '#lib/platform/ResultDialog.svelte';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import { loadSave, saveSave } from '#lib/platform/storage.js';
  import { shareResult, supportsNativeShare } from '#lib/platform/share.js';
  import { SIZE, CELL_COUNT, SAVE_VERSION, generate, hasBarrier, move, isSolved, validateSave, type SavedGame } from './engine.js';
  import { barrierSegments, roundedPath, PATH_WIDTH, PATH_OUTLINE_WIDTH, type Point } from './geometry.js';

  let { identity }: { identity: PuzzleIdentity } = $props();
  const puzzle = $derived(generate(identity.seed));
  const key = $derived(puzzleKey(identity));
  let path = $state<number[]>([]);
  let ready = $state(false);
  let started = $state(false);
  let resumed = $state(false);
  let elapsedMs = $state<number | null>(0);
  let accumulatedMs = 0;
  let startedAt = 0;
  let pageSuspended = false;
  let timerHandle: number | undefined;
  let board = $state<HTMLDivElement | null>(null);
  let keyboardFocus = $state(true);
  let message = $state('');
  let warning = $state<string | null>(null);
  let resultOpen = $state(false);
  let sharing = $state(false);
  let nativeSharing = $state(false);
  let shareText = $state('');
  let shareMessage = $state('');
  let shareFallback = $state(false);
  let showCopyToast = $state(false);
  const solved = $derived(isSolved(puzzle, path));
  const elapsedText = $derived(elapsedMs === null ? 'Not recorded' : formatElapsed(elapsedMs));
  const current = $derived(path.at(-1));
  const nextCheckpoint = $derived(path.reduce((next, cell) => Math.max(next, puzzle.checkpoints[cell] + 1), 1));
  const checkpointCount = $derived(Math.max(...puzzle.checkpoints));
  const walls = $derived(barrierSegments(puzzle.barriers));
  const wallDescriptions = $derived(puzzle.checkpoints.map((_, cell) => {
    const sides: string[] = [];
    if (cell >= SIZE && hasBarrier(puzzle, cell, cell - SIZE)) sides.push('top');
    if (cell % SIZE < SIZE - 1 && hasBarrier(puzzle, cell, cell + 1)) sides.push('right');
    if (cell < CELL_COUNT - SIZE && hasBarrier(puzzle, cell, cell + SIZE)) sides.push('bottom');
    if (cell % SIZE > 0 && hasBarrier(puzzle, cell, cell - 1)) sides.push('left');
    return sides.length ? `, wall on ${sides.join(' and ')}` : '';
  }));
  // Curated outgoing hex colors for all 36 possible checkpoint labels.
  const pathColors = [
    '#AD8BEB', '#F58676', '#59CDA4', '#6ACAE8', '#F5C542', '#EE91C2',
    '#9FD568', '#F5AB64', '#CA9BEA', '#64CFCB', '#EF7F9F', '#8F9DEA',
    '#A287E5', '#EF9A73', '#7BD4AC', '#82B9F0', '#F1D466', '#E97AB5',
    '#86C678', '#F29B67', '#B78FE7', '#79CDD7', '#EA92A9', '#A5A0EB',
    '#B397EB', '#F6A28E', '#70C7B1', '#73BDE6', '#EBC15B', '#E9A0CA',
    '#AFD66E', '#F4B578', '#C38DDB', '#6DC6C6', '#F18FAB', '#97ADEB'
  ] as const;
  function pathColor(checkpoint: number): string {
    return pathColors[checkpoint - 1]!;
  }
  const activePathColor = $derived(pathColor(Math.max(1, nextCheckpoint - 1)));
  const cellTints = $derived.by(() => {
    const tints = new Array<string | undefined>(CELL_COUNT);
    let tint: string | undefined;
    for (const cell of path) {
      const checkpoint = puzzle.checkpoints[cell];
      // Checkpoints take their outgoing color; End retains the incoming color.
      // Hex alpha 1f gives a ~12% wash over the board's opaque paper surface.
      if (checkpoint && checkpoint < checkpointCount) tint = `${pathColor(checkpoint)}1f`;
      tints[cell] = tint;
    }
    return tints;
  });
  let dragHead = $state<Point | null>(null);
  let dragBounds: DOMRect | null = null;
  const drawings = $derived.by(() => {
    const vertices = path.map((cell) => ({ x: cell % SIZE + .5, y: Math.floor(cell / SIZE) + .5 }));
    if (dragHead && vertices.length) {
      const last = vertices.at(-1)!;
      const previous = vertices.at(-2);
      // Before reaching a new cell's center, draw only as far as the pointer.
      // After the center, retain it so a turn still passes through that square.
      if (previous && (dragHead.x - last.x) * (last.x - previous.x) + (dragHead.y - last.y) * (last.y - previous.y) < 0) vertices[vertices.length - 1] = dragHead;
      else if (dragHead.x !== last.x || dragHead.y !== last.y) vertices.push(dragHead);
    }
    const stretches: { from: number; d: string; color: string }[] = [];
    if (vertices.length < 2) return stretches;
    let start = 0, from = 1;
    for (let index = 1; index < path.length; index++) {
      const checkpoint = puzzle.checkpoints[path[index]];
      if (!checkpoint) continue;
      stretches.push({ from, d: roundedPath(vertices, start, index), color: pathColor(from) });
      start = index;
      from = checkpoint;
    }
    if (start < vertices.length - 1) stretches.push({ from, d: roundedPath(vertices, start, vertices.length - 1), color: pathColor(from) });
    return stretches;
  });

  let activePointer: number | null = null;
  let lastPointerCell: number | null = null;
  let pendingRewind: number | null = null;
  let canDrag = false;
  let dragAxis: 'x' | 'y' | null = null;
  const TURN_MARGIN = .12;
  const CELL_ENTRY_MARGIN = .14;
  let saveHandle: number | undefined;
  let toastHandle: number | undefined;
  // Fixed illustration: never reveal the selected puzzle or its saved progress.
  const previewCheckpoints = [
    6, 0, 0, 0, 0, 4,
    0, 3, 1, 0, 2, 0,
    0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0,
    0, 5, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0
  ];
  const previewLastCheckpoint = Math.max(...previewCheckpoints);
  const previewWalls = barrierSegments([[6, 7], [13, 19], [22, 28], [23, 29]]);

  function formatElapsed(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function updateElapsed() {
    if (!ready || !started || solved || elapsedMs === null || pageSuspended) return;
    elapsedMs = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(accumulatedMs + Math.max(0, performance.now() - startedAt)));
  }

  function stopClock() {
    if (timerHandle !== undefined) window.clearInterval(timerHandle);
    timerHandle = undefined;
  }

  async function startPuzzle() {
    if (!ready || started || solved) return;
    startedAt = performance.now();
    started = true;
    if (elapsedMs !== null) timerHandle = window.setInterval(updateElapsed, 250);
    flushSave();
    await tick();
    board?.querySelector<HTMLButtonElement>(`[data-cell="${current ?? puzzle.checkpoints.indexOf(1)}"]`)?.focus({ preventScroll: true });
  }

  function flushSave() {
    if (saveHandle !== undefined) window.clearTimeout(saveHandle);
    saveHandle = undefined;
    if (!ready || !started) return;
    updateElapsed();
    const value: SavedGame = { version: SAVE_VERSION, path: [...path], elapsedMs };
    const failure = saveSave(key, value);
    if (failure) warning = failure;
  }

  function releaseDrag() {
    const pointer = activePointer;
    activePointer = null;
    lastPointerCell = null;
    pendingRewind = null;
    canDrag = false;
    dragAxis = null;
    dragHead = null;
    dragBounds = null;
    if (pointer !== null && board?.hasPointerCapture(pointer)) board.releasePointerCapture(pointer);
  }

  function changed(next: number[]) {
    updateElapsed();
    path = next;
    dragHead = null;
    message = '';
    if (saveHandle !== undefined) window.clearTimeout(saveHandle);
    saveHandle = window.setTimeout(flushSave, 150);
    if (isSolved(puzzle, next)) {
      releaseDrag();
      stopClock();
      flushSave();
      resultOpen = true;
    }
  }

  onMount(() => {
    const restored = loadSave(key, (value) => validateSave(value, puzzle));
    warning = restored.warning;
    if (restored.value) path = restored.value.path;
    elapsedMs = restored.value ? restored.value.elapsedMs : 0;
    accumulatedMs = elapsedMs ?? 0;
    resumed = restored.value !== null && (path.length > 0 || accumulatedMs > 0);
    started = solved;
    nativeSharing = supportsNativeShare();
    const handlePointerInput = () => {
      keyboardFocus = false;
    };
    const handleKeyboardInput = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) keyboardFocus = true;
    };
    window.addEventListener('pointerdown', handlePointerInput, true);
    window.addEventListener('keydown', handleKeyboardInput, true);
    ready = true;
    const onHidden = () => { if (document.visibilityState === 'hidden') flushSave(); };
    document.addEventListener('visibilitychange', onHidden);
    const onPageHide = () => {
      if (pageSuspended) return;
      flushSave();
      accumulatedMs = elapsedMs ?? 0;
      pageSuspended = true;
      stopClock();
      releaseDrag();
    };
    const onPageShow = () => {
      if (!pageSuspended) return;
      pageSuspended = false;
      startedAt = performance.now();
      if (ready && started && !solved && elapsedMs !== null) timerHandle = window.setInterval(updateElapsed, 250);
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      flushSave();
      ready = false;
      stopClock();
      releaseDrag();
      window.removeEventListener('pointerdown', handlePointerInput, true);
      window.removeEventListener('keydown', handleKeyboardInput, true);
      if (toastHandle !== undefined) window.clearTimeout(toastHandle);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onHidden);
    };
  });

  function select(cell: number): boolean {
    if (!ready || !started || solved) return false;
    const result = move(puzzle, path, cell);
    if (result.error) { message = result.error; return false; }
    if (result.path.length !== path.length || result.path.some((value, index) => value !== path[index])) changed(result.path);
    else message = '';
    return true;
  }

  function undo() {
    if (!ready || !started || solved || !path.length) return;
    changed(path.slice(0, -1));
  }

  function clear() {
    if (!ready || !started || solved || (!path.length && elapsedMs === 0)) return;
    releaseDrag();
    accumulatedMs = 0;
    startedAt = performance.now();
    elapsedMs = 0;
    if (timerHandle === undefined) timerHandle = window.setInterval(updateElapsed, 250);
    changed([]);
    flushSave();
  }

  function cellAt(target: EventTarget | null): number | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('button[data-cell]');
    return button && board?.contains(button) ? Number(button.dataset.cell) : null;
  }

  function pointerDown(event: PointerEvent) {
    if (!ready || !started || solved || !event.isPrimary || event.button !== 0 || activePointer !== null) return;
    const cell = cellAt(event.target);
    if (cell === null || !board) return;
    activePointer = event.pointerId;
    lastPointerCell = cell;
    pendingRewind = path.includes(cell) && cell !== current ? cell : null;
    canDrag = pendingRewind === null;
    if (canDrag && !select(cell)) canDrag = false;
    if (solved) return;
    const previous = path.at(-2);
    dragAxis = previous === undefined || current === undefined ? null : previous % SIZE === current % SIZE ? 'y' : 'x';
    dragBounds = board.getBoundingClientRect();
    updateDragHead(event);
    board.setPointerCapture(event.pointerId);
    // Earlier cells rewind only on release, so a passing drag cannot erase a prefix.
    board.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true });
  }

  function updateDragHead(event: PointerEvent) {
    dragHead = null;
    if (!ready || !started || !canDrag || current === undefined || solved || !dragBounds?.width || !dragBounds.height) return;
    const x = (event.clientX - dragBounds.left) / dragBounds.width * SIZE;
    const y = (event.clientY - dragBounds.top) / dragBounds.height * SIZE;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
    const centerX = current % SIZE + .5, centerY = Math.floor(current / SIZE) + .5;
    // Hold the preview at the edge until the pointer enters the next cell far
    // enough to commit it. This also avoids snapping back on boundary jitter.
    if (Math.abs(x - centerX) > .5 + CELL_ENTRY_MARGIN || Math.abs(y - centerY) > .5 + CELL_ENTRY_MARGIN) return;
    const dx = Math.max(-.5, Math.min(.5, x - centerX));
    const dy = Math.max(-.5, Math.min(.5, y - centerY));
    if (dragAxis === null) dragAxis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    else if (dragAxis === 'x' && Math.abs(dy) > Math.abs(dx) + TURN_MARGIN) dragAxis = 'y';
    else if (dragAxis === 'y' && Math.abs(dx) > Math.abs(dy) + TURN_MARGIN) dragAxis = 'x';
    const along = dragAxis === 'x' ? dx : dy;
    const across = dragAxis === 'x' ? dy : dx;
    // Ease through the center instead of jumping between perpendicular tails.
    const t = Math.max(0, Math.min(1, (Math.abs(along) - Math.abs(across) - TURN_MARGIN) / .2));
    let offset = along * t * t * (3 - 2 * t);
    const neighbor = current + Math.sign(offset) * (dragAxis === 'x' ? 1 : SIZE);
    // Keep the tip and its outline clear of the wall's near edge.
    if (offset && hasBarrier(puzzle, current, neighbor)) offset = Math.sign(offset) * Math.min(Math.abs(offset), .45 - PATH_OUTLINE_WIDTH / 2);
    dragHead = dragAxis === 'x' ? { x: centerX + offset, y: centerY } : { x: centerX, y: centerY + offset };
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    const samples = event.getCoalescedEvents?.();
    if (samples?.length) for (const sample of samples) {
      advancePointer(sample);
      if (event.pointerId !== activePointer) return;
    }
    advancePointer(event);
    updateDragHead(event);
  }

  function advancePointer(event: PointerEvent) {
    const cell = cellAt(document.elementFromPoint(event.clientX, event.clientY));
    if (cell === lastPointerCell) return;
    pendingRewind = null;
    if (cell === null) return;
    if (!canDrag || current === undefined || solved || cell === current) {
      lastPointerCell = cell;
      return;
    }
    const from = current;
    const sameRow = Math.floor(from / SIZE) === Math.floor(cell / SIZE);
    if (!sameRow && from % SIZE !== cell % SIZE) {
      lastPointerCell = cell;
      message = 'Drag along a row or column.';
      return;
    }
    if (dragBounds?.width && dragBounds.height) {
      const position = sameRow ? (event.clientX - dragBounds.left) / dragBounds.width * SIZE : (event.clientY - dragBounds.top) / dragBounds.height * SIZE;
      const target = sameRow ? cell % SIZE : Math.floor(cell / SIZE);
      const forward = cell > from;
      if (forward ? position < target + CELL_ENTRY_MARGIN : position > target + 1 - CELL_ENTRY_MARGIN) return;
    }
    lastPointerCell = cell;
    const step = sameRow ? Math.sign(cell - from) : Math.sign(cell - from) * SIZE;
    for (let next = from + step; ; next += step) {
      if (path.includes(next) && next !== path.at(-2)) {
        message = 'Trace backward along your path to undo.';
        break;
      }
      if (!select(next) || solved) break;
      dragAxis = sameRow ? 'x' : 'y';
      if (next === cell) break;
    }
  }

  function pointerEnd(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    const rewind = event.type === 'pointerup' && pendingRewind !== null &&
      cellAt(document.elementFromPoint(event.clientX, event.clientY)) === pendingRewind ? pendingRewind : null;
    releaseDrag();
    if (rewind !== null) select(rewind);
    flushSave();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!ready || !started || solved || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || document.querySelector('dialog[open]')) return;
    if (!(event.target instanceof HTMLElement) || !board?.contains(event.target)) return;
    if (event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || event.target.isContentEditable) return;
    if (event.key === 'Backspace') { event.preventDefault(); undo(); return; }
    const offsets: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const from = current;
    let cell: number;
    if (from === undefined) cell = puzzle.checkpoints.indexOf(1);
    else {
      const row = Math.floor(from / SIZE) + offset[0];
      const column = from % SIZE + offset[1];
      if (row < 0 || row >= SIZE || column < 0 || column >= SIZE) { message = 'Stay inside the board.'; return; }
      cell = row * SIZE + column;
    }
    if (select(cell) && !solved) board.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true });
  }

  function cellLabel(cell: number): string {
    const checkpoint = puzzle.checkpoints[cell];
    return `Row ${Math.floor(cell / SIZE) + 1}, column ${cell % SIZE + 1}${checkpoint ? `, checkpoint ${checkpoint}${checkpoint === checkpointCount ? ', finish' : ''}${checkpoint === nextCheckpoint ? ', next target' : ''}` : ''}, ${current === cell ? 'current endpoint' : path.includes(cell) ? 'visited' : 'unvisited'}${wallDescriptions[cell]}`;
  }

  async function handleShare(event: MouseEvent) {
    if (!ready || !solved || sharing) return;
    (event.currentTarget as HTMLButtonElement).blur();
    if (toastHandle !== undefined) window.clearTimeout(toastHandle);
    showCopyToast = false;
    const text = ['Ribbon — solved', identity.mode === 'daily' ? `Daily puzzle · ${identity.date}` : 'Seeded puzzle', elapsedMs === null ? 'Time not recorded' : `Time: ${elapsedText}`].join('\n');
    const url = puzzleUrl(identity, window.location.origin);
    sharing = true;
    shareMessage = '';
    shareFallback = false;
    try {
      const outcome = await shareResult({ title: 'Ribbon — Pocket Games', text, url });
      if (!ready || outcome === 'cancelled') return;
      if (outcome === 'copied') {
        showCopyToast = true;
        toastHandle = window.setTimeout(() => { showCopyToast = false; }, 4000);
      }
    } catch {
      if (!ready) return;
      shareText = `${text}\n\n${url}`;
      shareFallback = true;
      shareMessage = 'Clipboard access is unavailable. Select and copy your result below.';
    } finally { if (ready) sharing = false; }
  }
</script>

<section class="ribbon" aria-label="Ribbon game" aria-busy={!ready}>
  <div class="game-meta">
    {#if solved}
      <button class="text-link result-trigger" type="button" onclick={() => { resultOpen = true; }} aria-haspopup="dialog" aria-controls="ribbon-result">View result</button>
    {:else}<span>{started ? `${path.length} / ${CELL_COUNT} cells` : '6 × 6 puzzle'}</span>{/if}
    <GameHelp game="Ribbon">
      <div class="help-content">
      <ul class="help-rules">
        <li><strong>Start at 1.</strong> Visit the numbers in order.</li>
        <li><strong>Fill all 36 squares once.</strong> Finish at End.</li>
        <li>Move up, down, left or right. <strong>No diagonals, crossings or jumping walls.</strong></li>
      </ul>
      <div class="help-visuals">
        <figure>
          <svg class="help-example" viewBox="0 0 144 144" width="144" height="144" role="img" aria-label="Small example: one path fills every square from 1 through 2 to 3, labeled End." focusable="false">
            <g class="help-grid"><rect x="1" y="1" width="142" height="142" rx="4" /><path d="M48 1V143M96 1V143M1 48H143M1 96H143" /></g>
            <path class="help-route" d="M24 24H98.4A21.6 21.6 0 0 1 120 45.6V72" />
            <path class="help-route help-color" style:stroke={pathColor(1)} d="M24 24H98.4A21.6 21.6 0 0 1 120 45.6V72" />
            <path class="help-route" d="M120 72H45.6A21.6 21.6 0 0 0 24 93.6V98.4A21.6 21.6 0 0 0 45.6 120H120" />
            <path class="help-route help-color" style:stroke={pathColor(2)} d="M120 72H45.6A21.6 21.6 0 0 0 24 93.6V98.4A21.6 21.6 0 0 0 45.6 120H120" />
            <circle class="help-node" cx="24" cy="24" r="18" style:fill={pathColor(1)} />
            <circle class="help-node" cx="120" cy="72" r="18" style:fill={pathColor(2)} />
            <rect class="help-node help-end" x="102" y="102" width="36" height="36" rx="6" />
            <text x="24" y="24">1</text><text x="120" y="72">2</text>
            <text class="help-end-text" x="120" y="115">3</text><text class="help-end-text help-end-label" x="120" y="129">End</text>
          </svg>
          <figcaption>One path. Every square.</figcaption>
        </figure>
        <figure>
          <svg class="help-example" viewBox="0 0 96 96" width="144" height="144" role="img" aria-label="A path goes down, right, then up to avoid the wall between the two top squares." focusable="false">
            <g class="help-grid"><rect x="1" y="1" width="94" height="94" rx="3" /><path d="M48 1V95M1 48H95" /></g>
            <path class="help-route" d="M24 24V50.4A21.6 21.6 0 0 0 45.6 72H50.4A21.6 21.6 0 0 0 72 50.4V24" />
            <path class="help-route help-color" style:stroke={pathColor(1)} d="M24 24V50.4A21.6 21.6 0 0 0 45.6 72H50.4A21.6 21.6 0 0 0 72 50.4V24" />
            <path class="help-wall" d="M48 8V40" />
          </svg>
          <figcaption>Go around walls.</figcaption>
        </figure>
      </div>
      <p>Drag or tap a neighbor to draw. Drag back or tap your path to rewind. <strong>Clear</strong> erases the path and restarts the timer.</p>
      <details class="help-details">
        <summary>Keyboard controls</summary>
        <p>Tab to the board. Arrow keys draw from the endpoint, or start at 1 on an empty board. Enter or Space selects the focused square. Backspace removes a step.</p>
      </details>
      <details class="help-details">
        <summary>Timer &amp; saves</summary>
        <p>Start/Resume starts the clock; solving stops it. Help and background tabs count, but time with the page closed does not. Progress saves in this browser when storage is available.</p>
      </details>
      </div>
    </GameHelp>
    <span class="timer">Time {#if elapsedMs === null}<span aria-label="Not recorded">—</span>{:else}<time datetime="PT{Math.floor(elapsedMs / 1000)}S">{elapsedText}</time>{/if}</span>
  </div>
  {#if warning}<p class="notice" role="status">{warning}</p>{/if}
  {#if ready && elapsedMs === null && !solved}<p class="notice">This saved path predates timing. Resume it without a recorded time, or use Clear after resuming to begin a timed attempt.</p>{/if}
  {#if ready && started}
    <div class="board" class:complete={solved} class:keyboard-focus={keyboardFocus} role="group" aria-label="Ribbon board" aria-describedby="ribbon-status" bind:this={board} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerEnd} onpointercancel={pointerEnd} onlostpointercapture={pointerEnd}>
      {#each puzzle.checkpoints as checkpoint, cell (cell)}
        <button type="button" class="cell" class:current={current === cell} data-cell={cell} aria-label={cellLabel(cell)} aria-pressed={path.includes(cell)} aria-disabled={solved} disabled={solved} style:--visited-color={cellTints[cell]} onkeydown={handleKeydown} onclick={(event) => { if (event.detail === 0) select(cell); }}>
          {#if checkpoint}<span class="checkpoint" class:next={checkpoint === nextCheckpoint && !solved} class:finish={checkpoint === checkpointCount} style:--node-color={pathColor(checkpoint)}>{checkpoint}{#if checkpoint === checkpointCount}<span class="finish-label">End</span>{/if}</span>{/if}
        </button>
      {/each}
      <svg class="path" viewBox={`0 0 ${SIZE} ${SIZE}`} style:--path-width={PATH_WIDTH} style:--path-outline-width={PATH_OUTLINE_WIDTH} aria-hidden="true" focusable="false">
        {#each drawings as stretch (stretch.from)}
          <path class="path-outline" d={stretch.d} />
          <path d={stretch.d} style:stroke={stretch.color} />
        {/each}
        {#if current !== undefined && !puzzle.checkpoints[current]}<circle cx={dragHead?.x ?? current % SIZE + .5} cy={dragHead?.y ?? Math.floor(current / SIZE) + .5} r={PATH_WIDTH / 2} style:fill={activePathColor} />{/if}
      </svg>
      <svg class="walls" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" focusable="false">
        {#each walls as wall, index (index)}<path d={`M${wall.start.x},${wall.start.y}L${wall.end.x},${wall.end.y}`} />{/each}
      </svg>
    </div>
    <p id="ribbon-status" class="status" class:sr-only={solved} role="status" aria-live="polite" aria-atomic="true">{solved ? `Ribbon complete${elapsedMs === null ? '' : ` in ${elapsedText}`}. Every cell is connected.` : message || (path.length ? `Connect to ${nextCheckpoint}${nextCheckpoint === checkpointCount ? ' — fill every square first.' : '.'}` : 'Start at 1.')}</p>
    {#if !solved}
      <div class="controls">
        <button class="game-control" type="button" onclick={clear} disabled={!path.length && elapsedMs === 0} aria-label="Clear path and restart timer">Clear</button>
      </div>
    {/if}
  {:else}
    <div class="start-cover">
      <div class="preview-board" aria-hidden="true">
        {#each previewCheckpoints as checkpoint, cell}
          <div class="cell">
            {#if checkpoint}<span class="checkpoint" class:finish={checkpoint === previewLastCheckpoint} style:--node-color={pathColor(checkpoint)}>{#if checkpoint === previewLastCheckpoint}<span class="finish-label">End</span>{/if}</span>{/if}
          </div>
        {/each}
        <svg class="walls" viewBox={`0 0 ${SIZE} ${SIZE}`} focusable="false">
          {#each previewWalls as wall}<path d={`M${wall.start.x},${wall.start.y}L${wall.end.x},${wall.end.y}`} />{/each}
        </svg>
      </div>
      <div class="start-veil" aria-hidden="true"></div>
      <div class="start-actions">
        <p class="preview-label">Example layout</p>
        <button class="button start-button" type="button" disabled={!ready} onclick={startPuzzle}>{resumed ? 'Resume puzzle' : 'Start puzzle'}</button>
      </div>
    </div>
  {/if}
  {#if ready && solved}
    <ResultDialog id="ribbon-result" headingId="ribbon-result-heading" bind:open={resultOpen}>
      <div class="result-art" aria-hidden="true">
        <svg viewBox="0 0 120 76" width="120" height="76" fill="none"><path d="M16 18H58V58H102V18H82" /><circle cx="16" cy="18" r="7" /><circle cx="102" cy="58" r="7" /><circle cx="82" cy="18" r="7" /></svg>
      </div>
      <h2 id="ribbon-result-heading">All connected!</h2>
      <p class="summary">{CELL_COUNT} cells, {checkpointCount} checkpoints.<br />One unbroken path.</p>
      <p class="result-time">{#if elapsedMs === null}Time not recorded.{:else}Solved in <strong>{elapsedText}</strong>{/if}</p>
      <button class="button" type="button" onclick={handleShare} disabled={sharing}>{nativeSharing ? 'Share' : 'Copy'}</button>
      <p class="share-status" role="status">{shareMessage}</p>
      {#if shareFallback}<label for="ribbon-share">Your shareable result</label><textarea id="ribbon-share" readonly rows="6" value={shareText} onclick={(event) => event.currentTarget.select()}></textarea>{/if}
      <div class="copy-toast" role="status" aria-live="polite">{#if showCopyToast}<span>Result copied.</span>{/if}</div>
    </ResultDialog>
  {/if}
  <noscript><p class="notice">Ribbon needs JavaScript to check your path and save progress.</p></noscript>
</section>

<style>
  .ribbon { width: 100%; max-width: 420px; min-width: 0; margin-inline: auto; text-align: center; }
  .game-meta { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; margin-bottom: 12px; font-size: .85rem; font-weight: 650; text-align: left; }
  .timer { display: flex; justify-self: end; gap: 4px; color: var(--muted); white-space: nowrap; }
  time { color: var(--ink); font-variant-numeric: tabular-nums; min-width: 4ch; }
  .help-content { font-weight: 400; line-height: 1.5; }
  .help-rules { margin: 0; padding-left: 1.2rem; }
  .help-visuals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-block: 16px; }
  .help-visuals figure { min-width: 0; margin: 0; text-align: center; }
  .help-example { display: block; width: 100%; max-width: 144px; height: auto; margin: 0 auto 8px; }
  .help-grid { fill: none; stroke: var(--line); stroke-width: 1; }
  .help-grid rect { fill: var(--paper); }
  .help-route { fill: none; stroke: var(--ink); stroke-width: 21; stroke-linecap: round; stroke-linejoin: round; }
  .help-color { stroke-width: 19; }
  .help-node { stroke: var(--ink); stroke-width: 2; }
  .help-end { fill: var(--accent); }
  .help-example text { fill: var(--ink); font-size: 16px; font-weight: 750; text-anchor: middle; dominant-baseline: central; }
  .help-example .help-end-text { fill: var(--paper); }
  .help-example .help-end-label { font-size: 10px; }
  .help-wall { fill: none; stroke: var(--ink); stroke-width: 5; stroke-linecap: round; }
  .help-visuals figcaption { font-size: .8rem; line-height: 1.4; }
  .help-details { border-top: 1px solid var(--line); }
  .help-details[open] { padding-bottom: 12px; }
  .help-details summary { display: list-item; min-height: 44px; padding-block: 10px; box-sizing: border-box; color: var(--ink); font-weight: 650; cursor: pointer; }
  .help-details p { margin-block: 0 12px; }
  .start-cover { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 1; outline: 2px solid var(--ink); outline-offset: -1px; border-radius: 4px; overflow: hidden; background: var(--paper); }
  .preview-board { position: absolute; inset: 0; z-index: 0; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(6, 1fr); background: var(--paper); pointer-events: none; }
  .start-veil { position: absolute; inset: 0; z-index: 1; background: var(--paper); opacity: .58; }
  .start-actions { position: relative; z-index: 2; display: grid; justify-items: center; gap: 8px; }
  .preview-label { margin: 0; padding: 3px 8px; border-radius: 4px; background: var(--paper); color: var(--muted); font-size: .75rem; }
  .board { position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-template-rows: repeat(6, minmax(0, 1fr)); width: 100%; aspect-ratio: 1; isolation: isolate; touch-action: none; user-select: none; -webkit-user-select: none; outline: 2px solid var(--ink); outline-offset: -1px; border-radius: 4px; overflow: hidden; background: var(--paper); }
  .board.complete { touch-action: auto; pointer-events: none; }
  .cell { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; padding: 0; border: 0; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); border-radius: 0; background: var(--paper); color: var(--ink); appearance: none; }
  .cell[aria-pressed="true"] { background: var(--visited-color); }
  .cell:nth-child(6n) { border-right: 0; }
  .cell:nth-child(n + 31) { border-bottom: 0; }
  .cell:focus-visible { outline: none; }
  .keyboard-focus .cell:focus-visible::after { content: ''; position: absolute; z-index: 3; bottom: 2px; left: 30%; right: 30%; height: 3px; border-radius: 2px; background: var(--ink); }
  .cell[aria-disabled="true"] { cursor: default; }
  .cell:disabled { opacity: 1; touch-action: auto; }
  .checkpoint { position: relative; z-index: 2; display: grid; place-items: center; width: 76%; aspect-ratio: 1; box-sizing: border-box; border: 2px solid var(--ink); border-radius: 50%; background: var(--node-color); color: var(--ink); font-size: 1.1rem; line-height: 1; font-weight: 750; }
  .checkpoint.next { outline: 2px solid var(--ink); outline-offset: 3px; }
  .checkpoint.finish { display: flex; flex-direction: column; justify-content: center; gap: 1px; border-radius: 7px; background: var(--accent); color: var(--paper); }
  .finish-label { font-size: .625rem; line-height: 1; }
  .current .checkpoint { outline: 2px solid var(--ink); outline-offset: 2px; }
  .game-control { width: 104px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--key-line); border-radius: 6px; background: var(--key-fill); color: var(--accent-hover); font-weight: 600; }
  .game-control:hover:not(:disabled) { background: var(--accent-light); }
  .path { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }
  .path path { fill: none; stroke-width: var(--path-width); stroke-linecap: round; stroke-linejoin: round; }
  .path .path-outline { stroke: var(--ink); stroke-width: var(--path-outline-width); }
  .path circle { stroke: var(--ink); stroke-width: .045; }
  .walls { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
  .walls path { fill: none; stroke: var(--ink); stroke-width: .1; stroke-linecap: round; }
  .status { min-height: 2.8em; margin: 8px 0 0; color: var(--muted); font-size: .85rem; line-height: 1.4; }
  .controls { display: flex; justify-content: center; align-items: center; gap: 12px; font-size: .85rem; }
  .result-trigger { justify-self: start; padding: 0; text-align: left; }
  h2 { margin: 8px 0; font-size: 1.5rem; }
  .summary { margin: 8px 0 18px; line-height: 1.7; }
  .result-time { color: var(--muted); font-size: .9rem; }
  .result-time strong { color: var(--ink); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .result-art { margin: 0 auto 12px; color: var(--accent); }
  .result-art svg { max-width: 100%; overflow: visible; }
  .result-art path { stroke: currentColor; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 230; animation: ribbon-trace 10s ease-out infinite; }
  .result-art circle { fill: var(--paper); stroke: currentColor; stroke-width: 3; }
  .share-status { color: var(--muted); font-size: .85rem; }
  .share-status:empty { margin: 0; }
  label { display: block; margin-top: 16px; text-align: left; font-size: .85rem; font-weight: 650; }
  textarea { box-sizing: border-box; width: 100%; margin-top: 6px; padding: 12px; border: 1px solid var(--accent-line); border-radius: 6px; background: var(--paper); color: var(--ink); font-family: inherit; font-size: 1rem; line-height: 1.5; resize: vertical; }
  .copy-toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 10; display: flex; justify-content: center; pointer-events: none; }
  .copy-toast span { padding: 12px 18px; border-radius: 8px; background: var(--ink); color: var(--paper); font-size: .9rem; }
  @keyframes ribbon-trace { 0% { stroke-dashoffset: 230; } 15%, 100% { stroke-dashoffset: 0; } }
  @media (prefers-reduced-motion: reduce) { .result-art path { animation: none; } }
</style>
