<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { chicagoDate, dailyIdentity, isCalendarDate, seedIdentity } from './daily.js';
  import { puzzleUrl, type PuzzleIdentity } from './types.js';

  let { gameId, identity }: { gameId: string; identity: PuzzleIdentity | null } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let ready = $state(false);
  let customSeed = $state('');
  let selectedDate = $state('');
  let editingDate = false;
  let pending = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    ready = true;
    window.addEventListener('keydown', blockBackgroundKeys, true);
    return () => {
      ready = false;
      if (dialog.open) dialog.close();
      window.removeEventListener('keydown', blockBackgroundKeys, true);
    };
  });

  function openPicker() {
    if (!ready || dialog.open) return;
    const today = chicagoDate();
    customSeed = identity?.mode === 'seed' ? identity.seed : '';
    selectedDate = identity?.date ?? today;
    editingDate = false;
    error = null;
    dialog.showModal();
    releaseFocus();
  }

  function releaseFocus() {
    // Clear native dialog autofocus/restoration without focusing another control.
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function blockBackgroundKeys(event: KeyboardEvent) {
    if (dialog.open && !(event.target instanceof Node && dialog.contains(event.target))) {
      event.stopImmediatePropagation();
    }
  }

  async function selectPuzzle(next: PuzzleIdentity) {
    if (pending) return;
    pending = true;
    error = null;
    if (dialog.open) dialog.close();
    try {
      await goto(puzzleUrl(next, location.origin));
    } catch {
      if (ready) {
        error = 'The puzzle could not be opened. Your selection is still here. Try again.';
        if (!dialog.open) {
          dialog.showModal();
          releaseFocus();
        }
      }
    } finally {
      if (ready) pending = false;
    }
  }

  function openSeed(event: SubmitEvent) {
    event.preventDefault();
    void selectPuzzle(seedIdentity(gameId, customSeed));
  }

  function openDate(date: string) {
    selectedDate = date;
    if (!isCalendarDate(selectedDate)) {
      error = 'Choose a valid calendar date.';
      return;
    }
    void selectPuzzle(dailyIdentity(gameId, selectedDate));
  }

  function finishDate(event: FocusEvent & { currentTarget: EventTarget & HTMLInputElement }) {
    const commit = editingDate && event.relatedTarget === null && dialog.open;
    editingDate = false;
    if (commit) openDate(event.currentTarget.value);
  }

  function randomPuzzle() {
    if (pending) return;
    try {
      const values = crypto.getRandomValues(new Uint32Array(2));
      const seed = [...values].map((value) => value.toString(16).padStart(8, '0')).join('');
      customSeed = seed;
      void selectPuzzle(seedIdentity(gameId, seed));
    } catch {
      error = 'A random seed could not be created. Try another option.';
    }
  }
</script>

<button class="text-link trigger" type="button" disabled={!ready} onclick={openPicker} aria-haspopup="dialog">
  New seed
</button>

<dialog bind:this={dialog} aria-labelledby={`${id}-title`} onclose={() => { editingDate = false; releaseFocus(); }} oncancel={() => { editingDate = false; }} onpointerdown={(event) => { if (!(event.target instanceof HTMLInputElement && event.target.type === 'date')) editingDate = false; }} onkeydown={(event) => event.stopPropagation()}>
  <div class="dialog-heading">
    <h2 id={`${id}-title`}>New seed</h2>
    <button class="text-link close" type="button" onclick={() => dialog.close()}>Close</button>
  </div>

  <form onsubmit={openSeed}>
    <label for={`${id}-seed`}>Custom seed</label>
    <div class="field-row">
      <input id={`${id}-seed`} type="text" bind:value={customSeed} autocomplete="off" spellcheck="false" aria-describedby={`${id}-seed-help`} />
      <button class="button" type="submit" disabled={pending} aria-label="Open custom seed">Open</button>
    </div>
    <p class="field-help" id={`${id}-seed-help`}>The same seed and generator version give the same puzzle. An empty seed works too.</p>
  </form>

  <div class="date-picker">
    <label for={`${id}-date`}>Daily date</label>
    <input id={`${id}-date`} type="date" bind:value={selectedDate} onfocus={() => { editingDate = true; }} onblur={finishDate} onkeydown={(event) => { if (event.key === 'Escape') editingDate = false; if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); editingDate = false; openDate(event.currentTarget.value); } }} disabled={pending} min="0001-01-01" max="9999-12-31" required aria-describedby={`${id}-date-help`} />
    <p class="field-help" id={`${id}-date-help`}>Finish choosing a date in the calendar, or press Enter, to open its puzzle. Daily puzzles change at midnight in Chicago.</p>
  </div>

  <div class="quick-actions">
    <button class="button secondary" type="button" disabled={pending} onclick={() => void selectPuzzle(dailyIdentity(gameId, chicagoDate()))}>Today’s puzzle</button>
    <button class="button secondary" type="button" disabled={pending} onclick={randomPuzzle}>Random puzzle</button>
  </div>
  {#if pending}<p class="field-help" role="status">Opening puzzle…</p>{/if}
  {#if error}<p class="notice" role="alert">{error}</p>{/if}
  <p class="field-help save-note">Progress is saved in this browser; clearing browser data removes it.</p>
</dialog>

<style>
  .trigger { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; font-size: .8rem; white-space: nowrap; }
  dialog { width: min(460px, calc(100% - 24px)); max-width: calc(100% - 24px); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); margin: auto; padding: 24px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--accent-line); border-radius: 12px; background: var(--paper); color: var(--ink); box-shadow: 0 12px 48px #342a4040; }
  dialog::backdrop { background: #342a4080; }
  .dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
  h2 { margin: 0; font-size: 1.4rem; letter-spacing: -.3px; }
  .close { min-height: 44px; padding: 0 8px; font-size: .85rem; }
  .date-picker { margin-top: 20px; }
  label { display: block; margin-bottom: 8px; font-size: .85rem; font-weight: 600; }
  .field-row { display: flex; align-items: stretch; gap: 8px; }
  input { flex: 1; min-width: 0; width: 100%; min-height: 44px; padding: 8px 10px; border: 1px solid var(--accent-line); border-radius: 6px; background: var(--paper); color: var(--ink); font-size: 1rem; }
  input[type="date"] { -webkit-appearance: none; appearance: none; box-sizing: border-box; display: block; width: 100%; max-width: 100%; min-inline-size: 0; }
  .field-help { margin: 10px 0 0; color: var(--muted); font-size: .8rem; line-height: 1.6; }
  .quick-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--line); }
  .secondary { flex: 1 1 150px; background: var(--accent-soft); color: var(--accent); }
  .secondary:hover:not(:disabled) { background: var(--accent-light); color: var(--ink); }
  .notice { margin: 16px 0 0; font-size: .85rem; }
  .save-note { margin-top: 20px; }
  @media (max-width: 400px) {
    dialog { padding: 16px; }
    .dialog-heading { margin-bottom: 16px; }
  }
</style>
