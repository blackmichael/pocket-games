<script lang="ts">
  import { page } from '$app/state';

  const notFound = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{notFound ? 'Page not found' : 'Page could not load'} · Pocket Games</title>
</svelte:head>

<main id="main" tabindex="-1" aria-labelledby="error-heading">
  <section class="error-panel">
    <h1 id="error-heading">{notFound ? 'Page not found' : 'This page couldn’t load'}</h1>
    <p class="explanation">
      {#if notFound}
        This address doesn’t match a page in Pocket Games. Check the address, try reloading, or return to the game catalog.
      {:else}
        Reload this page to try again. If it still won’t open, return to the catalog and choose another game.
      {/if}
    </p>
    <p class="saved-progress">These actions won’t clear saved progress on this device.</p>
    <div class="recovery-actions">
      <button class="button" type="button" onclick={() => window.location.reload()}>Reload this page</button>
      <a class="catalog-link" href="/" data-sveltekit-reload>Return to game catalog</a>
    </div>
    <p class="error-status">Error code: {page.status}</p>
  </section>
</main>

<style>
  main { width: min(780px, calc(100% - 40px)); margin: 32px auto 0; }
  .error-panel { padding: 24px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); }
  h1 { margin: 0; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.25; }
  .explanation { max-width: 58ch; margin: 16px 0 0; line-height: 1.6; }
  .saved-progress { margin: 12px 0 0; color: var(--muted); font-size: .9rem; line-height: 1.6; }
  .recovery-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 20px; margin-top: 24px; }
  .catalog-link { display: inline-flex; align-items: center; min-height: 44px; line-height: 1.4; }
  .error-status { margin: 24px 0 0; color: var(--muted); font-size: .8rem; }
  @media (max-width: 500px) {
    main { margin-top: 24px; }
    .error-panel { padding: 20px; }
    .recovery-actions { align-items: stretch; flex-direction: column; }
    .catalog-link { justify-content: center; text-align: center; }
  }
</style>
