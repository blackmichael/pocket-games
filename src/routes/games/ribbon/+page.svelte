<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { localDate, dailyIdentity, displayDate, resolvePuzzle } from '#lib/platform/daily.js';
  import { puzzleKey, puzzleUrl, type PuzzleIdentity } from '#lib/platform/types.js';
  import PuzzlePicker from '#lib/platform/PuzzlePicker.svelte';
  import { rememberPuzzle } from '#lib/platform/lastPuzzle.js';
  import { games } from '#lib/catalog.js';

  const game = games.find((game) => game.id === 'thread')!;
  let Game = $state<Component<{ identity: PuzzleIdentity }> | null>(null);
  let identity = $state<PuzzleIdentity | null>(null);
  let error = $state<string | null>(null);
  let loadError = $state(false);
  let today = $state('');
  let newDay = $state(false);
  function syncPuzzle(url: URL) {
    const resolved = resolvePuzzle('thread', url);
    identity = resolved.identity; error = resolved.error; newDay = false;
    if (resolved.identity) {
      rememberPuzzle(resolved.identity, location.origin);
    }
  }
  afterNavigate(({ to }) => { if (to) syncPuzzle(new URL(to.url.href)); });
  onMount(() => {
    let alive = true;
    today = localDate(); syncPuzzle(new URL(location.href));
    import('#lib/games/ribbon/Ribbon.svelte').then((module) => { if (alive) Game = module.default; }).catch(() => { if (alive) loadError = true; });
    const refresh = () => { const current = localDate(); if (current !== today) { today = current; newDay = true; } };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisibility); };
  });
</script>

<svelte:head><title>Ribbon — Pocket Games</title><meta name="description" content="Connect numbered checkpoints in order, avoid barriers, and cover every square with one continuous path in this daily logic puzzle." /></svelte:head>
<main id="main" tabindex="-1">
  <header class="heading">
    <h1>Ribbon</h1>
    <div class="picker"><PuzzlePicker gameId="thread" {identity} /></div>
    <p>{game.description}</p>
  </header>
  <section class="surface" aria-label="Ribbon puzzle">
    <div class="meta">{#if identity?.mode === 'daily'}<span>Daily</span><span>{displayDate(identity.date!)}</span>{:else if identity}<span>Practice</span><span class="seed">Seed: {identity.seed || '(empty)'}</span>{:else}<span>Loading puzzle…</span>{/if}</div>
    {#if newDay}<p class="notice">A new daily is available. Your board stays here. <a href={puzzleUrl(dailyIdentity('thread', today), location.origin)}>Play the new daily</a></p>{/if}
    {#if error}<p class="notice" role="alert">{error} <a href="/games/ribbon/">Open today’s puzzle</a></p>{:else if loadError}<p class="notice" role="alert">The game could not be downloaded. <button class="text-link" onclick={() => location.reload()}>Reload</button>.</p>{:else if identity && Game}{#key puzzleKey(identity)}<Game {identity} />{/key}{:else}<p role="status">Loading…</p>{/if}
    <noscript><p class="notice">Start at 1, connect checkpoints in order, and fill every square with one continuous path. Move up, down, left, or right without revisiting a square or crossing a thick wall. Enable JavaScript to play.</p></noscript>
  </section>
</main>
<style>
  main { width: min(600px, calc(100% - 24px)); margin: 8px auto 32px; padding: 24px 28px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 3px 14px #342a4010; }
  .heading { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; width: 100%; max-width: 420px; margin: 0 auto 12px; }
  h1 { margin: 0; font-size: 1.85rem; line-height: 1.15; }
  .picker { grid-column: 2; grid-row: 1; justify-self: end; display: flex; align-items: center; }
  .heading p { grid-column: 1 / -1; margin: 0; color: var(--muted); font-size: .85rem; line-height: 1.45; }
  .surface { width: 100%; max-width: 420px; margin-inline: auto; }.meta { display: flex; justify-content: space-between; gap: 12px; color: var(--muted); font-size: .8rem; margin-bottom: 8px; }.seed { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .text-link { min-height: 44px; }
  @media(max-width:500px) { main { width: calc(100% - 24px); margin-top: 8px; padding: 16px 8px 8px; box-shadow: none; }.heading { margin-bottom: 8px; } }
</style>
