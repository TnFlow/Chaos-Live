<script lang="ts">
  /**
   * Menú "REGALOS → EVENTOS", paginado.
   *
   * En el HUD vertical no cabe la lista entera de reglas y un scroll no se ve
   * en una fuente de OBS, así que el menú pasa página cada `carouselSeconds`.
   * Cada tarjeta lleva además su cooldown, que aquí es "cuánto hace que se
   * disparó" (ver `mc-live-state`), no un cooldown real del motor de reglas.
   */
  import { onMount } from 'svelte';
  import type { RewardView } from '../../lib/overlay-types';
  import {
    cooldownView,
    itemLabelFromCommand,
    pageCount,
    pageOf,
  } from '../../lib/mc-live-state';

  let {
    rewards,
    cooldowns,
    carouselSeconds = 6,
    itemsPerPage = 4,
    showCooldowns = true,
  }: {
    rewards: RewardView[];
    cooldowns: Record<string, number>;
    carouselSeconds?: number;
    itemsPerPage?: number;
    showCooldowns?: boolean;
  } = $props();

  let page = $state(0);
  let now = $state(Date.now());

  // Un único intervalo mueve las dos cosas que cambian solas: la cuenta atrás
  // de los cooldowns (cada segundo) y la página del carrusel. La página se
  // lleva en un contador propio y no derivada del reloj, para que el menú
  // siempre empiece en la primera página al abrir la fuente en OBS.
  onMount(() => {
    let elapsed = 0;
    const tick = setInterval(() => {
      now = Date.now();
      elapsed += 1;
      if (elapsed >= Math.max(1, carouselSeconds)) {
        elapsed = 0;
        page += 1;
      }
    }, 1000);
    return () => clearInterval(tick);
  });

  let totalPages = $derived(pageCount(rewards.length, itemsPerPage));
  let visible = $derived(pageOf(rewards, page, itemsPerPage));
</script>

<div class="mc-card mc-panel--strong">
  <div class="mc-card__head">
    <span class="mc-card__title mc-mono">REGALOS → EVENTOS</span>
    <span class="mc-card__meta mc-mono">PÁG {(page % totalPages) + 1}/{totalPages}</span>
  </div>

  <div class="mc-list">
    {#if rewards.length === 0}
      <div class="mc-empty mc-mono">SIN REGLAS ACTIVAS</div>
    {:else}
      {#each visible as r (r.id)}
        {@const cd = cooldownView(showCooldowns ? cooldowns[r.id] : undefined, now)}
        <div class="mc-reward mc-row">
          <div class="mc-slot mc-reward__slot">
            {#if r.imageUrl}
              <img src={r.imageUrl} alt={r.giftName} class="mc-reward__img" />
            {:else}
              <span class="mc-reward__emoji">{r.icon}</span>
            {/if}
            <span class="mc-reward__slot-note mc-mono">gift</span>
          </div>

          <div class="mc-reward__body">
            <div class="mc-reward__top">
              <span class="mc-reward__name">{r.giftName}</span>
              <span class="mc-reward__qty mc-mono">{r.cost}◆</span>
            </div>
            <div class="mc-reward__text">{r.rewardText}</div>
            {#if showCooldowns}
              <div class="mc-reward__cooldown">
                <div class="mc-reward__cooldown-fill" style="width: {cd.pct}%"></div>
              </div>
            {/if}
          </div>

          <div class="mc-reward__aside">
            <div class="mc-slot mc-slot--dark mc-reward__item">
              <span class="mc-reward__item-text mc-mono">{itemLabelFromCommand(r.command)}</span>
            </div>
            {#if showCooldowns}
              <span class="mc-reward__cd-label mc-mono" style="color: {cd.color}">{cd.label}</span>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
