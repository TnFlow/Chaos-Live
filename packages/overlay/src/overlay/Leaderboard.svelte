<script lang="ts">

  import type { GoalView } from '../lib/overlay-types';
  import type { LeaderboardEntry } from '../lib/types';

  let {
    leaderboard,
    secondaryGoal,
  }: {
    leaderboard: LeaderboardEntry[];
    secondaryGoal?: GoalView;
  } = $props();
</script>

<div class="leaderboard-container glass-panel" id="overlay-leaderboard">
  <div class="leaderboard-header">
    <span class="trophy-icon">🏆</span>
    <span class="leaderboard-title">MAYORES APORTES</span>
  </div>
  <div class="leaderboard-list">
    {#if leaderboard.length === 0}
      <div class="leaderboard-empty">¡Envía regalos para ser el nº1!</div>
    {:else}
      {#each leaderboard as entry, i}
        <div class="leaderboard-row rank-{i + 1}">
          <div class="rank-badge">#{i + 1}</div>
          <div class="donor-name">{entry.name}</div>
          <div class="diamond-count">{entry.totalValue} 💎</div>
        </div>
      {/each}
    {/if}
  </div>

  <!-- Segunda meta, resumida en la barra lateral -->
  {#if secondaryGoal}
    <div class="secondary-goal-widget">
      <div class="goal-label-row">
        <span class="goal-name-small">{secondaryGoal?.name}</span>
        <span class="goal-percent-small">{secondaryGoal?.percent}%</span>
      </div>
      <div class="goal-track-small">
        <div class="goal-fill-sec" style="width: {secondaryGoal?.percent}%;"></div>
      </div>
    </div>
  {/if}
</div>
