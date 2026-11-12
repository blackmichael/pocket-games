<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { localDate, dailyIdentity, displayDate, resolvePuzzle } from '#lib/platform/daily.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import PuzzlePicker from '#lib/platform/PuzzlePicker.svelte';
  import { rememberPuzzle } from '#lib/platform/lastPuzzle.js';
  import { games } from '#lib/catalog.js';

  const game = games.find((game) => game.id === 'kings')!;
  let Game = $state<Component<{ identity: PuzzleIdentity }> | null>(null);
  let identity = $state<PuzzleIdentity | null>(null);
  let error = $state<string | null>(null);
  let loadError = $state(false);
  let today = $state('');
  let newDay = $state(false);
  function syncPuzzle(url: URL) {
    const resolved = resolvePuzzle('kings', url);
    identity = resolved.identity; error = resolved.error; newDay = false;
    if (resolved.identity) {
      rememberPuzzle(resolved.identity, location.origin);
    }
  }
  afterNavigate(({ to }) => { if (to) syncPuzzle(new URL(to.url.href)); });
  onMount(() => {
    let alive = true;
    today = localDate(); syncPuzzle(new URL(location.href));
    import('#lib/games/kings/Kings.svelte').then((module) => { if (alive) Game = module.default; }).catch(() => { if (alive) loadError = true; });
    const refresh = () => { const current = localDate(); if (current !== today) { today = current; newDay = true; } };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  });
</script>

<svelte:head><title>Kings — Pocket Games</title><meta name="description" content="Place ten kings on a ten-by-ten board in a daily logic puzzle. One king per row, column, and colored region; no touching." /></svelte:head>
<main id="main" tabindex="-1">
  <header class="heading"><div><h1>Kings</h1><p>{game.description}</p></div><PuzzlePicker gameId="kings" {identity} /></header>
  <section class="surface" aria-label="Kings puzzle">
    <div class="meta">{#if identity?.mode === 'daily'}<span>Daily</span><span>{displayDate(identity.date!)}</span>{:else if identity}<span>Practice</span><span class="seed">Seed: {identity.seed || '(empty)'}</span>{:else}<span>Loading puzzle…</span>{/if}</div>
    {#if newDay}<p class="notice">A new daily is available. Your board stays here. <a href={puzzleUrl(dailyIdentity('kings', today), location.origin)}>Play the new daily</a></p>{/if}
    {#if error}<p class="notice" role="alert">{error} <a href="/games/kings/">Open today’s puzzle</a></p>{:else if loadError}<p class="notice" role="alert">The game could not be downloaded. <button class="text-link" onclick={() => location.reload()}>Reload</button>.</p>{:else if identity && Game}{#key puzzleKey(identity)}<Game {identity} />{/key}{:else}<p role="status">Loading…</p>{/if}
    <noscript><p class="notice">Place ten kings on the ten-by-ten board: one in each row, column, and colored region. Kings cannot touch, even diagonally. Enable JavaScript to play.</p></noscript>
  </section>
</main>
<style>
  main { width: min(600px, calc(100% - 40px)); margin: 28px auto 32px; padding: 24px 28px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 3px 14px #342a4010; }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 24px; } h1 { font-size: 1.85rem; margin: 0 0 8px; }.heading p { color: var(--muted); margin: 0; font-size: .85rem; }
  .surface { padding: 16px; }.meta { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: .8rem; margin-bottom: 16px; }.seed { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text-link { min-height: 44px; }
  @media(max-width:500px) { main { width: calc(100% - 24px); margin-top: 18px; padding: 16px 10px 8px; box-shadow: none; }.heading { margin-bottom: 16px; flex-wrap: wrap; gap: 4px 12px; }.surface { padding: 12px 8px; } }
</style>
