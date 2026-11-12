<script lang="ts">
  import { games } from '#lib/catalog.js';
  import { onMount } from 'svelte';
  import { localDate, displayDate } from '#lib/platform/daily.js';
  import { lastPuzzleHref } from '#lib/platform/lastPuzzle.js';
  const gameCardColors = ['#AD8BEB', '#F5C542', '#59CDA4', '#F58676', '#6ACAE8', '#EE91C2'] as const;
  let today = $state('');
  let puzzleLinks = $state<Record<string, string>>({});
  function refreshLink(event: MouseEvent, game: (typeof games)[number]) {
    (event.currentTarget as HTMLAnchorElement).href = lastPuzzleHref(game.id, location.origin) ?? game.href;
  }
  onMount(() => {
    const updateDate = () => {
      const now = new Date();
      today = localDate(now);
      puzzleLinks = Object.fromEntries(games.map((game) => [game.id, lastPuzzleHref(game.id, location.origin, now) ?? game.href]));
    };
    updateDate();
    const interval = window.setInterval(updateDate, 30_000);
    window.addEventListener('focus', updateDate);
    const onVisibility = () => { if (document.visibilityState === 'visible') updateDate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', updateDate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<svelte:head>
  <title>Pocket Games</title>
  <meta name="description" content="Play daily word and logic puzzles: Fivefold, Kings, and Catdog." />
</svelte:head>

<main id="main" tabindex="-1">
  <h1 class="sr-only">Pocket Games</h1>
  {#if today}<p class="catalog-date"><time datetime={today}>{displayDate(today)}</time></p>{/if}

  <ul class="game-list">
    {#each games as game, index}
      <li style:--card-background={gameCardColors[index % gameCardColors.length]}>
        <a class="game-card" href={puzzleLinks[game.id] ?? game.href} onclickcapture={(event) => refreshLink(event, game)} onauxclickcapture={(event) => refreshLink(event, game)} aria-labelledby="game-title-{game.id}" aria-describedby="game-description-{game.id}">
          <div class="game-copy">
            <h2 id="game-title-{game.id}">{game.title}</h2>
            <p id="game-description-{game.id}">{game.description}</p>
          </div>
          <div class="game-info">
            <span>{game.category}</span>
            <span>{game.duration}</span>
          </div>
          <img class="game-preview" src={game.preview.src} alt={game.preview.alt} width="256" height="256" />
        </a>
      </li>
    {/each}
  </ul>

</main>

<style>
  main { width: min(720px, calc(100% - 40px)); margin: 24px auto 0; }
  .catalog-date { margin: 0; text-align: center; color: var(--muted); font-size: .85rem; }
  .game-list { display: grid; grid-auto-rows: 1fr; gap: 12px; margin: 16px 0 0; padding: 0 0 32px; list-style: none; }
  li { min-width: 0; }
  .game-card { display: grid; height: 100%; box-sizing: border-box; grid-template-columns: minmax(0, 1fr) 96px; grid-template-areas: "copy preview" "info preview"; align-items: center; gap: 8px 16px; padding: 16px; border: 1px solid transparent; border-radius: 10px; background: var(--card-background); color: var(--ink); text-decoration: none; }
  .game-card:hover { border-color: #342a4044; }
  .game-preview { grid-area: preview; grid-row: 1 / -1; display: block; width: 96px; height: 96px; border-radius: 6px; }
  .game-copy { grid-area: copy; min-width: 0; }
  h2 { display: flex; align-items: center; min-height: 44px; margin: 0; font-size: 1.3rem; font-weight: 700; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 5px; }
  .game-card:hover h2, .game-card:focus-visible h2 { text-decoration-thickness: 2px; }
  .game-card:focus-visible { outline-color: var(--ink); }
  li p { min-block-size: 2lh; margin: 0; line-height: 1.45; }
  .game-info { grid-area: info; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: .8rem; }
  .game-info span:first-child { padding: 4px 8px; background: #ffffff40; border-radius: 4px; }
  @media (max-width: 500px) {
    main { margin-top: 18px; }
    .game-card { grid-template-columns: minmax(0, 1fr) 80px; grid-template-areas: "copy preview" "info info"; }
    .game-preview { width: 80px; height: 80px; }
  }
</style>
