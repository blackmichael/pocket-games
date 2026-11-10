<script lang="ts">
  import { onMount } from 'svelte';

  let destination = $state('/games/catdog/');
  onMount(() => {
    destination = '/games/catdog/' + location.search + location.hash;
    location.replace(destination);
  });
</script>

<svelte:head><title>Catdog — Pocket Games</title></svelte:head>
<main id="main" tabindex="-1">
  <h1>Catdog</h1>
  <p>Catdog has moved. <a href={destination}>Continue to Catdog</a>.</p>
  <noscript><p>To keep this puzzle’s date or seed without JavaScript, replace sunmoon with catdog in the address.</p></noscript>
</main>

<style>
  main { width: min(600px, calc(100% - 24px)); margin: 24px auto; padding: 24px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
  h1 { margin-top: 0; }
  a { display: inline-flex; align-items: center; min-height: 44px; }
</style>
