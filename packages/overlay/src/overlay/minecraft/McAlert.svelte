<script lang="ts">
  /** La alerta grande de regalo, con el comando que salió hacia la partida. */
  import type { AlertView } from '../../lib/overlay-types';

  let { alert }: { alert: AlertView } = $props();
</script>

<div class="mc-alert" style="--mc-alert-color: {alert.color}">
  <div class="mc-slot mc-alert__slot">
    {#if alert.imageUrl}
      <img src={alert.imageUrl} alt={alert.giftName || 'Alerta'} class="mc-alert__img" />
    {:else}
      <span class="mc-alert__emoji">{alert.icon}</span>
    {/if}
  </div>

  <div class="mc-alert__body">
    <div class="mc-alert__tag mc-mono">{alert.title}</div>
    <h1 class="mc-alert__sender">{alert.sender}</h1>
    <p class="mc-alert__desc">
      {alert.viewerFeedback?.description ||
        (alert.giftName
          ? `Envió ${alert.giftName} (${alert.value}◆)`
          : `¡${alert.sender} desató una acción en Minecraft!`)}
    </p>
    {#if alert.command}
      <div class="mc-alert__command">
        <span class="mc-alert__command-badge mc-mono">MC</span>
        <span class="mc-alert__command-text mc-mono">/{alert.command}</span>
      </div>
    {/if}
  </div>
</div>
