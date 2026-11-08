<script lang="ts">
  import { onMount } from 'svelte';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import { loadSave, saveSave } from '#lib/platform/storage.js';
  import {
    generate,
    isAllowedGuess,
    MAX_GUESSES,
    parseSavedGame,
    scoreGuess,
    WORD_LENGTH,
    type LetterState,
    type SavedGame
  } from './engine';

  let { identity }: { identity: PuzzleIdentity } = $props();

  const keyboardRows = ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), ['Enter', ...'ZXCVBNM', 'Backspace']];
  const ranks: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
  const marks: Record<LetterState, string> = { absent: '×', present: '●', correct: '✓' };
  const descriptions: Record<LetterState, string> = {
    absent: 'no matching copy',
    present: 'in the word, different position',
    correct: 'correct position'
  };
  const shareMarks: Record<LetterState, string> = { absent: '⬜', present: '🟨', correct: '🟩' };

  let ready = $state(false);
  let guesses = $state<string[]>([]);
  let draft = $state('');
  let message = $state('');
  let inputError = $state(false);
  let storageWarning = $state<string | null>(null);
  let shareText = $state('');
  let shareMessage = $state('');
  let shareFallback = $state(false);
  let sharing = $state(false);

  const answer = $derived(generate(identity.seed).answer);
  const storageKey = $derived(puzzleKey(identity));
  const scores = $derived(guesses.map((guess) => scoreGuess(guess, answer)));
  const won = $derived(guesses.includes(answer));
  const finished = $derived(won || guesses.length === MAX_GUESSES);
  const status = $derived(
    !ready
      ? 'Loading…'
      : won
        ? `Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}.`
        : finished
          ? `All six guesses used. The word was ${answer}.`
          : message || 'Type a five-letter word, then press Enter.'
  );
  const keyboardStates = $derived.by(() => {
    const states: Record<string, LetterState> = {};
    for (let row = 0; row < guesses.length; row += 1) {
      for (let column = 0; column < WORD_LENGTH; column += 1) {
        const letter = guesses[row][column];
        const state = scores[row][column];
        if (states[letter] === undefined || ranks[state] > ranks[states[letter]]) states[letter] = state;
      }
    }
    return states;
  });
  const boardRows = $derived.by(() =>
    Array.from({ length: MAX_GUESSES }, (_, index) => {
      const submitted = index < guesses.length;
      const active = !finished && index === guesses.length;
      const word = submitted ? guesses[index] : active ? draft : '';
      const states = submitted ? scores[index] : null;
      let description = `Guess ${index + 1}, empty.`;
      if (submitted && states) {
        description = `Guess ${index + 1}, ${word}. ${states.map((state, column) => `${word[column]}: ${descriptions[state]}`).join('; ')}.`;
      } else if (active) {
        description = `Guess ${index + 1}, current guess: ${word ? word.split('').join(' ') : 'empty'}. ${WORD_LENGTH - word.length} empty ${WORD_LENGTH - word.length === 1 ? 'space' : 'spaces'}.`;
      }
      return { index, word, states, active, description };
    })
  );

  function persist() {
    if (!ready) return;
    const value: SavedGame = { version: 1, guesses: [...guesses], draft };
    const warning = saveSave(storageKey, value);
    if (warning) storageWarning = warning;
  }

  function enterKey(key: string) {
    if (!ready || finished) return;
    if (key === 'Enter') {
      if (draft.length !== WORD_LENGTH) {
        message = `Add ${WORD_LENGTH - draft.length} more ${WORD_LENGTH - draft.length === 1 ? 'letter' : 'letters'} before submitting.`;
        inputError = true;
        return;
      }
      if (!isAllowedGuess(draft)) {
        message = `${draft} isn’t in our word list. Try another five-letter word.`;
        inputError = true;
        return;
      }
      guesses = [...guesses, draft];
      draft = '';
      message = 'Guess recorded. Use the clues to find your next word.';
      inputError = false;
      persist();
      return;
    }
    if (key === 'Backspace') {
      if (!draft.length) return;
      draft = draft.slice(0, -1);
    } else if (/^[a-zA-Z]$/.test(key)) {
      if (draft.length === WORD_LENGTH) return;
      draft += key.toUpperCase();
    } else {
      return;
    }
    message = '';
    inputError = false;
    persist();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!ready || finished || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || (target instanceof HTMLElement && target.isContentEditable)) return;
      // Leave native activation of buttons, links, and the how-to disclosure intact.
      if (event.key === 'Enter' && target.closest('button, a, summary, [role="button"]')) return;
    }
    if (event.key === 'Enter' || event.key === 'Backspace' || /^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      enterKey(event.key);
    }
  }

  onMount(() => {
    const restored = loadSave<SavedGame>(storageKey, (value) => parseSavedGame(value, answer));
    storageWarning = restored.warning;
    if (restored.value) {
      guesses = restored.value.guesses;
      draft = restored.value.draft;
    }
    ready = true;
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  async function copyResult() {
    if (!ready || !finished || sharing) return;
    shareText = [
      `Fivefold ${won ? guesses.length : 'X'}/${MAX_GUESSES}`,
      identity.mode === 'daily' ? `Daily puzzle · ${identity.date}` : 'Seeded puzzle',
      '',
      ...scores.map((row) => row.map((state) => shareMarks[state]).join('')),
      '',
      puzzleUrl(identity, window.location.origin)
    ].join('\n');
    sharing = true;
    shareMessage = '';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(shareText);
      shareFallback = false;
      shareMessage = 'Result copied.';
    } catch {
      shareFallback = true;
      shareMessage = 'Clipboard access is unavailable. Select and copy your result below.';
    } finally {
      sharing = false;
    }
  }
</script>

<section class="fivefold" aria-label="Fivefold game">
  <div class="game-meta">
    <span>{finished ? 'Board complete' : `Guess ${Math.min(guesses.length + 1, MAX_GUESSES)} of ${MAX_GUESSES}`}</span>
    <span class="letter-count">{WORD_LENGTH} letters</span>
  </div>

  {#if storageWarning}
    <p class="notice storage-warning" role="status">{storageWarning}</p>
  {/if}

  <div class="board" role="group" aria-label="Guess board: six guesses, five letters each" aria-busy={!ready}>
    {#each boardRows as row (row.index)}
      <div class="board-row" class:current={row.active && ready} role="group" aria-label={row.description}>
        {#each Array.from({ length: WORD_LENGTH }) as _, column (column)}
          {@const state = row.states?.[column]}
          <div
            class="tile {state ?? ''}"
            class:filled={!!row.word[column]}
            class:evaluated={!!state}
            aria-hidden="true"
          >
            <span class="tile-letter">{row.word[column] ?? ''}</span>
            {#if state}<span class="tile-mark">{marks[state]}</span>{/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <div class="color-key" aria-label="Letter feedback key">
    <span><span class="legend-symbol correct-symbol" aria-hidden="true">✓</span> Right spot</span>
    <span><span class="legend-symbol present-symbol" aria-hidden="true">●</span> Wrong spot</span>
    <span><span class="legend-symbol absent-symbol" aria-hidden="true">×</span> No match</span>
  </div>

  <p id="fivefold-status" class="game-status" class:error={inputError && !finished} role="status" aria-live="polite" aria-atomic="true">{status}</p>

  {#if ready && finished}
    <section class="result" aria-labelledby="fivefold-result-heading">
      <h2 id="fivefold-result-heading">{won ? 'Solved' : 'Out of guesses'}</h2>
      {#if !won}<p>The word was <strong class="answer">{answer}</strong>.</p>{/if}
      <button class="button share-button" type="button" onclick={copyResult} disabled={sharing}>
        {sharing ? 'Copying…' : 'Copy result'}
      </button>
      <p class="share-hint">A spoiler-free grid and a link to this exact puzzle.</p>
      <p class="share-status" role="status" aria-live="polite">{shareMessage}</p>
      {#if shareFallback}
        <label class="share-label" for="fivefold-share">Your shareable result</label>
        <textarea
          id="fivefold-share"
          class="share-fallback"
          readonly
          rows={guesses.length + 6}
          value={shareText}
          onclick={(event) => event.currentTarget.select()}
        ></textarea>
      {/if}
    </section>
  {/if}

  <div class="keyboard" role="group" aria-label="On-screen keyboard" aria-describedby="fivefold-status">
    {#each keyboardRows as row, index (index)}
      <div class="keyboard-row" class:middle-row={index === 1}>
        {#each row as key (key)}
          {@const state = keyboardStates[key]}
          <button
            type="button"
            class="key {state ?? ''}"
            class:action-key={key === 'Enter' || key === 'Backspace'}
            disabled={!ready || finished}
            aria-label={key === 'Backspace' ? 'Delete last letter' : state ? `${key}, ${descriptions[state]}` : key}
            onpointerdown={(event) => event.preventDefault()}
            onclick={() => enterKey(key)}
          >
            {#if key === 'Backspace'}
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 5h12v14H9l-7-7 7-7Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>
            {:else}
              <span>{key}</span>
            {/if}
            {#if state}<span class="key-mark" aria-hidden="true">{marks[state]}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>

  <details class="how-to">
    <summary>How to play Fivefold</summary>
    <div class="instructions">
      <p>Find the hidden five-letter word in six guesses. Enter a word using your keyboard or the keys above, then press <strong>Enter</strong>. Each guess must be in our word list.</p>
      <ul>
        <li><strong>✓ Right spot:</strong> that letter is exactly where it belongs.</li>
        <li><strong>● Wrong spot:</strong> the word contains that letter, but elsewhere.</li>
        <li><strong>× No match:</strong> there is no remaining copy of that letter to match.</li>
      </ul>
      <p>Repeated letters count individually. If you guess two Es and the answer has only one, just one E gets a ✓ or ●. Correct positions are matched first, then remaining copies from left to right.</p>
      <p>The keyboard keeps each letter’s best clue. Your progress is saved in this browser when storage is available. Sharing reveals the pattern of your guesses, never the word.</p>
    </div>
  </details>
  <noscript><p class="notice">Fivefold needs JavaScript to check guesses and save your board. Enable JavaScript to play.</p></noscript>
</section>

<style>
  .fivefold {
    width: 100%;
    max-width: 540px;
    min-width: 0;
    margin-inline: auto;
    color: var(--ink);
  }

  .game-meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding-bottom: 1.2rem;
    font-size: 0.82rem;
    font-weight: normal;
  }

  .letter-count { color: var(--muted); }
  .storage-warning { margin: 0 0 1.1rem; font-size: 0.85rem; }
  .board { display: grid; gap: 6px; width: min(100%, 326px); margin-inline: auto; }
  .board-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }

  .tile {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    min-width: 0;
    border: 2px solid var(--line);
    border-radius: 5px;
    background: #fff;
    line-height: 1;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .tile-letter { font-size: clamp(1.45rem, 7vw, 1.95rem); font-weight: 800; }
  .current .tile { border-color: var(--accent-line); }
  .current .tile.filled { border-color: var(--accent); background: var(--page); }
  .tile-mark { position: absolute; right: 4px; bottom: 3px; font-size: 0.68rem; font-weight: 800; }
  .tile.correct, .key.correct { background: #22724f; border-color: #22724f; color: #fff; }
  .tile.present, .key.present { background: #f1d98a; border-color: #d8bb60; color: #49380e; }
  .tile.absent, .key.absent { background: #627087; border-color: #627087; color: #fff; }

  .color-key {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.55rem 1rem;
    margin-top: 1rem;
    color: var(--muted);
    font-size: 0.72rem;
  }

  .color-key > span { display: inline-flex; align-items: center; gap: 0.3rem; }
  .legend-symbol { display: inline-grid; place-items: center; width: 17px; height: 17px; border-radius: 3px; font-size: 0.7rem; font-weight: 800; }
  .correct-symbol { background: #22724f; color: #fff; }
  .present-symbol { background: #f1d98a; color: #49380e; }
  .absent-symbol { background: #627087; color: #fff; }

  .game-status {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 3.8rem;
    margin: 0;
    padding: 0.75rem 0.2rem;
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .game-status.error { color: #a42c35; font-weight: 650; }
  .keyboard { display: grid; gap: 6px; width: 100%; }
  .keyboard-row { display: flex; justify-content: center; gap: 4px; }
  .middle-row { padding-inline: 5%; }

  .key {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1 1 0;
    min-width: 0;
    height: 51px;
    padding: 0 1px;
    border: 1px solid var(--key-line);
    border-bottom-width: 3px;
    border-radius: 5px;
    background: var(--key-fill);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 750;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  .key.action-key { flex-grow: 1.55; font-size: 0.68rem; }
  .key-mark { position: absolute; right: 3px; bottom: 2px; font-size: 0.58rem; line-height: 1; }
  .key:disabled { cursor: default; }
  .keyboard[aria-describedby] .key:disabled:not(.correct):not(.present):not(.absent) { color: #666; background: #f3f3f3; }
  .key:active:not(:disabled) { transform: translateY(1px); border-bottom-width: 1px; }
  .key:focus-visible, summary:focus-visible, .share-fallback:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }

  .result {
    margin: 0 0 1.25rem;
    padding: 1.1rem 0;
    border-top: 1px solid var(--line);
    text-align: center;
  }

  .result h2 { margin: 0 0 .8rem; font-size: 1.1rem; }
  .result > p { margin: 0.3rem 0 1rem; color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
  .answer { color: var(--ink); letter-spacing: 0.1em; }
  .share-button { min-height: 44px; }
  .result > .share-hint { margin: 0.7rem 0 0; font-size: 0.76rem; }
  .result > .share-status { margin: 0.6rem 0 0; font-size: 0.82rem; }
  .share-status:empty { display: none; }
  .share-label { display: block; margin-top: 1rem; text-align: left; font-size: 0.82rem; font-weight: 650; }

  .share-fallback {
    box-sizing: border-box;
    display: block;
    width: 100%;
    margin-top: 0.4rem;
    padding: 0.75rem;
    border: 1px solid var(--accent-line);
    border-radius: 6px;
    background: #fff;
    color: var(--ink);
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.6;
    overflow-wrap: anywhere;
    resize: vertical;
  }

  .how-to { margin-top: 1.6rem; border-top: 1px solid var(--line); }
  .how-to summary { width: fit-content; padding: 1rem 0; font-size: 0.85rem; cursor: pointer; }
  .instructions { padding-bottom: 0.2rem; color: var(--muted); font-size: 0.86rem; line-height: 1.7; }
  .instructions p { margin: 0 0 0.8rem; }
  .instructions ul { margin: 0 0 0.8rem; padding-left: 1.25rem; }
  .instructions li + li { margin-top: 0.2rem; }
  .instructions strong { color: var(--ink); }

  @media (hover: hover) {
    .key:hover:not(:disabled) { filter: brightness(0.95); }
    .how-to summary:hover { color: var(--accent); }
  }

  @media (max-width: 500px) {
    .board { width: min(100%, 240px); }
    .game-meta { padding-bottom: .7rem; }
    .color-key { margin-top: .65rem; }
    .game-status { min-height: 2.8rem; padding-block: .45rem; }
    .key { height: 46px; }
  }
  @media (max-width: 500px) and (max-height: 740px) {
    .board { width: min(100%, 200px); }
    .game-meta { padding-bottom: .4rem; }
    .game-status { min-height: 2.2rem; }
  }

  @media (max-width: 380px) {
    .game-meta { font-size: 0.76rem; }
    .color-key { gap: 0.45rem 0.65rem; font-size: 0.68rem; }
    .key { font-size: 0.82rem; }
    .key.action-key { font-size: 0.61rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile { transition: none; }
    .key:active:not(:disabled) { transform: none; }
  }
</style>
