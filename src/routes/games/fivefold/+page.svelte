<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { page } from '$app/state';
  import { chicagoDate, dailyIdentity, displayDate, resolvePuzzle } from '#lib/platform/daily.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import PuzzlePicker from '#lib/platform/PuzzlePicker.svelte';
  import { rememberPuzzle } from '#lib/platform/lastPuzzle.js';
  import { games } from '#lib/catalog.js';

  const game = games.find((game) => game.id === 'fivefold')!;

  let Game = $state<Component<{ identity: PuzzleIdentity }> | null>(null);
  let identity = $state<PuzzleIdentity | null>(null);
  let ready = $state(false);
  let error = $state<string | null>(null);
  let loadError = $state(false);
  let today = $state('');
  let newDay = $state(false);

  $effect(() => {
    const url = page.url;
    if (!ready) return;
    const resolved = resolvePuzzle('fivefold', new URL(url.href));
    identity = resolved.identity;
    error = resolved.error;
    newDay = false;
    if (resolved.identity) {
      rememberPuzzle(resolved.identity, location.origin);
    }
  });

  onMount(() => {
    let alive = true;
    today = chicagoDate();
    ready = true;
    import('#lib/games/fivefold/Fivefold.svelte')
      .then((module) => { if (alive) Game = module.default; })
      .catch(() => { if (alive) loadError = true; });
    const refreshDate = () => {
      const current = chicagoDate();
      if (current !== today) { today = current; newDay = true; }
    };
    const interval = window.setInterval(refreshDate, 30_000);
    window.addEventListener('focus', refreshDate);
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshDate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false; clearInterval(interval); window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });

</script>

<svelte:head>
  <title>Fivefold — Pocket Games</title>
  <meta name="description" content="Guess the five-letter word in six tries. Daily and seeded puzzles." />
</svelte:head>

<main id="main" tabindex="-1">
  <header class="game-heading">
    <div>
      <h1>Fivefold</h1>
      <p>{game.description}</p>
    </div>
    <PuzzlePicker gameId="fivefold" {identity} />
  </header>

  <section class="play-surface" aria-label="Fivefold game">
    <div class="puzzle-meta">
      {#if identity?.mode === 'daily'}
        <span>Daily</span><span>{displayDate(identity.date!)}</span>
      {:else if identity}
        <span>Practice</span><span class="seed-value" title={identity.seed}>Seed: {identity.seed || '(empty)'}</span>
      {:else}
        <span>Loading puzzle…</span>
      {/if}
    </div>
    {#if newDay}
      <div class="notice rollover" role="status">
        A new daily is available. Your current board stays here.
        <a href={puzzleUrl(dailyIdentity('fivefold', today), location.origin)}>Play the new daily</a>
      </div>
    {/if}
    {#if error}
      <div class="notice" role="alert">{error} <a href="/games/fivefold/">Open today’s puzzle</a></div>
    {:else if loadError}
      <div class="notice" role="alert">
        The game could not be downloaded. Check your connection, then
        <button class="text-link" onclick={() => location.reload()}>reload the page</button>.
      </div>
    {:else if identity && Game}
      {#key puzzleKey(identity)}<Game {identity} />{/key}
    {:else}
      <p class="loading" role="status">Loading…</p>
    {/if}
    <noscript><p class="notice">Find the five-letter word in six guesses. Clues show letters in the right spot, the wrong spot, or with no match. Enable JavaScript to generate and play the puzzle.</p></noscript>
  </section>

</main>

<style>
  main { width: min(600px, calc(100% - 40px)); margin: 28px auto 32px; padding: 24px 28px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 3px 14px #342a4010; }
  .game-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
  h1 { font-size: 1.85rem; font-weight: 750; letter-spacing: -.5px; margin: 0 0 8px; }
  .game-heading p { color: var(--muted); margin: 0; font-size: .85rem; }
  .puzzle-meta { display: flex; justify-content: space-between; gap: 16px; font-size: .8rem; color: var(--muted); margin-bottom: 20px; }
  .seed-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .loading { text-align: center; color: var(--muted); padding: 80px 0; }
  .rollover { margin-bottom: 16px; font-size: .85rem; }
  @media (max-width: 500px) {
    main { width: calc(100% - 24px); margin-top: 22px; padding: 18px 10px 8px; border-radius: 10px; box-shadow: none; }
    .game-heading { margin-bottom: 20px; }
    .puzzle-meta { font-size: .72rem; }
  }
  @media (max-width: 500px) and (max-height: 740px) {
    main { margin-top: 14px; padding-top: 12px; }
    .game-heading { margin-bottom: 12px; }
    h1 { font-size: 1.6rem; margin-bottom: 4px; }
    .puzzle-meta { margin-bottom: 12px; }
  }
</style>
