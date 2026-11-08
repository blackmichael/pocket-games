<script lang="ts">
  import { games } from '#lib/catalog.js';
  import { onMount } from 'svelte';
  import { chicagoDate, displayDate, resolvePuzzle } from '#lib/platform/daily.js';
  const gameCardColors = ['#AD8BEB', '#F5C542', '#59CDA4', '#F58676', '#6ACAE8', '#EE91C2'] as const;
  let today = $state('');
  let lastPlayed = $state<string | null>(null);
  onMount(() => {
    const updateDate = () => { today = chicagoDate(); };
    updateDate();
    const interval = window.setInterval(updateDate, 30_000);
    window.addEventListener('focus', updateDate);
    try {
      const raw = localStorage.getItem('puzzle-room:last-played');
      if (raw) {
        const url = new URL(raw, location.origin);
        const game = games.find((game) => game.href === url.pathname);
        if (url.origin === location.origin && game && resolvePuzzle(game.id, url).identity)
          lastPlayed = url.pathname + url.search;
      }
    } catch { /* Guest play remains available without storage. */ }
    return () => { clearInterval(interval); window.removeEventListener('focus', updateDate); };
  });
</script>

<svelte:head>
  <title>Pocket Games</title>
  <meta name="description" content="Play Fivefold, a daily word puzzle, and Kings, a daily crown-placement puzzle." />
</svelte:head>

<main id="main" tabindex="-1">
  <h1 class="sr-only">Pocket Games</h1>
  {#if today}<p class="catalog-date"><time datetime={today}>{displayDate(today)}</time></p>{/if}

  <ul class="game-list">
    {#each games as game, index}
      <li style:--card-background={gameCardColors[index % gameCardColors.length]}>
        <div>
          <h2><a href={game.href}>{game.title}</a></h2>
          <p>{game.description}</p>
        </div>
        <div class="game-info">
          <span>{game.category}</span>
          <span>{game.duration}</span>
        </div>
      </li>
    {/each}
  </ul>

  {#if lastPlayed}
    <p class="resume"><a href={lastPlayed}>Continue last puzzle</a></p>
  {/if}
</main>

<style>
  main { width: min(780px, calc(100% - 40px)); margin: 32px auto 0; }
  .catalog-date { margin: 0; text-align: center; color: var(--muted); font-size: .85rem; }
  .game-list { display: grid; gap: 14px; margin: 22px 0 0; padding: 0; list-style: none; }
  li { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px; border: 1px solid transparent; border-radius: 10px; background: var(--card-background); color: var(--ink); }
  li:hover { border-color: #342a4044; }
  h2 { margin: 0 0 8px; font-size: 1.3rem; font-weight: 700; }
  h2 a { display: inline-flex; align-items: center; min-height: 44px; color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 5px; }
  h2 a:hover { text-decoration-thickness: 2px; }
  h2 a:focus-visible { outline-color: var(--ink); }
  li p { margin: 0; line-height: 1.6; }
  .game-info { display: grid; justify-items: end; gap: 10px; flex-shrink: 0; font-size: .8rem; }
  .game-info span:first-child { padding: 4px 8px; background: #ffffff40; border-radius: 4px; }
  .resume { margin: 22px 0 0; font-size: .9rem; }
  .resume a { display: inline-flex; align-items: center; min-height: 44px; }
  @media (max-width: 500px) {
    main { margin-top: 24px; }
    li { align-items: start; flex-direction: column; gap: 16px; padding: 20px; }
    .game-info { display: flex; align-items: center; gap: 14px; }
  }
</style>
