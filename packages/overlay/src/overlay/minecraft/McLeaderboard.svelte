<script lang="ts">
  /** Los mayores aportes del directo, tal y como los manda el servidor. */
  import type { LeaderboardEntry } from '../../lib/types';

  let {
    leaderboard,
    limit = 4,
  }: {
    leaderboard: LeaderboardEntry[];
    limit?: number;
  } = $props();

  let top = $derived(leaderboard.slice(0, limit));
</script>

<div class="mc-card mc-card--tight mc-panel--strong">
  <div class="mc-card__head">
    <span class="mc-card__title mc-mono">TOP APOYOS</span>
  </div>
  <div class="mc-list mc-list--tight">
    {#if top.length === 0}
      <div class="mc-empty mc-mono">SÉ EL PRIMERO</div>
    {:else}
      {#each top as entry, i (entry.name)}
        <div class="mc-leader mc-row">
          <span class="mc-leader__rank mc-mono">#{i + 1}</span>
          <span class="mc-leader__name mc-truncate">{entry.name}</span>
          <span class="mc-leader__value mc-mono">{entry.totalValue}◆</span>
        </div>
      {/each}
    {/if}
  </div>
</div>
