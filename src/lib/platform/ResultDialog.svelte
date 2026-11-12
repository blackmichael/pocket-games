<script lang="ts">
  import { onMount, type Snippet } from 'svelte';

  let { id, headingId, open = $bindable(false), onDismiss, children }: {
    id: string;
    headingId: string;
    open?: boolean;
    onDismiss?: () => void;
    children: Snippet;
  } = $props();
  let dialog: HTMLDialogElement;
  let ready = $state(false);

  onMount(() => {
    ready = true;
    window.addEventListener('keydown', blockBackgroundKeys, true);
    return () => {
      ready = false;
      if (dialog.open) dialog.close();
      window.removeEventListener('keydown', blockBackgroundKeys, true);
    };
  });

  $effect(() => {
    if (!ready) return;
    if (open && !dialog.open) {
      // Do not let showModal() remember a board control as its restore target.
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
      dialog.showModal();
      dialog.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });


  function handleClose() {
    if (!ready || dialog.open) return;
    open = false;
    onDismiss?.();
    const active = document.activeElement;
    if (active instanceof HTMLElement && dialog.contains(active)) active.blur();
  }

  function blockBackgroundKeys(event: KeyboardEvent) {
    if (dialog.open && !(event.target instanceof Node && dialog.contains(event.target))) {
      event.stopImmediatePropagation();
    }
  }
</script>


<dialog {id} class="result-panel" tabindex="-1" bind:this={dialog} aria-labelledby={headingId} onclose={handleClose} onkeydown={(event) => event.stopPropagation()}>
  <div class="result-controls">
    <button class="close" type="button" aria-label="Close result" onclick={() => { open = false; }}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
  </div>
  {#if open}{@render children()}{/if}
</dialog>
{#if !open}
  <div class="result-panel inline-result">
    {@render children()}
  </div>
{/if}
<style>
  dialog { position: fixed; inset: 0; box-sizing: border-box; width: min(460px, calc(100% - 24px)); max-width: calc(100% - 24px); height: fit-content; max-height: calc(100vh - 24px); max-height: calc(100dvh - 24px); margin: auto; overflow-y: auto; overscroll-behavior: contain; color: var(--ink); box-shadow: 0 12px 48px #342a4040; }
  dialog::backdrop { background: #342a4080; }
  .result-controls { display: flex; justify-content: flex-end; margin: -8px -2px 4px; }
  .close { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--accent); }
  .close:hover { background: var(--accent-light); }
</style>
