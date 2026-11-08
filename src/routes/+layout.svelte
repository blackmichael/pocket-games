<script lang="ts">
  import '../app.css';
  import '@fontsource/lilita-one/latin-400.css';
  import wordmarkFont from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?url';
  let { children } = $props();
</script>

<svelte:head>
  <link rel="preload" href={wordmarkFont} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <a class="brand" href="/" aria-label="Pocket Games home">Pocket Games</a>
</header>
<div class="site-content">{@render children()}</div>
<footer class="site-footer"><div class="footer-content"><a href="/word-list-license.txt">Word list credits</a><a href="/lilita-one-license.txt">Font credits</a></div></footer>

<style>
  .skip-link { position: absolute; top: -80px; left: 16px; background: white; padding: 12px; z-index: 20; }
  .skip-link:focus { top: 12px; }
  .site-header { width: 100%; margin: 24px 0 0; padding: 0 20px 16px; border-bottom: 1px solid var(--line); display: flex; justify-content: center; }
  .brand { display: inline-flex; align-items: center; min-height: 44px; color: var(--ink); font-family: 'Lilita One', 'Segoe UI', system-ui, sans-serif; font-size: clamp(2rem, 6vw, 3rem); font-weight: 400; line-height: 1.1; letter-spacing: -.02em; text-decoration: none; white-space: nowrap; }
  .site-content { flex: 1 0 auto; display: flow-root; padding-bottom: 32px; background-image: url('../lib/assets/console-pattern.svg?inline'); background-size: 96px auto; background-position: center top; }
  .site-footer { width: 100%; margin: 0; padding: 20px 0 24px; border-top: 1px solid var(--line); font-size: .75rem; }
  .footer-content { width: min(780px, calc(100% - 40px)); margin-inline: auto; display: flex; flex-wrap: wrap; gap: 0 24px; }
  .site-footer a { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); }
  @media (max-width: 500px) { .site-header { margin-top: 14px; padding-bottom: 10px; } }
</style>
