<script lang="ts">

  import type { AlertView } from '../lib/overlay-types';
  import { accionLegible } from '../lib/mc-live-state';

  let { alert }: { alert: AlertView } = $props();

  /**
   * Lo que pasa en la partida, en cristiano.
   *
   * Debajo de esta caja iba antes una píldora con el comando literal
   * (`MC: /execute at @p run summon tnt ~ ~2 ~ {Fuse:40}`). Se quitó: es ruido
   * técnico que la audiencia no entiende y que enseña cómo está montado el
   * directo por dentro.
   */
  let efecto = $derived(accionLegible(alert.command, alert.viewerFeedback));
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
        <div class="reward-box-desc">{efecto}</div>
      </div>
    </div>
  </div>
</div>
