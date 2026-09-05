<script lang="ts">
  /**
   * Marquesina inferior con los comandos ya ejecutados.
   *
   * La lista se duplica y la animación desplaza justo un 50%, que es lo que
   * hace que el bucle no tenga costura. Con menos de tres comandos se rellena
   * repitiendo, para que la cinta no se quede medio vacía al arrancar.
   */
  import type { ActionView, RewardView } from '../../lib/overlay-types';

  let {
    recentActions,
    rewards,
    speedSeconds = 26,
  }: {
    recentActions: ActionView[];
    rewards: RewardView[];
    speedSeconds?: number;
  } = $props();

  // Al empezar el directo todavía no se ha ejecutado nada: la cinta enseña
  // entonces el catálogo de reglas, que es lo que la audiencia puede provocar.
  let items = $derived(
    recentActions.length > 0
      ? recentActions.map((a) => `/${a.command}`)
      : rewards.map((r) => `${r.icon} ${r.giftName} → ${r.rewardText}`)
  );
</script>

{#if items.length > 0}
  <div class="mc-ticker mc-panel" style="--mc-marquee-speed: {speedSeconds}s">
    <span class="mc-tag mc-mono">EN EL JUEGO</span>
    <div class="mc-ticker__viewport">
      <div class="mc-ticker__track">
        {#each items as text, i (`a-${i}`)}
          <span class="mc-ticker__item mc-mono">{text}</span>
        {/each}
        {#each items as text, i (`b-${i}`)}
          <span class="mc-ticker__item mc-mono">{text}</span>
        {/each}
      </div>
    </div>
  </div>
{/if}
