<script lang="ts">
  /**
   * Cola de efectos pendientes de verse en la partida.
   *
   * Es una reconstrucción del cliente: lo que ya despachó el motor sale como
   * "AHORA" y lo que sigue esperando lleva una ETA estimada por su posición.
   */
  import { etaLabel, type QueuedEffect } from '../../lib/mc-live-state';

  let {
    queue,
    limit = 3,
  }: {
    queue: QueuedEffect[];
    limit?: number;
  } = $props();

  let visible = $derived(queue.slice(0, limit));
</script>

<div class="mc-card mc-card--tight mc-panel--strong">
  <div class="mc-card__head">
    <span class="mc-card__title mc-card__title--cyan mc-mono">EN COLA</span>
    <span class="mc-card__meta mc-mono">{queue.length}</span>
  </div>
  <div class="mc-list mc-list--tight">
    {#if visible.length === 0}
      <div class="mc-empty mc-mono">NADA EN COLA</div>
    {:else}
      {#each visible as item, i (item.id)}
        <div class="mc-queue-item mc-row {item.status === 'running' ? 'mc-queue-item--running' : ''}">
          <span class="mc-queue-item__emoji">{item.emoji}</span>
          <span class="mc-queue-item__label mc-truncate">{item.label}</span>
          <span class="mc-queue-item__eta mc-mono">{etaLabel(item, i)}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>
