<script lang="ts">
  import { onMount, tick } from 'svelte';
  import GameHelp from '#lib/platform/GameHelp.svelte';
  import ResultDialog from '#lib/platform/ResultDialog.svelte';
  import { loadSave, saveSave } from '#lib/platform/storage.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import { shareResult, supportsNativeShare } from '#lib/platform/share.js';
  import { generate, conflictingCells, isSolved, chooseHintCell, parseSavedGame, SAVE_VERSION, SIZE, type Cell, type Puzzle } from './engine.js';
  import poppyPortrait from './poppy.svg?url';

  let { identity }: { identity: PuzzleIdentity } = $props();
  const key = $derived(puzzleKey(identity));
  let puzzle = $state<Puzzle | null>(null);
  let board = $state<Cell[]>([]);
  let history = $state<Cell[][]>([]);
  let ready = $state(false);
  let started = $state(false);
  let resumed = $state(false);
  let solved = $state(false);
  let resultOpen = $state(false);
  let celebrating = $state(false);
  let selected = $state(0);
  let boardElement = $state<HTMLDivElement | null>(null);
  let warning = $state<string | null>(null);
  let message = $state('');
  let clearPending = $state(false);
  let elapsedMs = $state(0);
  let accumulatedMs = 0;
  let startedAt = 0;
  let timerHandle: number | undefined;
  let toastHandle: number | undefined;
  let celebrationHandle: number | undefined;
  let shareText = $state('');
  let shareError = $state('');
  let sharing = $state(false);
  let nativeSharing = $state(false);
  let showCopyToast = $state(false);
  let conflicts = $state<number[]>([]);
  const filled = $derived(board.filter((cell) => cell !== 0).length);
  const hasMoves = $derived(puzzle ? board.some((cell, index) => cell !== puzzle?.givens[index]) : false);
  const elapsedText = $derived(formatElapsed(elapsedMs));
  const hintDraw = new Uint32Array(1);
  const confettiPieces = Array.from({ length: 24 }, (_, index) => index);
  const confettiColors = ['#ad8beb', '#f5c542', '#59cda4', '#f58676'];

  $effect(() => {
    const currentBoard = board;
    const currentPuzzle = puzzle;
    conflicts = [];
    if (!started || solved || !currentPuzzle) return;
    const timeout = window.setTimeout(() => {
      conflicts = conflictingCells(currentBoard, currentPuzzle);
    }, 1000);
    return () => window.clearTimeout(timeout);
  });

  function formatElapsed(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function elapsedNow(): number {
    return started && !solved ? Math.floor(accumulatedMs + Math.max(0, performance.now() - startedAt)) : elapsedMs;
  }
  function updateElapsed() { if (ready && started && !solved) elapsedMs = elapsedNow(); }
  function stopClock() {
    if (timerHandle !== undefined) window.clearInterval(timerHandle);
    timerHandle = undefined;
  }
  function persist() {
    if (!ready || !started) return;
    updateElapsed();
    const failure = saveSave(key, { version: SAVE_VERSION, board, elapsedMs });
    if (failure) warning = failure;
  }
  onMount(() => {
    puzzle = generate(identity.seed);
    const restored = loadSave(key, (value) => parseSavedGame(value, puzzle!));
    board = restored.value?.board ?? [...puzzle.givens];
    warning = restored.warning;
    resumed = restored.value !== null && (restored.value.elapsedMs > 0 || hasMoves);
    accumulatedMs = restored.value?.elapsedMs ?? 0;
    elapsedMs = accumulatedMs;
    solved = isSolved(board, puzzle);
    started = solved;
    selected = Math.max(0, puzzle.givens.findIndex((cell) => cell === 0));
    nativeSharing = supportsNativeShare();
    ready = true;
    const onHidden = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      persist();
      ready = false;
      stopClock();
      if (toastHandle !== undefined) window.clearTimeout(toastHandle);
      if (celebrationHandle !== undefined) window.clearTimeout(celebrationHandle);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onHidden);
    };
  });
  async function startPuzzle() {
    if (!ready || started || solved) return;
    startedAt = performance.now();
    started = true;
    timerHandle = window.setInterval(updateElapsed, 250);
    await tick();
    boardElement?.querySelector<HTMLButtonElement>(`button[data-cell="${selected}"]`)?.focus();
  }
  function apply(next: Cell[], record = true) {
    if (!puzzle || !ready || !started || solved) return;
    updateElapsed();
    if (record) history = [...history, [...board]];
    board = next;
    clearPending = false;
    solved = isSolved(board, puzzle);
    message = solved ? `Solved in ${elapsedText}. All rules satisfied.` : `${filled} of 36 squares filled.`;
    if (solved) {
      stopClock();
      celebrating = true;
      resultOpen = true;
      celebrationHandle = window.setTimeout(() => { celebrating = false; }, 2200);
    }
    persist();
  }
  function setCell(cell: number, value: Cell) {
    if (!puzzle || puzzle.givens[cell] || board[cell] === value || solved || !started) return;
    const next = [...board];
    next[cell] = value;
    apply(next);
  }
  function cycle(cell: number) { selected = cell; setCell(cell, ((board[cell] + 1) % 3) as Cell); }
  function undo() {
    if (!history.length || solved) return;
    const previous = history[history.length - 1];
    history = history.slice(0, -1);
    apply(previous, false);
    message = 'Last move undone.';
  }
  function clear() {
    if (!puzzle || !hasMoves || solved) return;
    if (!clearPending) { clearPending = true; return; }
    apply([...puzzle.givens]);
    message = 'Your entries were cleared. Givens remain; the timer is still running.';
  }
  function hint() {
    if (!puzzle || !ready || !started || solved) return;
    try {
      crypto.getRandomValues(hintDraw);
    } catch {
      message = 'A hint could not be chosen. Try again.';
      return;
    }
    const cell = chooseHintCell(board, puzzle, hintDraw[0]);
    if (cell === null) return;
    updateElapsed();
    accumulatedMs = elapsedMs + 10_000;
    startedAt = performance.now();
    elapsedMs = accumulatedMs;
    selected = cell;
    setCell(cell, puzzle.solution[cell]);
    const pet = puzzle.solution[cell] === 1 ? 'Poppy' : 'Pigeon';
    message = `Hint: row ${Math.floor(cell / SIZE) + 1}, column ${cell % SIZE + 1} is ${pet}. Added a 10 second penalty.${solved ? ` Solved in ${elapsedText}.` : ''}`;
  }
  function handleKey(event: KeyboardEvent) {
    if (!started || solved || event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.matches('[data-cell]') || target.isContentEditable) return;
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -SIZE, ArrowDown: SIZE };
    if (event.key in moves) {
      event.preventDefault();
      const row = Math.floor(selected / SIZE), col = selected % SIZE;
      if ((event.key === 'ArrowLeft' && col === 0) || (event.key === 'ArrowRight' && col === SIZE - 1) || (event.key === 'ArrowUp' && row === 0) || (event.key === 'ArrowDown' && row === SIZE - 1)) return;
      selected += moves[event.key];
      boardElement?.querySelector<HTMLButtonElement>(`button[data-cell="${selected}"]`)?.focus();
      return;
    }
    const value = event.key.toLowerCase() === 'd' ? 1 : event.key.toLowerCase() === 'c' ? 2 : ['Backspace', 'Delete'].includes(event.key) ? 0 : null;
    if (value !== null) { event.preventDefault(); setCell(selected, value); }
  }
  async function handleShare(event: MouseEvent) {
    if (!ready || !solved || sharing) return;
    (event.currentTarget as HTMLButtonElement).blur();
    if (toastHandle !== undefined) window.clearTimeout(toastHandle);
    showCopyToast = false;
    const text = ['Catdog — solved', identity.mode === 'daily' ? `Daily puzzle · ${identity.date}` : 'Seeded puzzle', `Time: ${elapsedText}`].join('\n');
    const url = puzzleUrl(identity, window.location.origin);
    sharing = true;
    shareError = '';
    try {
      const outcome = await shareResult({ title: 'Catdog — Pocket Games', text, url });
      if (!ready || outcome === 'cancelled') return;
      showCopyToast = outcome === 'copied';
      if (showCopyToast) toastHandle = window.setTimeout(() => { showCopyToast = false; }, 4000);
    } catch {
      if (!ready) return;
      shareText = `${text}\n\n${url}`;
      shareError = 'Clipboard access is unavailable. Select and copy your result below.';
    } finally { sharing = false; }
  }
</script>

{#snippet symbol(value: Cell)}
  {#if value === 1}
    <img class="symbol poppy" src={poppyPortrait} width="256" height="256" alt="" aria-hidden="true" draggable="false" />
  {:else if value === 2}
    <svg class="symbol pigeon" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
      <path fill="#696968" stroke="#454544" stroke-width="2.2" stroke-linejoin="round" d="M18 57C13 43 10 18 15 4q20 4 37 34l27 1Q96 10 114 6c6 21 1 40-5 54Z" />
      <path fill="#998581" d="M20 14q2 25 7 36l18-10Q31 20 20 14m87 2q-13 7-22 25l17 10q6-22 5-35" />
      <path fill="none" stroke="#b2a69b" stroke-width="1.5" stroke-linecap="round" d="m22 20 14 20m-11-9 8 13m70-20-11 17m11-9-7 14" />
      <path fill="#747571" stroke="#484b48" stroke-width="2" d="M27 45q15-12 36-9 23-2 38 12c10 10 14 23 10 39-4 17-18 31-46 35-28-4-43-16-48-33-5-17 0-33 10-44Z" />
      <path fill="#60635f" d="M20 68q4-16 18-19l-9 24 4 17-14-2Zm77-17q11 9 12 23l-2 17-15-4 7-18Z" />
      <path fill="#f6f2e8" d="M64 40c-3 11-10 19-10 29l-6 14-20 10-6 6c9 13 25 21 43 24 19-3 34-13 42-26l-19-9-11-13c-1-14-9-21-10-32l-2 5Z" />
      <path fill="#fffaf1" d="M34 91q14-9 30-3 18-5 31 4l7 10q-16 14-38 17-21-4-35-15Z" />
      <g fill="#414840"><ellipse cx="41" cy="69" rx="14" ry="15" /><ellipse cx="88" cy="69" rx="14" ry="15" /></g>
      <g fill="#b5b75c"><ellipse cx="41" cy="69" rx="11.8" ry="12.7" /><ellipse cx="88" cy="69" rx="11.8" ry="12.7" /></g>
      <g fill="#d6c86f"><path d="M31 72q10 12 20-1-2 11-10 11-9-1-10-10Z" /><path d="M78 72q10 12 20-1-2 11-10 11-9-1-10-10Z" /></g>
      <g fill="#182b2c"><ellipse cx="42" cy="67" rx="4.8" ry="9.7" /><ellipse cx="87" cy="67" rx="4.8" ry="9.7" /></g>
      <g fill="#fff"><ellipse cx="38.5" cy="63" rx="2.3" ry="2.7" /><ellipse cx="83.5" cy="63" rx="2.3" ry="2.7" /></g>
      <path fill="#db9a8b" stroke="#ad756a" stroke-width="1.4" d="M53 92q12-6 23 0-2 5-7 8l-5 6-5-7q-5-3-6-7Z" />
      <path fill="#bc7f74" d="m63 95 2 9 4-7 6-5-6 1Z" />
      <path fill="#635148" d="m53 91 5-2 1 4-5 1m17-5 5 2-1 3-5-1Z" />
      <g fill="none" stroke-linecap="round">
        <path stroke="#7c6f65" stroke-width="1.5" d="m64 105-1 6m-9 1q5 3 9-1 4 4 9 1" />
        <path stroke="#ddd9ca" stroke-width="1.3" d="m43 93-34-6m32 12L4 98m38 7-32 7m76-19 33-6m-32 12 37-1m-38 7 32 8" />
        <path stroke="#92958a" stroke-width="1.3" d="m36 44 7 9m10-12 2 9m20-9-2 9m12-5-5 9" />
      </g>
    </svg>
  {/if}
{/snippet}

<section class="catdog" aria-label="Catdog game">
  {#if warning}<p class="notice" role="status">{warning}</p>{/if}
  <div class="game-meta">
    {#if solved}
      <button class="text-link result-trigger" type="button" onclick={() => { resultOpen = true; }} aria-haspopup="dialog" aria-controls="catdog-result-dialog">View result</button>
    {:else}
      <span>{started ? `${filled} / 36 filled` : '6 × 6 puzzle'}</span>
    {/if}
  <GameHelp game="Catdog">
    <ul>
      <li>Put three dogs and three cats in every row and column.</li>
      <li>No three matching pets consecutively across or down.</li>
      <li>= means matching neighbors; × means different neighbors.</li>
    </ul>
    <p>Shaded pets are fixed. Tap other squares to cycle empty → Poppy → Pigeon → empty.</p>
    <p>Hint reveals a random square and adds 10 seconds.</p>
    <p>Keyboard: arrows move; Enter/Space cycle; D enters Poppy, C enters Pigeon; Backspace/Delete erase.</p>
  </GameHelp>
    <span class="timer">Time <time datetime="PT{Math.floor(elapsedMs / 1000)}S">{elapsedText}</time></span>
  </div>
  <div class="board-wrap">
    {#if started && puzzle}
      <div class="board" role="grid" tabindex="-1" aria-label="Catdog puzzle" bind:this={boardElement} onkeydown={handleKey}>
        {#each Array(SIZE) as _, row}
          <div class="board-row" role="row">
            {#each Array(SIZE) as __, col}
              {@const cell = row * SIZE + col}
              {@const fixed = puzzle.givens[cell] !== 0}
              {@const invalid = conflicts.includes(cell)}
              <button type="button" class="cell" class:fixed class:invalid role="gridcell" data-cell={cell} tabindex={selected === cell ? 0 : -1} aria-readonly={fixed || solved} aria-invalid={invalid ? 'true' : undefined} aria-label="Row {row + 1}, column {col + 1}, {board[cell] === 1 ? 'Poppy' : board[cell] === 2 ? 'Pigeon' : 'empty'}{fixed ? ', fixed given' : ''}{invalid ? ', conflict' : ''}" disabled={solved} onfocus={() => { selected = cell; }} onclick={() => cycle(cell)}>
                {@render symbol(board[cell])}
                {#if invalid}<span class="invalid-mark" aria-hidden="true">×</span>{/if}
              </button>
            {/each}
          </div>
        {/each}
        {#each puzzle.clues as clue}
          {@const horizontal = clue.b - clue.a === 1}
          <span class="relation" aria-hidden="true" style:left="{((clue.a % SIZE) + (horizontal ? 1 : 0.5)) / SIZE * 100}%" style:top="{(Math.floor(clue.a / SIZE) + (horizontal ? 0.5 : 1)) / SIZE * 100}%">{clue.same ? '=' : '×'}</span>
        {/each}
      </div>
      <div class="sr-only">Relations: {#each puzzle.clues as clue}Row {Math.floor(clue.a / SIZE) + 1}, column {clue.a % SIZE + 1} and row {Math.floor(clue.b / SIZE) + 1}, column {clue.b % SIZE + 1} must be {clue.same ? 'the same' : 'different'}. {/each}</div>
    {:else}
      <div class="start-cover">
        <div class="preview-board" aria-hidden="true">{#each Array(36) as _, cell}<span>{@render symbol((cell % 4 < 2 ? 1 : 2) as Cell)}</span>{/each}</div>
        <div class="start-veil" aria-hidden="true"></div>
        <button class="button start-button" type="button" disabled={!ready} onclick={startPuzzle}>{resumed ? 'Resume puzzle' : 'Start puzzle'}</button>
      </div>
    {/if}
    {#if celebrating}
      <div class="confetti" aria-hidden="true">
        {#each confettiPieces as index}
          <span class="confetti-piece" style:--left="{(index * 37) % 100}%" style:--drift="{(index % 2 ? 1 : -1) * (16 + index * 5)}px" style:--spin="{180 + index * 43}deg" style:--delay="{(index % 4) * 65}ms" style:--color={confettiColors[index % confettiColors.length]}></span>
        {/each}
      </div>
    {/if}
  </div>
  <p class="status" class:error={conflicts.length > 0} role="status" aria-live="polite" aria-atomic="true">{#if conflicts.length}{conflicts.length} squares conflict: check row/column balance, triples, and = / × relations. Correct any marked entries.{:else}{message || (started ? 'Fill each square with Poppy or Pigeon.' : 'Start to uncover your puzzle.')}{/if}</p>
  {#if solved}
    <ResultDialog id="catdog-result-dialog" headingId="catdog-result" bind:open={resultOpen} onDismiss={() => { celebrating = false; }}>
    <section class="result" aria-labelledby="catdog-result">
      <div class="result-pets" aria-hidden="true"><span class="result-pet">{@render symbol(1)}</span><span class="result-pet">{@render symbol(2)}</span></div>
      <h2 id="catdog-result">Puzzle solved!</h2>
      <p>All rows, columns, and relations are balanced.</p>
      <p class="result-time">Solved in <strong>{elapsedText}</strong></p>
      <button class="button share-button" type="button" onclick={handleShare} disabled={sharing}>{nativeSharing ? 'Share' : 'Copy'}</button>
      {#if shareError}<p role="status">{shareError}</p><label for="catdog-share">Your shareable result</label><textarea id="catdog-share" readonly rows={5} value={shareText} onclick={(event) => event.currentTarget.select()}></textarea>{/if}
    </section>
      <div class="copy-toast" role="status" aria-live="polite" aria-atomic="true">{#if showCopyToast}<span>Result copied.</span>{/if}</div>
    </ResultDialog>
  {:else}
    <div class="controls"><button class="button secondary" type="button" disabled={!started || !history.length} onclick={undo}>Undo</button><button class="button secondary" type="button" disabled={!ready || !started} onclick={hint}>Hint</button><button class="button secondary clear-button" type="button" disabled={!started || !hasMoves} onclick={clear}><span class:inactive={clearPending} aria-hidden={clearPending}>Clear entries</span><span class:inactive={!clearPending} aria-hidden={!clearPending}>Confirm?</span></button></div>
  {/if}
</section>

<style>
  .catdog { --invalid: #a3263d; min-width: 0; text-align: center; }
  .game-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: .85rem; font-weight: 650; }
  .timer { display: flex; gap: 8px; color: var(--muted); }
  time { color: var(--ink); font-variant-numeric: tabular-nums; min-width: 4ch; }
  .board-wrap { position: relative; width: min(100%, 396px); aspect-ratio: 1; margin: 0 auto; }
  .board { position: relative; display: grid; grid-template-rows: repeat(6, minmax(0, 1fr)); height: 100%; border: 2px solid #52425c; background: white; }
  .board-row { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); min-height: 0; }
  .cell { position: relative; display: grid; place-items: center; min-width: 0; min-height: 0; padding: 5px; border: 0; border-right: 1px solid #c1b7c8; border-bottom: 1px solid #c1b7c8; border-radius: 0; background: white; cursor: pointer; color: var(--ink); touch-action: manipulation; }
  .cell:last-child { border-right: 0; }
  .board-row:last-of-type .cell { border-bottom: 0; }
  .cell.fixed { background: #f5f2f7; cursor: default; }
  .cell:disabled { opacity: 1; cursor: default; }
  .cell:focus-visible { z-index: 2; outline: 3px solid var(--accent); outline-offset: -4px; }
  .cell.invalid { box-shadow: inset 0 0 0 2px var(--invalid); }
  .symbol { width: 88%; height: 88%; overflow: visible; }
  .invalid-mark { position: absolute; top: 0; right: 3px; color: var(--invalid); font-size: 15px; line-height: 1; font-weight: 800; }
  .relation { position: absolute; transform: translate(-50%, -50%); z-index: 3; width: 16px; height: 16px; line-height: 14px; border-radius: 4px; background: white; color: #36293e; font-size: 16px; font-weight: 800; pointer-events: none; }
  .start-cover { position: absolute; inset: 0; display: grid; place-items: center; border: 2px solid #52425c; overflow: hidden; background: white; }
  .preview-board { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(6, 1fr); }
  .preview-board > span { display: grid; place-items: center; border: 1px solid #c1b7c8; }
  .start-veil { position: absolute; inset: 0; background: #fff; opacity: .87; }
  .start-button { position: relative; z-index: 1; }
  .status { min-height: 2.8em; margin: 12px 0; font-size: .85rem; color: var(--muted); }
  .status.error { color: var(--invalid); }
  .controls { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
  .controls button { min-height: 44px; }
  .clear-button { display: grid; }
  .clear-button span { grid-area: 1 / 1; }
  .clear-button .inactive { visibility: hidden; }
  .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 4; }
  .confetti-piece { position: absolute; top: -14px; left: var(--left); width: 8px; height: 13px; background: var(--color); opacity: 0; animation: confetti-fall 1.9s var(--delay) ease-out both; }
  .confetti-piece:nth-child(3n) { border-radius: 50%; width: 9px; height: 9px; }
  .result-pets { display: flex; justify-content: center; gap: 8px; margin-bottom: 6px; }
  .result-pet { display: grid; place-items: center; width: 76px; height: 76px; }
  .result .result-pet { animation: pet-bounce 10s ease-out infinite; }
  .result .result-pet:last-child { animation-delay: .1s; }
  .result h2 { margin: 0 0 8px; font-size: 1.5rem; color: var(--ink); }
  .result p { margin: 8px 0 0; }
  .result-time { color: var(--muted); font-size: .9rem; }
  .result-time strong { color: var(--ink); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .share-button { min-height: 44px; margin-top: 16px; }
  textarea { display: block; box-sizing: border-box; width: 100%; margin-top: 8px; font-size: 16px; }
  .copy-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 20; pointer-events: none; }
  .copy-toast span { display: block; border-radius: 10px; padding: 12px 20px; background: var(--ink); color: var(--paper); box-shadow: 0 4px 18px #0002; white-space: nowrap; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes confetti-fall { 0% { opacity: 0; transform: translate(0, -16px) rotate(0); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--drift), 430px) rotate(var(--spin)); } }
  @keyframes pet-bounce { 0% { transform: none; } 1.2% { transform: translateY(14px) scale(.65) rotate(-10deg); } 3.6% { transform: translateY(-16px) scale(1.12) rotate(7deg); } 6.6% { transform: translateY(3px) scale(.97) rotate(-3deg); } 10.2%, 100% { transform: none; } }
  @media (prefers-reduced-motion: reduce) {
    .confetti { display: none; }
    .result .result-pet { animation: none; }
  }
  @media (max-width: 500px) {
    .board-wrap { width: min(100%, 320px); }
    .status { min-height: 2em; margin: 10px 0; }
  }
  @media (max-width: 360px) {
    .controls .button { padding-inline: .5rem; }
  }
</style>
