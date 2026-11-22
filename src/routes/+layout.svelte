<script lang="ts">
  import '../app.css';
  import '@fontsource/lilita-one/latin-400.css';
  import wordmarkFont from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?url';
  import { page } from '$app/state';
  let { children } = $props();
</script>

<svelte:head>
  <link rel="preload" href={wordmarkFont} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="header-content">
    {#if page.route.id?.startsWith('/games/')}
      <a class="home-link" href="/" aria-label="Home — all games" title="All games">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.5 1.5 11h3v10h5v-7h5v7h5V11h3L12 2.5Z" />
        </svg>
      </a>
    {/if}
    <a class="brand" href="/" aria-label="Pocket Games home">Pocket Games</a>
  </div>
</header>
<div class="site-content">{@render children()}</div>
<footer class="site-footer">
  <div class="footer-content">
    <p class="footer-attribution">Made by <a href="https://michaelblack.xyz">michaelblack.xyz</a></p>
    <div class="footer-links">
      <a href="/word-list-license.txt">Word list credits</a>
      <a href="/wordladder-word-list-license.txt">Word Ladder credits</a>
      <a href="/lilita-one-license.txt">Font credits</a>
      <a href="https://github.com/blackmichael/pocket-games">Source code</a>
    </div>
  </div>
</footer>

<style>
  .skip-link { position: absolute; top: -80px; left: 16px; background: white; padding: 12px; z-index: 20; }
  .skip-link:focus { top: 12px; }
  .site-header { width: 100%; margin: 24px 0 0; padding: 0 12px 16px; border-bottom: 1px solid var(--line); }
  .header-content { width: min(780px, 100%); margin-inline: auto; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; }
  .home-link { grid-column: 1; grid-row: 1; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; color: var(--accent-line); border-radius: 6px; }
  .home-link:hover { color: var(--accent-hover); background: var(--accent-soft); }
  .home-link svg { width: 21px; height: 21px; }
  .brand { grid-column: 2; grid-row: 1; justify-self: center; display: inline-flex; align-items: center; min-height: 44px; color: var(--ink); font-family: 'Lilita One', 'Segoe UI', system-ui, sans-serif; font-size: clamp(2rem, 6vw, 3rem); font-weight: 400; line-height: 1.1; letter-spacing: -.02em; text-decoration: none; white-space: nowrap; }
  .site-content { flex: 1 0 auto; display: flow-root; padding-bottom: 32px; background-image: url('../lib/assets/console-pattern.svg?inline'); background-size: 96px auto; background-position: center top; }
  .site-footer { width: 100%; margin: 0; padding: 0; border-top: 1px solid var(--line); font-size: .75rem; }
  .footer-content { width: min(780px, calc(100% - 40px)); margin-inline: auto; text-align: center; }
  .footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 24px; }
  .footer-links a { text-decoration: none; }
  .footer-links a:hover, .footer-links a:focus-visible { text-decoration: underline; }
  .footer-attribution { margin: 0; color: var(--muted); font-weight: 500; }
  .footer-attribution a { position: relative; text-decoration: none; }
  .footer-attribution a::after { content: ''; position: absolute; left: 0; right: 0; top: calc(50% + .5em + 3px); height: 1px; background: currentColor; transform: scaleY(.5); transform-origin: top; }
  .site-footer a { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); }
  @media (max-width: 500px) { .site-header { margin-top: 14px; padding-bottom: 10px; } .brand { font-size: clamp(1.65rem, 7vw, 2rem); } }
</style>
