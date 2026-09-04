<script lang="ts">

  import type { RewardView } from '../lib/overlay-types';

  let { rewards }: { rewards: RewardView[] } = $props();
</script>

<div class="rewards-menu-card glass-panel" id="overlay-rewards-menu">
  <div class="rewards-menu-header">
    <div class="header-title-wrap">
      <span class="menu-icon">🎁</span>
      <span class="menu-title">RECOMPENSAS</span>
    </div>
    <span class="live-tag">EN VIVO</span>
  </div>

  <div class="rewards-list-scroll">
    {#each rewards as r (r.id)}
      <div class="reward-item-row" style="--reward-accent: {r.color}">
        <div class="reward-icon-box">
          {#if r.imageUrl}
            <img src={r.imageUrl} alt={r.giftName} class="reward-img" />
          {:else}
            <span class="reward-emoji">{r.icon}</span>
          {/if}
        </div>
        <div class="reward-info">
          <div class="reward-top">
            <span class="gift-name">{r.giftName}</span>
            <span class="cost-badge">{r.cost} 💎</span>
          </div>
          <div class="reward-action-text">{r.rewardText}</div>
        </div>
      </div>
    {/each}
  </div>
</div>
