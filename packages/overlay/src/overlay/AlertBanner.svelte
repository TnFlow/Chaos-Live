<script lang="ts">

  import type { AlertView } from '../lib/overlay-types';

  let { alert }: { alert: AlertView } = $props();
</script>

<div class="grand-alert-wrapper" id="grand-alert-box">
  <div class="grand-alert-card glass-panel" style="--alert-color: {alert.color}">
    <div class="alert-shimmer"></div>
    <div class="alert-icon-ring">
      {#if alert.imageUrl}
        <img src={alert.imageUrl} alt={alert.giftName || 'Alert'} class="alert-img" />
      {:else}
        <span class="alert-icon">{alert.icon}</span>
      {/if}
    </div>
    <div class="alert-content">
      <h2 class="alert-banner-tag">{alert.title}</h2>
      <h1 class="alert-sender-name">{alert.sender}</h1>
      {#if alert.giftName}
        <p class="alert-gift-detail">
          Envió <strong style="color: var(--alert-color);">{alert.giftName}</strong> ({alert.value} 💎)
        </p>
      {/if}

      <!-- High-visibility Viewer Reward Highlight Box -->
      <div class="alert-reward-box">
        <div class="reward-box-label">🎮 LO QUE PASA EN LA PARTIDA:</div>
        <div class="reward-box-desc">
          {alert.viewerFeedback?.description || `¡${alert.sender} desató una acción en Minecraft!`}
        </div>
      </div>

      {#if alert.command}
        <div class="alert-command-pill">
          <span class="cmd-icon">⚡</span>
          <span class="cmd-text">MC: /{alert.command}</span>
        </div>
      {/if}
    </div>
  </div>
</div>
