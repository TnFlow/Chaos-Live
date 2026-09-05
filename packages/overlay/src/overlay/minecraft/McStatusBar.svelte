<script lang="ts">
  /**
   * Cabecera del HUD pixel: estado de la conexión a la izquierda, cuenta del
   * streamer a la derecha.
   *
   * El diseño reserva un hueco para los espectadores, pero el overlay no
   * recibe ese dato de TikTok: en su lugar va el contador de eventos, que sí
   * es real y sirve igual para ver de un vistazo si el directo está vivo.
   */
  let {
    isConnected,
    eventCount,
    handle,
  }: {
    isConnected: boolean;
    eventCount: number;
    handle: string;
  } = $props();
</script>

<div class="mc-status">
  <div class="mc-status__live mc-panel">
    <span class="mc-status__dot {isConnected ? '' : 'mc-status__dot--off'}"></span>
    <span class="mc-status__label mc-mono">{isConnected ? 'EN VIVO' : 'CONECTANDO'}</span>
    <span class="mc-status__count mc-mono">{eventCount} EV</span>
  </div>
  <div class="mc-status__spacer"></div>
  <div class="mc-status__handle mc-panel mc-mono">@{handle}</div>
</div>
