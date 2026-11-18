<script lang="ts">
  let { onkey, disabled = false, describedBy, states = {} }: {
    onkey: (key: string) => void;
    disabled?: boolean;
    describedBy?: string;
    states?: Record<string, 'correct' | 'present' | 'absent'>;
  } = $props();
  const rows = ['QWERTYUIOP'.split(''), 'ASDFGHJKL'.split(''), ['Enter', ...'ZXCVBNM', 'Backspace']];
  const descriptions = { correct: 'correct position', present: 'in the word, different position', absent: 'no matching copy' };
</script>

<div class="keyboard" role="group" aria-label="On-screen keyboard" aria-describedby={describedBy}>
  {#each rows as row, index (index)}
    <div class="keyboard-row" class:middle-row={index === 1}>
      {#each row as key (key)}
        {@const state = states[key]}
        <button type="button" class="key {state ?? ''}" class:action-key={key === 'Enter' || key === 'Backspace'} {disabled}
          aria-label={key === 'Backspace' ? 'Delete last letter' : state ? `${key}, ${descriptions[state]}` : key}
          onpointerdown={(event) => event.preventDefault()} onclick={() => onkey(key)}>
          {#if key === 'Backspace'}
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 5h12v14H9l-7-7 7-7Z"/><path d="m12 9 6 6m0-6-6 6"/></svg>
          {:else}<span>{key}</span>{/if}
        </button>
      {/each}
    </div>
  {/each}
</div>

<style>
  .keyboard { display: grid; gap: 6px; width: 100%; }
  .keyboard-row { display: flex; justify-content: center; gap: 4px; }
  .middle-row { padding-inline: 5%; }
  .key { display: flex; align-items: center; justify-content: center; flex: 1 1 0; min-width: 0; height: 51px; padding: 0 1px; border: 1px solid var(--key-line); border-bottom-width: 3px; border-radius: 5px; background: var(--key-fill); color: var(--ink); font-family: inherit; font-size: .9rem; font-weight: 750; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  .key.correct { background: #22724f; border-color: #22724f; color: #fff; }
  .key.present { background: #f5cd47; border-color: #d6ad26; color: #49380e; }
  .key.absent { background: #6b778a; border-color: #6b778a; color: #fff; }
  .key.action-key { flex-grow: 1.55; font-size: .68rem; }
  .key:disabled { cursor: default; }
  .key:disabled:not(.correct):not(.present):not(.absent) { color: #666; background: #f3f3f3; }
  .key:active:not(:disabled) { transform: translateY(1px); border-bottom-width: 1px; }
  .key:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
  @media (hover: hover) { .key:hover:not(:disabled) { filter: brightness(.95); } }
  @media (max-width: 500px) { .key { height: 46px; } }
  @media (max-width: 380px) { .key { font-size: .82rem; } .key.action-key { font-size: .61rem; } }
  @media (prefers-reduced-motion: reduce) { .key:active:not(:disabled) { transform: none; } }
</style>
