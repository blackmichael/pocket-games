<script lang="ts">
  import { onMount, tick } from 'svelte';
  import GameHelp from '#lib/platform/GameHelp.svelte';
  import ResultDialog from '#lib/platform/ResultDialog.svelte';
  import { loadSave, saveSave } from '#lib/platform/storage.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import { shareResult, supportsNativeShare } from '#lib/platform/share.js';
  import { generate, placementConflicts, isSolved, parseSavedGame, SAVE_VERSION, SIZE } from './engine.js';

  let { identity }: { identity: PuzzleIdentity } = $props();
  const puzzle = $derived(generate(identity.seed));
  const key = $derived(puzzleKey(identity));
  const confettiPieces = Array.from({ length: 18 }, (_, index) => index);
  const confettiColors = ['#ad8beb', '#f5c542', '#59cda4', '#f58676'];
  let selected = $state<number[]>([]);
  let ready = $state(false);
  let started = $state(false);
  let boardElement = $state<HTMLDivElement | null>(null);
  let warning = $state<string | null>(null);
  let message = $state('');
  let solved = $state(false);
  let resultOpen = $state(false);
  let elapsedMs = $state(0);
  let timeRecorded = $state(true);
  const conflicts = $derived(selected.filter((cell) => placementConflicts(selected, cell, puzzle).length > 0));
  let celebrating = $state(false);
  let shareText = $state('');
  let shareMessage = $state('');
  let shareFallback = $state(false);
  let sharing = $state(false);
  let nativeSharing = $state(false);
  let showCopyToast = $state(false);
  let accumulatedMs = 0;
  let startedAt = 0;
  let timerHandle: number | undefined;
  let celebrationHandle: number | undefined;
  const elapsedText = $derived(formatElapsed(elapsedMs));

  $effect(() => {
    if (!showCopyToast) return;
    const timeout = window.setTimeout(() => { showCopyToast = false; }, 4000);
    return () => window.clearTimeout(timeout);
  });

  function formatElapsed(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function elapsedNow(): number {
    if (!started || solved) return elapsedMs;
    return Math.floor(accumulatedMs + Math.max(0, performance.now() - startedAt));
  }

  function updateElapsed() {
    if (ready && started && !solved) elapsedMs = elapsedNow();
  }

  function stopClock() {
    if (timerHandle !== undefined) window.clearInterval(timerHandle);
    timerHandle = undefined;
  }

  function persist() {
    updateElapsed();
    warning = saveSave(key, { version: SAVE_VERSION, selected, elapsedMs: timeRecorded ? elapsedMs : null });
  }

  onMount(() => {
    const restored = loadSave(key, (value) => parseSavedGame(value, puzzle));
    selected = restored.value?.selected ?? [];
    warning = restored.warning;
    solved = isSolved(selected, puzzle);
    timeRecorded = !(solved && restored.value?.elapsedMs === null);
    accumulatedMs = restored.value?.elapsedMs ?? 0;
    elapsedMs = accumulatedMs;
    started = solved;
    nativeSharing = supportsNativeShare();
    ready = true;
    message = solved ? 'Puzzle solved. All ten kings are in place.' : '';
    const storageKey = key;
    const onHidden = () => { if (document.visibilityState === 'hidden') persist(); };
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      if (!solved) saveSave(storageKey, { version: SAVE_VERSION, selected, elapsedMs: elapsedNow() });
      ready = false;
      stopClock();
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
    message = selected.length ? `${selected.length} of ${SIZE} kings placed.` : '';
    await tick();
    boardElement?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function toggle(cell: number) {
    if (!ready || !started || solved) return;
    updateElapsed();
    if (selected.includes(cell)) {
      selected = selected.filter((placed) => placed !== cell);
      message = `King removed. ${selected.length} of ${SIZE} kings placed.`;
    } else {
      selected = [...selected, cell];
      message = `${selected.length} of ${SIZE} kings placed.`;
    }
    solved = isSolved(selected, puzzle);
    if (solved) {
      stopClock();
      celebrating = true;
      resultOpen = true;
      celebrationHandle = window.setTimeout(() => { celebrating = false; }, 1600);
      message = `Solved in ${elapsedText}. All ten kings are in place.`;
    }
    persist();
  }

  function reset() {
    if (!ready || !started || solved) return;
    selected = [];
    message = 'Board cleared. The timer is still running.';
    persist();
  }

  async function handleShare(event: MouseEvent) {
    if (!ready || !solved || sharing) return;
    (event.currentTarget as HTMLButtonElement).blur();
    showCopyToast = false;
    const text = [
      'Kings — solved',
      identity.mode === 'daily' ? `Daily puzzle · ${identity.date}` : 'Seeded puzzle',
      timeRecorded ? `Time: ${elapsedText}` : 'Time not recorded'
    ].join('\n');
    const url = puzzleUrl(identity, window.location.origin);
    sharing = true;
    shareMessage = '';
    shareFallback = false;
    try {
      const outcome = await shareResult({ title: 'Kings — Pocket Games', text, url });
      if (!ready || outcome === 'cancelled') return;
      showCopyToast = outcome === 'copied';
    } catch {
      if (!ready) return;
      shareText = `${text}\n\n${url}`;
      shareFallback = true;
      shareMessage = 'Clipboard access is unavailable. Select and copy your result below.';
    } finally {
      sharing = false;
    }
  }
</script>

{#snippet crown()}
  <svg class="crown" viewBox="0 0 72 64" aria-hidden="true" focusable="false">
    <path class="crown-white" d="M18 47C8 40 1 29 5 22c5-12 18-9 29-1l-4 23Zm36 0c10-7 17-18 13-25-5-12-18-9-29-1l4 23Z" />
    <path class="crown-arches" d="M20 46C9 35 10 15 29 17m23 29c11-11 10-31-9-29" />
    <path class="crown-pearls" d="M5 25C6 12 20 12 33 21m34 4C66 12 52 12 39 21" />
    <path class="crown-black" d="M33 20h6c1 8 2 16 4 25H29c2-9 3-17 4-25Z" />
    <path class="crown-detail" d="M33 25 31 39m8-14 2 14" />
    <circle class="crown-highlight" cx="36" cy="25" r="1.1" />
    <circle class="crown-highlight" cx="36" cy="29" r="1.1" />
    <path class="crown-black" transform="translate(36 9) scale(.8) translate(-36 -9)" d="M36 1c-1 2-2 3-4 3 2 2 3 3 3 5-2 0-3-1-5-3 0 2-1 3-3 4 2 1 3 2 3 4 2-2 3-3 5-3 0 2-1 3-3 5h8c-2-2-3-3-3-5 2 0 3 1 5 3 0-2 1-3 3-4-2-1-3-2-3-4-2 2-3 3-5 3 0-2 1-3 3-5-2 0-3-1-4-3Z" />
    <circle class="crown-white" cx="36" cy="18" r="4" />
    <path class="crown-black" d="M36 15c-2 2-2 4 0 6 2-2 2-4 0-6Z" />
    <path class="crown-black" d="m10 39 8 4 7-3 11 3 11-3 7 3 8-4-4 12H14Z" />
    <path class="crown-black" d="M36 30c-2 3-4 5-4 8 0 2 2 3 3 4-4-2-6-4-8-2-3 3 1 6 5 4l2 4h4l2-4c4 2 8-1 5-4-2-2-4 0-8 2 1-1 3-2 3-4 0-3-2-5-4-8Z" />
    <path class="crown-detail" d="M36 34v10m-6-2 4 3m8-3-4 3" />
    <path class="crown-black" d="m18 32 3 5-3 4-3-4Zm36 0 3 5-3 4-3-4Z" />
    <path class="crown-white" d="M18 39c-2-4-6-3-6 0 0 2 3 3 5 3l-1 4h4l-1-4c2 0 5-1 5-3 0-3-4-4-6 0Zm36 0c-2-4-6-3-6 0 0 2 3 3 5 3l-1 4h4l-1-4c2 0 5-1 5-3 0-3-4-4-6 0Z" />
    <path class="crown-black" d="M13 47q23-5 46 0l2 13q-25 5-50 0Z" />
    <path class="crown-detail" d="M14 49q22-4 44 0M13 59q23-4 46 0" />
    <path class="crown-highlight" d="m36 49 4 5-4 5-4-5Zm-13 2 3 3-3 3-3-3Zm26 0 3 3-3 3-3-3Z" />
  </svg>
{/snippet}


<section class="kings" aria-label="Kings game">
  {#if warning}<p class="notice" role="status">{warning}</p>{/if}
  <div class="game-meta">
    {#if solved}
      <button class="text-link result-trigger" type="button" onclick={() => { resultOpen = true; }} aria-haspopup="dialog" aria-controls="kings-result-dialog">View result</button>
    {:else}
      <span>{selected.length} / {SIZE} kings</span>
    {/if}
  <GameHelp game="Kings">
    <p>Choose ten squares. Use each row, column, and colored region exactly once. No two kings may share an edge or corner. Tap a placed king to remove it. Conflicting crowns stay on the board, outlined and marked with × until you resolve their placements.</p>
    <p>Select Start puzzle or Resume puzzle to uncover the board and start the timer. It stops when you solve the puzzle. Your board and elapsed time are saved in this browser; time before starting or with the page closed does not count.</p>
  </GameHelp>
    <span class="timer"><span>Time</span>
      {#if timeRecorded}<time datetime="PT{Math.floor(elapsedMs / 1000)}S" aria-live="off">{elapsedText}</time>
      {:else}<span aria-label="Time was not recorded">—</span>{/if}
    </span>
  </div>
  <div class="board-wrap" style:--size={SIZE}>
    {#if started}
    <div class="board" role="grid" aria-label="Ten by ten puzzle board" aria-busy={!ready} bind:this={boardElement}>
      {#each Array(SIZE) as _, row}
        <div class="board-row" role="row" aria-label="Row {row + 1}">
          {#each Array(SIZE) as __, column}
            {@const cell = row * SIZE + column}
            {@const region = puzzle.regions[cell]}
            {@const conflicting = conflicts.includes(cell)}
            <button
              class="cell region-{region}"
              class:chosen={selected.includes(cell)}
              class:conflicting
              class:region-right={column < SIZE - 1 && puzzle.regions[cell + 1] !== region}
              class:region-bottom={row < SIZE - 1 && puzzle.regions[cell + SIZE] !== region}
              type="button"
              role="gridcell"
              aria-label="Row {row + 1}, column {column + 1}, region {region + 1}{selected.includes(cell) ? ', king placed' : ', empty'}{conflicting ? ', conflicting placement' : ''}"
              aria-selected={selected.includes(cell)}
              aria-invalid={conflicting ? 'true' : undefined}
              aria-describedby={conflicting ? 'kings-status' : undefined}
              disabled={!ready || solved}
              onclick={() => toggle(cell)}
            >
              {#if selected.includes(cell)}{@render crown()}{/if}
              {#if conflicting}<span class="invalid-mark" aria-hidden="true">×</span>{/if}
            </button>
          {/each}
        </div>
      {/each}
    </div>
    {:else}
      <div class="start-cover" role="group" aria-label="Puzzle start cover">
        <div class="preview-board" aria-hidden="true">
          {#each Array(SIZE * SIZE) as _, cell}
            <span class="preview-cell region-{(Math.floor(cell / SIZE) + cell % SIZE) % SIZE}"></span>
          {/each}
        </div>
        <div class="start-veil" aria-hidden="true"></div>
        <button class="button start-button" type="button" disabled={!ready} onclick={startPuzzle}>
          {selected.length || elapsedMs ? 'Resume puzzle' : 'Start puzzle'}
        </button>
      </div>
    {/if}
    {#if celebrating}
      <div class="confetti" aria-hidden="true">
        {#each confettiPieces as index}
          <span class="confetti-piece" style:--left="{(index * 37) % 100}%" style:--drift="{(index % 2 ? 1 : -1) * (16 + index * 5)}px" style:--spin="{180 + index * 43}deg" style:--delay="{(index % 4) * 50}ms" style:--color={confettiColors[index % confettiColors.length]}></span>
        {/each}
      </div>
    {/if}
  </div>
  <p id="kings-status" class:status={!solved} class:sr-only={solved} class:empty={!message && !conflicts.length} class:error={conflicts.length > 0} role="status" aria-live="polite" aria-atomic="true">{#if conflicts.length}{conflicts.length} crowns conflict. Marked crowns share a row, column, or region, or touch. Tap a crown to remove it.{:else}{message}{/if}</p>
  {#if solved}
    <ResultDialog id="kings-result-dialog" headingId="kings-result-heading" bind:open={resultOpen} onDismiss={() => { celebrating = false; }}>
    <section class="result" aria-labelledby="kings-result-heading">
      <div class="result-crown" aria-hidden="true">{@render crown()}</div>
      <h2 id="kings-result-heading" class="success">Royal victory!</h2>
      <p>All ten kings are in place.</p>
      {#if timeRecorded}<p class="result-time">Solved in <strong>{elapsedText}</strong></p>
      {:else}<p class="result-time">Time wasn’t recorded for this earlier solve.</p>{/if}
      <button class="button share-button" type="button" onclick={handleShare} disabled={sharing}>
        {nativeSharing ? 'Share' : 'Copy'}
      </button>
      <p class="share-status" role="status" aria-live="polite">{shareMessage}</p>
      {#if shareFallback}
        <label class="share-label" for="kings-share">Your shareable result</label>
        <textarea
          id="kings-share"
          class="share-fallback"
          readonly
          rows={5}
          value={shareText}
          onclick={(event) => event.currentTarget.select()}
        ></textarea>
      {/if}
    </section>
      <div class="copy-toast" role="status" aria-live="polite" aria-atomic="true">
        {#if showCopyToast}<span>Result copied.</span>{/if}
      </div>
    </ResultDialog>
  {:else}
    <button class="text-link clear-button" type="button" onclick={reset} disabled={!ready || !started || selected.length === 0}>Clear board</button>
  {/if}
</section>

<style>
  .kings { --invalid: #a3263d; text-align: center; min-width: 0; }
  .game-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; font-size: .85rem; font-weight: 650; }
  .timer { display: inline-flex; align-items: baseline; gap: 8px; }
  .timer > span:first-child { color: var(--muted); font-weight: 400; }
  time { font-variant-numeric: tabular-nums; min-width: 4ch; text-align: right; }
  .board-wrap { position: relative; width: min(100%, 440px); aspect-ratio: 1; margin: 0 auto; }
  .start-cover { position: absolute; inset: 0; z-index: 4; display: grid; place-items: center; overflow: hidden; border: 2px solid #242127; background: var(--paper); }
  .preview-board { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--size), minmax(0, 1fr)); grid-template-rows: repeat(var(--size), minmax(0, 1fr)); pointer-events: none; }
  .preview-cell { min-width: 0; min-height: 0; border-right: 1px solid #756e7b; border-bottom: 1px solid #756e7b; }
  .preview-cell:nth-child(10n) { border-right: 0; }
  .preview-cell:nth-last-child(-n + 10) { border-bottom: 0; }
  .start-veil { position: absolute; inset: 0; z-index: 1; background: var(--paper); opacity: .8; pointer-events: none; }
  .start-button { position: relative; z-index: 2; min-height: 48px; padding: .8rem 1.5rem; }
  .board { width: 100%; aspect-ratio: 1; box-sizing: border-box; display: grid; grid-template-rows: repeat(var(--size), minmax(0, 1fr)); border: 2px solid #242127; }
  .board-row { min-height: 0; display: grid; grid-template-columns: repeat(var(--size), minmax(0, 1fr)); }
  .cell { position: relative; display: grid; place-items: center; box-sizing: border-box; min-width: 0; min-height: 0; width: 100%; height: 100%; padding: 0; border: 0; border-right: 1px solid #756e7b; border-bottom: 1px solid #756e7b; border-radius: 0; color: #111; appearance: none; }
  .cell:disabled { opacity: 1; cursor: default; }
  .cell.region-right { border-right: 2px solid #242127; }
  .cell.region-bottom { border-bottom: 2px solid #242127; }
  .cell:last-child { border-right: 0; }
  .board-row:last-child .cell { border-bottom: 0; }
  .cell:focus-visible { z-index: 2; outline: 3px solid var(--accent); outline-offset: -3px; }
  .cell.conflicting { box-shadow: inset 0 0 0 2px var(--invalid); }
  .invalid-mark { position: absolute; right: 1px; bottom: 1px; display: grid; place-items: center; width: 42%; height: 42%; border: 1px solid var(--invalid); border-radius: 50%; color: var(--invalid); background: #fff; font-size: clamp(.75rem, 3vw, 1.1rem); font-weight: 800; line-height: 1; pointer-events: none; }
  .region-0 { background: #f4d8cd; }.region-1 { background: #d8e8bd; }.region-2 { background: #d3e4ef; }.region-3 { background: #ead9f2; }.region-4 { background: #f3e9b8; }.region-5 { background: #d0e9df; }
  .region-6 { background: #edcede; }.region-7 { background: #d9d8f0; }.region-8 { background: #f0dfbf; }.region-9 { background: #cce7e9; }
  .crown { display: block; width: 94%; height: 94%; overflow: visible; }
  .crown-black { fill: #000; }
  .crown-white { fill: #fff; stroke: #000; stroke-width: 2.4; stroke-linejoin: round; }
  .crown-arches { fill: none; stroke: #000; stroke-width: 4.4; stroke-linecap: round; }
  .crown-detail { fill: none; stroke: #fff; stroke-width: 1.1; stroke-linecap: round; stroke-linejoin: round; }
  .crown-pearls { fill: none; stroke: #000; stroke-width: 4.2; stroke-dasharray: .1 4.2; stroke-linecap: round; }
  .crown-highlight { fill: #fff; }
  .status { min-height: 1.5em; font-weight: 600; line-height: 1.5; }
  .status.empty { min-height: 0; margin: 0; }
  .status.error { color: var(--invalid); }
  .result-crown { width: 80px; height: 72px; margin: 8px auto 20px; }
  .success { margin: 0 0 8px; font-size: 1.5rem; color: var(--ink); }
  .result p { margin: 8px 0 0; }
  .result-time { color: var(--muted); font-size: .9rem; }
  .result-time strong { color: var(--ink); font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .share-button { min-height: 44px; margin-top: 16px; }
  .result .share-status { font-size: .82rem; }
  .share-status:empty { margin: 0; }
  .share-label { display: block; margin-top: 16px; text-align: left; font-size: .82rem; font-weight: 650; }
  .share-fallback { box-sizing: border-box; display: block; width: 100%; margin-top: 6px; padding: 12px; border: 1px solid var(--accent-line); border-radius: 6px; background: var(--paper); color: var(--ink); font-family: inherit; font-size: 1rem; line-height: 1.6; overflow-wrap: anywhere; resize: vertical; }
  .copy-toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 10; display: flex; justify-content: center; pointer-events: none; }
  .copy-toast span { max-width: 100%; padding: 12px 18px; border-radius: 8px; background: var(--ink); color: var(--paper); box-shadow: 0 3px 14px #342a4030; font-size: .9rem; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
  .result .result-crown { animation: coronation 10s cubic-bezier(.65, 0, .35, 1) infinite; transform-origin: 50% 50%; }
  .confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 3; }
  .confetti-piece { position: absolute; top: -12px; left: var(--left); width: 7px; height: 12px; background: var(--color); opacity: 0; animation: confetti-fall 1.4s var(--delay) ease-out both; }
  .confetti-piece:nth-child(3n) { border-radius: 50%; width: 8px; height: 8px; }
  .clear-button { margin-top: 16px; min-height: 44px; padding: .5rem .75rem; font-size: .85rem; }
  @keyframes coronation { 0% { transform: rotate(0deg); } 15%, 100% { transform: rotate(720deg); } }
  @keyframes confetti-fall { 0% { opacity: 0; transform: translate(0, -16px) rotate(0); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--drift), 390px) rotate(var(--spin)); } }
  @media (prefers-reduced-motion: reduce) {
    .result .result-crown { animation: none; }
    .confetti { display: none; }
  }
</style>
