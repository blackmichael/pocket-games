<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { game, children }: { game: string; children: Snippet } = $props();
  const id = $props.id();
  let dialog: HTMLDialogElement;
  let ready = $state(false);

  onMount(() => {
    ready = true;
    window.addEventListener('keydown', blockBackgroundKeys, true);
    return () => {
      if (dialog.open) dialog.close();
      window.removeEventListener('keydown', blockBackgroundKeys, true);
    };
  });

  function releaseFocus() {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  }

  function openHelp() {
    dialog.showModal();
    releaseFocus();
  }

  function blockBackgroundKeys(event: KeyboardEvent) {
    if (dialog.open && !(event.target instanceof Node && dialog.contains(event.target))) {
      event.stopImmediatePropagation();
    }
  }
</script>

<button class="text-link help-trigger" type="button" disabled={!ready} onclick={openHelp} aria-haspopup="dialog" aria-controls={id}>
  How to play
</button>

<dialog {id} bind:this={dialog} aria-labelledby={`${id}-title`} onclose={releaseFocus} onkeydown={(event) => event.stopPropagation()}>
  <div class="dialog-heading">
    <h2 id={`${id}-title`}>How to play {game}</h2>
    <button class="text-link close" type="button" onclick={() => dialog.close()}>Close</button>
  </div>
  <div class="instructions">{@render children()}</div>
</dialog>

<style>
  .help-trigger { flex-shrink: 0; min-height: 44px; margin-block: -12px; font-size: .8rem; font-weight: 400; white-space: nowrap; }
  dialog { width: min(500px, calc(100% - 24px)); max-width: calc(100% - 24px); max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); margin: auto; padding: 24px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--accent-line); border-radius: 12px; background: var(--paper); color: var(--ink); box-shadow: 0 12px 48px #342a4040; text-align: left; }
  dialog::backdrop { background: #342a4080; }
  .dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 1.25rem; line-height: 1.3; }
  .close { flex-shrink: 0; min-height: 44px; padding: 0 8px; font-size: .85rem; }
  .instructions { color: var(--muted); font-size: .95rem; line-height: 1.65; }
  .instructions :global(p) { margin: 0 0 .8rem; }
  .instructions :global(ul) { margin: 0 0 .8rem; padding-left: 1.25rem; }
  .instructions :global(li + li) { margin-top: .3rem; }
  .instructions :global(strong) { color: var(--ink); }
  .instructions :global(:last-child) { margin-bottom: 0; }
  @media (max-width: 400px) { dialog { padding: 16px; } }
</style>
