<script lang="ts">
  /**
   * Estado de la conexion y contador de eventos, en estilo cristal.
   *
   * Estaba suelto dentro de la cabecera del overlay, mezclado con los botones
   * del streamer (Ajustes, Simular, Panel). Como widget solo interesa la parte
   * que ve la audiencia, asi que aqui viaja sin los mandos.
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

<div class="status-bar glass-panel" id="overlay-status-bar">
  <div class="status-pill">
    <span class="indicator-dot {isConnected ? 'connected' : 'disconnected'}"></span>
    <span class="status-text">{isConnected ? 'EN DIRECTO' : 'CONECTANDO...'}</span>
  </div>

  <div class="status-handle">@{handle}</div>

  <div class="stats-counter">
    <span class="counter-label">EVENTOS</span>
    <span class="counter-val">{eventCount}</span>
  </div>
</div>
