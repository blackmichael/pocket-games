<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { chicagoDate, dailyIdentity, displayDate, resolvePuzzle } from '#lib/platform/daily.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import PuzzlePicker from '#lib/platform/PuzzlePicker.svelte';
  import { rememberPuzzle } from '#lib/platform/lastPuzzle.js';
  import { games } from '#lib/catalog.js';

  const game = games.find((game) => game.id === 'sunmoon')!;
  let Game = $state<Component<{ identity: PuzzleIdentity }> | null>(null);
  let identity = $state<PuzzleIdentity | null>(null);
  let error = $state<string | null>(null);
  let loadError = $state(false);
  let today = $state('');
  let newDay = $state(false);
  function syncPuzzle(url: URL) {
    const resolved = resolvePuzzle('sunmoon', url);
    identity = resolved.identity; error = resolved.error; newDay = false;
    if (resolved.identity) {
      rememberPuzzle(resolved.identity, location.origin);
    }
  }
  afterNavigate(({ to }) => { if (to) syncPuzzle(new URL(to.url.href)); });
  onMount(() => {
    let alive = true;
    today = chicagoDate(); syncPuzzle(new URL(location.href));
    import('#lib/games/catdog/Catdog.svelte').then((module) => { if (alive) Game = module.default; }).catch(() => { if (alive) loadError = true; });
    const refresh = () => { const current = chicagoDate(); if (current !== today) { today = current; newDay = true; } };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  });
</script>

<svelte:head><title>Catdog — Pocket Games</title><meta name="description" content="Play Catdog: balance Poppy and Pigeon in every row and column, avoid triples, and follow same or different clues." /></svelte:head>
<main id="main" tabindex="-1">
  <header class="heading"><div><h1>Catdog</h1><p>{game.description}</p></div><PuzzlePicker gameId="sunmoon" {identity} /></header>
  <section class="surface" aria-label="Catdog puzzle">
    <div class="meta">{#if identity?.mode === 'daily'}<span>Daily</span><span>{displayDate(identity.date!)}</span>{:else if identity}<span>Practice</span><span class="seed">Seed: {identity.seed || '(empty)'}</span>{:else}<span>Loading puzzle…</span>{/if}</div>
    {#if newDay}<p class="notice">A new daily is available. Your board stays here. <a href={puzzleUrl(dailyIdentity('sunmoon', today), location.origin)}>Play the new daily</a></p>{/if}
    {#if error}<p class="notice" role="alert">{error} <a href="/games/catdog/">Open today’s puzzle</a></p>{:else if loadError}<p class="notice" role="alert">The game could not be downloaded. <button class="text-link" onclick={() => location.reload()}>Reload</button>.</p>{:else if identity && Game}{#key puzzleKey(identity)}<Game {identity} />{/key}{:else}<p role="status">Loading…</p>{/if}
    <noscript><p class="notice">Fill every row and column with Poppy three times and Pigeon three times. No three matching pets in a line. An equals clue means matching neighbors; a cross means different neighbors. Enable JavaScript to play.</p></noscript>
  </section>
</main>
<style>
  main { width: min(600px, calc(100% - 40px)); margin: 28px auto 32px; padding: 24px 28px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 3px 14px #342a4010; }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 24px; } h1 { font-size: 1.85rem; margin: 0 0 8px; }.heading p { color: var(--muted); margin: 0; font-size: .85rem; }
  .heading > div { flex: 1; min-width: 0; }
  .surface { padding: 16px; }.meta { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: .8rem; margin-bottom: 16px; }.seed { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text-link { min-height: 44px; }
  @media(max-width:500px) { main { width: calc(100% - 24px); margin-top: 18px; padding: 16px 6px 8px; box-shadow: none; }.heading { margin-bottom: 12px; flex-wrap: wrap; gap: 4px 12px; }h1 { font-size: clamp(1.35rem, 6vw, 1.65rem); }.surface { padding: 8px 4px; }.meta { margin-bottom: 12px; } }
</style>
