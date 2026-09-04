<script lang="ts">

  import type { ActionView, RewardView } from '../lib/overlay-types';

  let {
    rewards,
    recentActions,
    showMarquee,
  }: {
    rewards: RewardView[];
    recentActions: ActionView[];
    showMarquee: boolean;
  } = $props();
</script>

{#if showMarquee}
  <!-- StreamToEarn Infinite Rewards Marquee Ticker -->
  <div class="rewards-marquee-ticker glass-panel" id="rewards-marquee">
    <div class="marquee-badge">
      <span class="badge-icon">🎁</span>
      <span>REGALOS Y EFECTOS</span>
    </div>

    <div class="marquee-wrapper">
      <div class="marquee-track">
        {#each rewards as r (r.id + '-1')}
          <div class="marquee-item" style="--item-color: {r.color}">
            <span class="item-icon">{r.icon}</span>
            <span class="item-name">{r.giftName}</span>
            <span class="item-cost">({r.cost} 💎)</span>
            <span class="item-arrow">➔</span>
            <span class="item-reward">{r.rewardText}</span>
          </div>
        {/each}
        {#each rewards as r (r.id + '-2')}
          <div class="marquee-item" style="--item-color: {r.color}">
            <span class="item-icon">{r.icon}</span>
            <span class="item-name">{r.giftName}</span>
            <span class="item-cost">({r.cost} 💎)</span>
            <span class="item-arrow">➔</span>
            <span class="item-reward">{r.rewardText}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else if recentActions.length > 0}
  <!-- Standard Action Ticker if marquee is off -->
  <div class="action-ticker glass-panel" id="overlay-action-ticker">
    <div class="ticker-label">EJECUTADO EN LA PARTIDA</div>
    <div class="ticker-items">
      {#each recentActions as action (action.id)}
        <div class="ticker-item">
          <span class="ticker-cmd">/{action.command}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}
