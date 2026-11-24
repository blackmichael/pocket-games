<script lang="ts">
  import { onMount, tick } from 'svelte';
  import GameHelp from '#lib/platform/GameHelp.svelte';
  import ResultDialog from '#lib/platform/ResultDialog.svelte';
  import WordKeyboard from '#lib/platform/WordKeyboard.svelte';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import { loadSave, saveSave } from '#lib/platform/storage.js';
  import { shareResult, supportsNativeShare } from '#lib/platform/share.js';
  import { generate, moveError, validateSave, isSolved, type Save } from './engine.js';

  let { identity }: { identity: PuzzleIdentity } = $props();
  const puzzle = $derived(generate(identity.seed, identity.generatorVersion));
  const key = $derived(puzzleKey(identity));
  let ready = $state(false);
  let steps = $state<string[]>([]);
  let draft = $state('');
  let message = $state('');
  let warning = $state<string | null>(null);
  let resultOpen = $state(false);
  let history = $state<HTMLDivElement | null>(null);
  let sharing = $state(false);
  let nativeSharing = $state(false);
  let shareText = $state('');
  let shareMessage = $state('');
  let shareFallback = $state(false);
  let showCopyToast = $state(false);
  const current = $derived(steps.at(-1) ?? puzzle.start);
  const solved = $derived(isSolved(puzzle, steps));

  $effect(() => {
    if (!showCopyToast) return;
    const timeout = window.setTimeout(() => { showCopyToast = false; }, 4000);
    return () => window.clearTimeout(timeout);
  });

  function persist() {
    if (!ready) return;
    const save: Save = { version: 1, steps: [...steps], draft };
    const failure = saveSave(key, save);
    if (failure) warning = failure;
  }

  onMount(() => {
    const restored = loadSave(key, (value) => validateSave(value, puzzle));
    warning = restored.warning;
    if (restored.value) {
      steps = restored.value.steps;
      draft = restored.value.draft;
    }
    nativeSharing = supportsNativeShare();
    ready = true;
    void tick().then(() => { if (ready && history) history.scrollTop = history.scrollHeight; });
    window.addEventListener('keydown', handleKeydown);
    return () => {
      ready = false;
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  function enterKey(key: string) {
    if (!ready || solved) return;
    if (key === 'Enter') { void submit(); return; }
    if (key === 'Backspace') {
      if (!draft.length) return;
      draft = draft.slice(0, -1);
    } else if (/^[a-zA-Z]$/.test(key) && draft.length < 4) draft += key.toUpperCase();
    else return;
    message = '';
    persist();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!ready || solved || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === 'Enter' && target.closest('button, a, summary, [role="button"]')) return;
    }
    if (event.key === 'Enter' || event.key === 'Backspace' || /^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      enterKey(event.key);
    }
  }

  async function submit() {
    if (!ready || solved) return;
    const error = moveError(current, draft, puzzle.generatorVersion);
    if (error) { message = error; return; }
    steps = [...steps, draft];
    draft = '';
    message = '';
    resultOpen = solved;
    persist();
    await tick();
    if (history) history.scrollTop = history.scrollHeight;
  }

  async function handleShare(event: MouseEvent) {
    if (!ready || !solved || sharing) return;
    (event.currentTarget as HTMLButtonElement).blur();
    showCopyToast = false;
    const text = [
      'Word Ladder — solved',
      identity.mode === 'daily' ? `Daily puzzle · ${identity.date}` : 'Seeded puzzle',
      `${steps.length} steps · Shortest route: ${puzzle.shortest}`
    ].join('\n');
    const url = puzzleUrl(identity, window.location.origin);
    sharing = true;
    shareMessage = '';
    shareFallback = false;
    try {
      const outcome = await shareResult({ title: 'Word Ladder — Pocket Games', text, url });
      if (!ready || outcome === 'cancelled') return;
      showCopyToast = outcome === 'copied';
    } catch {
      if (!ready) return;
      shareText = `${text}\n\n${url}`;
      shareFallback = true;
      shareMessage = 'Clipboard access is unavailable. Select and copy your result below.';
    } finally { sharing = false; }
  }
</script>

<section class="ladder" aria-label="Word Ladder game" aria-busy={!ready}>
  <div class="game-meta">
    {#if solved}<button class="text-link result-trigger" type="button" onclick={() => { resultOpen = true; }} aria-haspopup="dialog" aria-controls="ladder-result">View result</button>
    {:else}<span>{steps.length} {steps.length === 1 ? 'step' : 'steps'}</span>{/if}
    <GameHelp game="Word Ladder">
      <p>Connect the starting word to the destination; the two words share no letters. Enter a complete four-letter word using your keyboard or the on-screen keys, changing <strong>exactly one letter</strong> from the current word, then press <strong>Enter</strong>.</p>
      {#if identity.generatorVersion === 1}
        <p>This pinned v1 puzzle uses the original, smaller dictionary.</p>
      {:else}
        <p>Starting and destination words come from a smaller, familiar-word list. Connecting words can use the broader dictionary, including regional spellings and accent-free forms. Proper names and abbreviations are excluded.</p>
      {/if}
      <p>There is no move limit and no undo. You may revisit a word, but it adds another step. Rejected entries do not count.</p>
      <p>Green letters match the destination in the same position. An underline below a letter box marks the changed letter. Matching letters are not locked; a route may need to change them again.</p>
      <p>Any valid route to the destination completes the puzzle. The shortest route is shown at the end for reference, not as a target you must match. Progress is saved in this browser when storage is available; sharing does not reveal the words.</p>
    </GameHelp>
  </div>
  {#if warning}<p class="notice" role="status">{warning}</p>{/if}

  {#if ready}
    <div class="destination"><span>Destination</span><strong>{puzzle.target}</strong></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable history needs keyboard access.) -->
    <div class="history" role="region" aria-label="Your word ladder" tabindex="0" bind:this={history}>
    <ol start="0">
      {#each [puzzle.start, ...steps] as word, index (index)}
        <li class:latest={index === steps.length}>
          <span class="step-number">{index === 0 ? 'Start' : index}</span>
          <span class="word" role="group" aria-label={word}>
            {#each word as letter, position (position)}
              {@const changed = index > 0 && letter !== (index === 1 ? puzzle.start : steps[index - 2])[position]}
              {@const correct = letter === puzzle.target[position]}
              <span class:changed class:correct role="img" aria-label={`${letter}, ${correct ? 'matches destination' : 'different from destination'}${changed ? ', changed letter' : ''}`}>{letter}</span>
            {/each}
          </span>
        </li>
      {/each}
    </ol>
    </div>
    {#if !solved}
      <p id="ladder-instruction" class="entry-instruction">Change one letter in <strong>{current}</strong>.</p>
      <div class="word draft" role="group" aria-describedby="ladder-instruction ladder-status" aria-label={`Next word: ${draft || 'empty'}`}>
        {#each Array.from({ length: 4 }, (_, index) => index) as position (position)}
          <span>{draft[position] ?? ''}</span>
        {/each}
      </div>
    {/if}
    <p id="ladder-status" class="status" class:sr-only={solved} role="status" aria-live="polite">{solved ? `Destination reached in ${steps.length} steps.` : message}</p>
    {#if !solved}<WordKeyboard onkey={enterKey} disabled={!ready} describedBy="ladder-instruction ladder-status" />{/if}
  {:else}
    <p role="status">Loading…</p>
  {/if}

  {#if ready && solved}
    <ResultDialog id="ladder-result" headingId="ladder-result-heading" bind:open={resultOpen}>
      <div class="result-art" aria-hidden="true">{#each puzzle.target as letter, index (index)}<span>{letter}</span>{/each}</div>
      <h2 id="ladder-result-heading">Destination reached!</h2>
      <p class="summary">Your route: <strong>{steps.length} steps</strong><br />Shortest route: <strong>{puzzle.shortest} steps</strong></p>
      <p>Shortest route is for reference. Any valid route completes the puzzle.</p>
      <button class="button" type="button" onclick={handleShare} disabled={sharing}>{nativeSharing ? 'Share' : 'Copy'}</button>
      <p role="status">{shareMessage}</p>
      {#if shareFallback}<label for="ladder-share">Your shareable result</label><textarea id="ladder-share" readonly rows="6" value={shareText} onclick={(event) => event.currentTarget.select()}></textarea>{/if}
      <div class="copy-toast" role="status" aria-live="polite">{#if showCopyToast}<span>Result copied.</span>{/if}</div>
    </ResultDialog>
  {/if}
  <noscript><p class="notice">Word Ladder needs JavaScript to check words and save your ladder.</p></noscript>
</section>

<style>
  .ladder { width: 100%; max-width: 480px; min-width: 0; margin-inline: auto; }
  .game-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 16px; font-size: .82rem; }
  .destination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: var(--accent-soft); border-radius: 8px; color: var(--muted); }
  .destination strong { font-size: 1.5rem; letter-spacing: .16em; color: var(--ink); }
  .history { height: 176px; overflow-y: auto; padding: 4px; margin: 12px 0 16px; list-style: none; overscroll-behavior: contain; scrollbar-gutter: stable both-edges; }
  .history ol { display: flex; flex-direction: column; justify-content: flex-end; min-height: 100%; margin: 0; padding: 0; list-style: none; }
  .history li { display: grid; flex-shrink: 0; grid-template-columns: 28px auto 28px; justify-content: center; align-items: center; gap: 8px; padding: 8px 0; }
  .step-number { font-size: .75rem; color: var(--muted); text-align: right; }
  .word { display: flex; gap: 5px; }
  .word > span { position: relative; display: grid; place-items: center; width: 36px; height: 40px; border: 1px solid var(--line); border-radius: 4px; font-size: 1.25rem; font-weight: 700; }
  .latest .word > span { border-color: var(--accent); }
  .word > span.correct { border-color: var(--correct); background: var(--correct); color: white; }
  .word > .changed::after { content: ''; position: absolute; bottom: -6px; left: 6px; right: 6px; height: 2px; border-radius: 1px; background: var(--accent-line); }
  label { display: block; margin-bottom: 6px; font-size: .9rem; font-weight: 600; }
  .entry-instruction { margin: 0 0 10px; text-align: center; color: var(--muted); font-size: .9rem; line-height: 1.5; }
  .entry-instruction strong { color: var(--ink); }
  .draft { justify-content: center; }
  .draft > span { width: 44px; height: 48px; border: 2px solid var(--accent-line); font-size: 1.4rem; }
  .status { min-height: 20px; margin: 6px 0 8px; color: var(--muted); text-align: center; font-size: .85rem; line-height: 20px; }
  h2 { margin: 10px 0; font-size: 1.5rem; }
  .summary { line-height: 1.8; }
  .summary strong { color: var(--ink); }
  .result-art { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
  .result-art span { display: grid; place-items: center; width: 36px; height: 36px; background: var(--accent); color: white; border-radius: 5px; font-weight: 750; animation: climb 10s ease-out infinite; }
  .result-art span:nth-child(2) { animation-delay: .12s; }
  .result-art span:nth-child(3) { animation-delay: .24s; }
  .result-art span:nth-child(4) { animation-delay: .36s; }
  @keyframes climb { 0%, 12%, 100% { transform: none; } 5% { transform: translateY(-8px); } }
  textarea { width: 100%; padding: 12px; font-size: 1rem; color: var(--ink); background: var(--paper); border: 1px solid var(--accent-line); border-radius: 6px; }
  .copy-toast { position: fixed; left: 16px; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; justify-content: center; pointer-events: none; z-index: 10; }
  .copy-toast span { padding: 12px 18px; border-radius: 8px; background: var(--ink); color: var(--paper); }
  @media (prefers-reduced-motion: reduce) { .result-art span { animation: none; } }
</style>
