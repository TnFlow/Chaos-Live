<script lang="ts">

  import type { Diagnostics, RuleDefinition, SystemStatus } from '../lib/types';

  interface LiveEvent {
    id: string;
    text: string;
    time: string;
    type: string;
  }

  let {
    status,
    rules,
    liveEvents,
    diagnostics,
    isCheckingDiagnostics = false,
    onTogglePause,
    onClearQueue,
    onRefresh,
    onRunDiagnostics,
  }: {
    status: SystemStatus | null;
    rules: RuleDefinition[];
    liveEvents: LiveEvent[];
    diagnostics: Diagnostics | null;
    isCheckingDiagnostics?: boolean;
    onTogglePause: () => void;
    onClearQueue: () => void;
    onRefresh: () => void;
    onRunDiagnostics: () => void;
  } = $props();
</script>

  <div class="monitor-grid">
    <!-- Comprobacion previa al directo -->
    <div class="control-panel-card glass-card full-width preflight-card">
      <h3>🩺 Comprobación previa al directo</h3>
      <p class="preflight-intro">
        Revisa de una vez todo lo que suele fallar justo antes de empezar, en lugar
        de descubrirlo en vivo.
      </p>
      <div class="controls-row">
        <button class="action-btn btn-primary" onclick={onRunDiagnostics} disabled={isCheckingDiagnostics}>
          {isCheckingDiagnostics ? '⏳ Comprobando...' : '🩺 Comprobar ahora'}
        </button>
        {#if diagnostics}
          <span class="preflight-verdict verdict-{diagnostics.status}">
            {diagnostics.status === 'ok'
              ? '✅ Todo listo'
              : diagnostics.status === 'warn'
                ? '⚠️ Con avisos'
                : '❌ Hay problemas'}
          </span>
        {/if}
      </div>

      {#if diagnostics}
        <ul class="preflight-list">
          {#each diagnostics.checks as check (check.id)}
            <li class="preflight-item check-{check.status}">
              <span class="check-icon">
                {check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌'}
              </span>
              <div class="check-body">
                <strong>{check.label}</strong>
                <span class="check-detail">{check.detail}</span>
                {#if check.hint}
                  <span class="check-hint">👉 {check.hint}</span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="kpi-card glass-card">
      <span class="kpi-icon">🎮</span>
      <div class="kpi-info">
        <span class="kpi-label">Conexión con el juego</span>
        <span class="kpi-value">{status?.adapters?.gameConnected ? 'Conectado' : 'En espera'}</span>
        <span class="kpi-sub">{status?.adapters?.gameConnected ? '🟢 Listo para ejecutar comandos' : '🟡 Sin Minecraft: se registra en consola'}</span>
      </div>
    </div>

    <div class="kpi-card glass-card">
      <span class="kpi-icon">📦</span>
      <div class="kpi-info">
        <span class="kpi-label">Cola de acciones</span>
        <span class="kpi-value">{status?.queue?.size || 0}</span>
        <span class="kpi-sub">{status?.isPaused ? '⏸️ Motor en pausa' : '⚡ Procesando con normalidad'}</span>
      </div>
    </div>

    <div class="kpi-card glass-card">
      <span class="kpi-icon">🎯</span>
      <div class="kpi-info">
        <span class="kpi-label">Reglas activas</span>
        <span class="kpi-value">{rules.filter((r) => r.enabled).length} / {rules.length}</span>
        <span class="kpi-sub">Motor de prioridades en marcha</span>
      </div>
    </div>

    <div class="kpi-card glass-card">
      <span class="kpi-icon">👥</span>
      <div class="kpi-info">
        <span class="kpi-label">Clientes conectados</span>
        <span class="kpi-value">{status?.adapters?.clients?.total || 0}</span>
        <span class="kpi-sub">
          {status?.adapters?.clients?.overlay || 0} overlay · {status?.adapters?.clients?.mod || 0} mod
        </span>
      </div>
    </div>

    <!-- Controles de emergencia -->
    <div class="control-panel-card glass-card full-width">
      <h3>🚨 Controles de emergencia</h3>
      <div class="controls-row">
        <button
          class="action-btn {status?.isPaused ? 'btn-resume' : 'btn-pause'}"
          onclick={onTogglePause}
        >
          {status?.isPaused ? '▶️ Reanudar' : '⏸️ Pausar todo'}
        </button>
        <button class="action-btn btn-danger" onclick={onClearQueue}>
          🧹 Vaciar la cola
        </button>
        <button class="action-btn btn-secondary" onclick={onRefresh}>
          🔄 Actualizar estado
        </button>
      </div>
    </div>

    <!-- Eventos en vivo -->
    <div class="live-feed-card glass-card full-width">
      <h3>⚡ Eventos del directo y acciones ejecutadas</h3>
      <div class="feed-list">
        {#if liveEvents.length === 0}
          <div class="empty-feed">Esperando eventos del directo... (puedes lanzar uno de prueba en el Simulador)</div>
        {:else}
          {#each liveEvents as ev (ev.id)}
            <div class="feed-item feed-{ev.type}">
              <span class="feed-time">{ev.time}</span>
              <span class="feed-text">{ev.text}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
