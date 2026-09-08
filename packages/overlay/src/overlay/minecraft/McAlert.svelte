<script lang="ts">
  /**
   * La alerta grande de regalo.
   *
   * Enseña quién mandó qué y, debajo, lo que eso provoca en la partida contado
   * en cristiano. Antes ahí iba el comando literal (`/execute at @p run summon
   * tnt ~ ~2 ~ {Fuse:40}`): no le decía nada a la audiencia y enseñaba de más.
   */
  import type { AlertView } from '../../lib/overlay-types';
  import { accionLegible } from '../../lib/mc-live-state';

  let { alert }: { alert: AlertView } = $props();

  let efecto = $derived(accionLegible(alert.command, alert.viewerFeedback));
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
      {alert.giftName
        ? `Envió ${alert.giftName} (${alert.value}◆)`
        : `¡${alert.sender} desató una acción en Minecraft!`}
    </p>
    <div class="mc-alert__efecto">
      <span class="mc-alert__efecto-badge mc-mono">EN LA PARTIDA</span>
      <span class="mc-alert__efecto-text">{efecto}</span>
    </div>
  </div>
</div>
