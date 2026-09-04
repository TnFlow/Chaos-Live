<script lang="ts">

  import type { HistoryEvent, SystemStatus } from '../lib/types';

  let {
    filteredHistory,
    historySearch = $bindable(''),
    status,
    fetchHistory,
  }: {
    filteredHistory: HistoryEvent[];
    historySearch?: string;
    status: SystemStatus | null;
    fetchHistory: () => void;
  } = $props();
</script>

  <div class="history-view glass-card">
    <div class="history-toolbar">
      <input
        type="text"
        placeholder="Buscar por usuario, comando o tipo de evento..."
        bind:value={historySearch}
        class="styled-input search-input"
      />
      <button class="action-btn btn-secondary" onclick={fetchHistory}>🔄 Actualizar</button>
    </div>

    <div class="table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Plataforma</th>
            <th>Usuario</th>
            <th>Tipo de evento</th>
            <th>Comando ejecutado</th>
            <th>Duración</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {#if filteredHistory.length === 0}
            <tr>
              <td colspan="7" class="empty-table">No hay eventos que coincidan en el historial.</td>
            </tr>
          {:else}
            {#each filteredHistory as h (h.id)}
              <tr>
                <td class="col-time">{new Date(h.createdAt).toLocaleTimeString()}</td>
                <td><span class="badge badge-platform">{h.platform}</span></td>
                <td class="col-user"><strong>{h.userName}</strong></td>
                <td><span class="badge badge-event">{h.eventType}</span></td>
                <td class="col-cmd"><code>{h.actionCommand || '—'}</code></td>
                <td>{h.executionTimeMs ? `${h.executionTimeMs}ms` : '—'}</td>
                <td>
                  <span class="status-tag {h.success ? 'tag-success' : 'tag-fail'}">
                    {h.success ? 'OK' : 'FALLÓ'}
                  </span>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </div>
