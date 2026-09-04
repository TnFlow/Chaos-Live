<script lang="ts">
  /**
   * Panel de control de Chaos-Live.
   *
   * Este componente es solo el armazón: cabecera, navegación y el estado que
   * comparten las pestañas. El contenido de cada pestaña vive en su propio
   * componente dentro de `./dashboard/`, y los estilos en
   * `./styles/dashboard.css`. Antes todo esto eran 3473 líneas en un archivo.
   */
  import { onMount, onDestroy } from 'svelte';
  import './styles/dashboard.css';
  import { setMasterVolume, setMuted } from './utils/sound-engine';
  import { DEFAULT_OVERLAY_SETTINGS } from './types/overlay-config';
  import type { OverlaySettings } from '@chaos-live/shared-protocol';
  import type { TikTokGiftPreset, CommandPreset, CommunityGoalPreset } from './data/tiktok-gifts';
  import { api, ApiError } from './lib/api';
  import { connectChaosSocket, type ChaosSocket } from './lib/ws-client';
  import type {
    Diagnostics,
    Goal,
    HistoryEvent,
    RuleDefinition,
    SystemStatus,
  } from './lib/types';

  import MonitorTab from './dashboard/MonitorTab.svelte';
  import RulesTab from './dashboard/RulesTab.svelte';
  import GoalsTab from './dashboard/GoalsTab.svelte';
  import HistoryTab from './dashboard/HistoryTab.svelte';
  import SimulatorTab from './dashboard/SimulatorTab.svelte';
  import OverlayStudioTab from './dashboard/OverlayStudioTab.svelte';
  import RuleEditorModal from './dashboard/RuleEditorModal.svelte';
  import GoalEditorModal from './dashboard/GoalEditorModal.svelte';

  let { onSwitchToOverlay = () => {} } = $props<{ onSwitchToOverlay?: () => void }>();

  type Tab = 'monitor' | 'rules' | 'goals' | 'history' | 'simulator' | 'overlay-studio';
  let activeTab = $state<Tab>('rules');

  // Estado general
  let status = $state<SystemStatus | null>(null);
  let diagnostics = $state<Diagnostics | null>(null);
  let isCheckingDiagnostics = $state(false);
  let rules = $state<RuleDefinition[]>([]);
  let goals = $state<Goal[]>([]);
  let historyEvents = $state<HistoryEvent[]>([]);
  let historySearch = $state('');
  let statusMessage = $state('');
  let isServerConnected = $state(false);

  // Overlay Studio
  let overlaySettings = $state<OverlaySettings>({ ...DEFAULT_OVERLAY_SETTINGS });
  let copiedUrlType = $state<string>('');

  // Editor de reglas
  let isEditingRule = $state(false);
  let editingRule = $state<RuleDefinition>(createEmptyRule());
  let ruleFilterPlatform = $state('all');
  let testingRuleId = $state('');
  let selectedPresetGiftId = $state('');

  // Editor de metas
  let isEditingGoal = $state(false);
  let editingGoal = $state<Goal>(createEmptyGoal());
  let selectedGoalPresetId = $state('');

  // Registro de eventos en vivo
  let liveEvents = $state<Array<{ id: string; text: string; time: string; type: string }>>([]);

  let pollTimer: ReturnType<typeof setInterval>;
  let socket: ChaosSocket | undefined;

  function createEmptyRule(): RuleDefinition {
    return {
      id: '',
      name: '',
      enabled: true,
      priority: 10,
      cooldownSeconds: 0,
      icon: '🎁',
      imageUrl: '',
      matcher: {
        platforms: ['tiktok', 'mock'],
        eventTypes: ['gift'],
        metadataMatch: { giftName: 'Rose' },
        minValue: 1,
      },
      action: {
        actionType: 'execute_command',
        command: 'summon chicken ~ ~1 ~ {CustomName:\'"${user.displayName}"\'}',
      },
      viewerFeedback: {
        title: '🎁 ¡REGALO ESPECIAL!',
        description: '¡${user.displayName} provocó algo en la partida!',
        bannerColor: '#f43f5e',
      },
    };
  }

  function createEmptyGoal(): Goal {
    return {
      id: '',
      name: '🌹 50 Rosas ➜ Invocar al Warden',
      eventType: 'gift',
      giftName: 'Rose',
      currentValue: 0,
      targetValue: 50,
      unit: 'Rosas',
      rewardDescription: 'Invocar al jefe Warden',
      actionCommand: 'summon warden ~ ~ ~ {CustomName:\'"JEFE DE LA COMUNIDAD"\'}',
      actionType: 'execute_command',
      completed: false,
      repeatable: true,
    };
  }

  let filteredRules = $derived(
    rules.filter((r) => {
      if (ruleFilterPlatform === 'all') return true;
      if (!r.matcher.platforms || r.matcher.platforms.length === 0) return true;
      return r.matcher.platforms.includes(ruleFilterPlatform);
    }),
  );

  let filteredHistory = $derived(
    historyEvents.filter((h) => {
      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      return (
        h.userName.toLowerCase().includes(q) ||
        (h.actionCommand && h.actionCommand.toLowerCase().includes(q)) ||
        h.eventType.toLowerCase().includes(q)
      );
    }),
  );

  let commandPreview = $derived(
    editingRule.action.command
      .replace(/\$\{user\.displayName\}/g, 'SuperFan99')
      .replace(/\$\{metadata\.giftName\}/g, String(editingRule.matcher.metadataMatch?.giftName || 'Rose'))
      .replace(/\$\{event\.value\}/g, String(editingRule.matcher.minValue || 10)),
  );

  let goalCommandPreview = $derived(
    editingGoal.actionCommand
      .replace(/\$\{goal\.name\}/g, editingGoal.name || 'Meta comunitaria')
      .replace(/\$\{user\.displayName\}/g, 'MayorAportador'),
  );

  onMount(() => {
    void refreshAll();

    pollTimer = setInterval(() => {
      void fetchStatus();
      if (activeTab === 'history') void fetchHistory();
      if (activeTab === 'goals') void fetchGoals();
    }, 2500);

    socket = connectChaosSocket({
      clientType: 'overlay',
      onConnectionChange: (connected) => {
        isServerConnected = connected;
        if (!connected) {
          flashStatus('⚠️ Se perdió la conexión con Chaos-Live. Reintentando...');
        }
      },
      onPacket: handlePacket,
    });
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    socket?.close();
  });

  function handlePacket(msg: { type: string; payload?: unknown }) {
    const time = new Date().toLocaleTimeString();

    if (msg.type === 'EVENT' || msg.type === 'CHAOS_EVENT') {
      const e = msg.payload as any;
      liveEvents = [
        {
          id: e.id,
          time,
          type: e.type,
          text: `[${e.platform?.toUpperCase() || 'DIRECTO'}] ${e.user?.displayName || 'Alguien'} envió ${e.type} (${e.metadata?.giftName || e.value})`,
        },
        ...liveEvents.slice(0, 49),
      ];
    } else if (msg.type === 'GAME_ACTION' || msg.type === 'ACTION_DISPATCHED') {
      const a = msg.payload as any;
      liveEvents = [
        {
          id: a.correlationId || a.id || String(Date.now()),
          time,
          type: 'action',
          text: `🎮 Ejecutado: "${a.command}"`,
        },
        ...liveEvents.slice(0, 49),
      ];
    } else if (msg.type === 'GOAL_PROGRESS' || msg.type === 'INITIAL_GOALS') {
      void fetchGoals();
    }
  }

  async function refreshAll() {
    await Promise.all([fetchStatus(), fetchRules(), fetchGoals(), fetchHistory()]);
  }

  /** Ejecuta una llamada a la API mostrando el error del servidor si falla. */
  async function run<T>(action: () => Promise<T>, errorPrefix: string): Promise<T | null> {
    try {
      return await action();
    } catch (err) {
      const message = err instanceof ApiError ? err.userMessage : String(err);
      flashStatus(`⚠️ ${errorPrefix}: ${message}`);
      return null;
    }
  }

  async function fetchStatus() {
    const result = await run(() => api.getStatus(), 'No se pudo leer el estado');
    if (result) status = result;
  }

  async function fetchRules() {
    const result = await run(() => api.getRules(), 'No se pudieron cargar las reglas');
    if (result) rules = result;
  }

  async function fetchGoals() {
    const result = await run(() => api.getGoals(), 'No se pudieron cargar las metas');
    if (result) goals = result;
  }

  async function fetchHistory() {
    const result = await run(() => api.getHistory(30), 'No se pudo cargar el historial');
    if (result) historyEvents = result;
  }

  async function runDiagnostics() {
    isCheckingDiagnostics = true;
    const result = await run(() => api.getDiagnostics(), 'No se pudo ejecutar la comprobación');
    if (result) {
      diagnostics = result;
      flashStatus(
        result.status === 'ok'
          ? '✅ Todo listo para empezar el directo'
          : result.status === 'warn'
            ? '⚠️ Hay avisos antes de empezar'
            : '❌ Hay problemas que impedirán que funcione',
      );
    }
    isCheckingDiagnostics = false;
  }

  async function togglePause() {
    if (!status) return;
    const isPaused = status.isPaused;
    const result = await run(
      () => (isPaused ? api.resumeQueue() : api.pauseQueue()),
      'No se pudo cambiar el estado',
    );
    if (result) {
      status.isPaused = result.isPaused;
      flashStatus(status.isPaused ? '⏸️ Ejecución en pausa' : '▶️ Ejecución reanudada');
    }
  }

  async function clearQueue() {
    if (!confirm('¿Seguro que quieres vaciar la cola de acciones pendientes de Minecraft?')) return;
    const result = await run(() => api.clearQueue(), 'No se pudo vaciar la cola');
    if (result) {
      flashStatus('🧹 Cola de acciones vaciada');
      void fetchStatus();
    }
  }

  async function toggleRule(rule: RuleDefinition) {
    const result = await run(
      () => api.updateRule(rule.id, { enabled: !rule.enabled }),
      'No se pudo actualizar la regla',
    );
    if (result) {
      rule.enabled = !rule.enabled;
      rules = [...rules];
      flashStatus(`Regla "${rule.name}" ${rule.enabled ? 'activada' : 'desactivada'}`);
    }
  }

  function openNewRule() {
    editingRule = createEmptyRule();
    selectedPresetGiftId = '';
    isEditingRule = true;
  }

  function openEditRule(rule: RuleDefinition) {
    editingRule = JSON.parse(JSON.stringify(rule));
    if (!editingRule.viewerFeedback) {
      editingRule.viewerFeedback = {
        title: '⚡ ¡ACCIÓN ACTIVADA!',
        description: '¡${user.displayName} desató el caos!',
        bannerColor: '#00f0ff',
      };
    }
    if (editingRule.cooldownMs && !editingRule.cooldownSeconds) {
      editingRule.cooldownSeconds = Math.round(editingRule.cooldownMs / 1000);
    }
    selectedPresetGiftId = '';
    isEditingRule = true;
  }

  function applyGiftPreset(preset: TikTokGiftPreset) {
    selectedPresetGiftId = preset.id;
    editingRule.name = `Regalo: ${preset.name}`;
    editingRule.icon = preset.icon;
    if (!editingRule.matcher.metadataMatch) editingRule.matcher.metadataMatch = {};
    editingRule.matcher.metadataMatch.giftName = preset.name;
    editingRule.matcher.minValue = preset.coins;
    editingRule.action.command = preset.defaultCommand;
    editingRule.viewerFeedback = {
      title: preset.defaultFeedbackTitle,
      description: preset.defaultFeedbackDesc,
      bannerColor: preset.bannerColor,
    };
  }

  function applyCommandPreset(preset: CommandPreset) {
    editingRule.action.command = preset.command;
    if (editingRule.viewerFeedback) {
      editingRule.viewerFeedback.title = preset.defaultFeedbackTitle;
      editingRule.viewerFeedback.description = preset.defaultFeedbackDesc;
      editingRule.viewerFeedback.bannerColor = preset.bannerColor;
    }
  }

  async function testRule(rule: RuleDefinition) {
    testingRuleId = rule.id;
    const result = await run(() => api.testRule(rule.id), 'La prueba falló');
    if (result) {
      flashStatus(`🚀 ¡Prueba lanzada para "${rule.name}"!`);
    }
    setTimeout(() => {
      if (testingRuleId === rule.id) testingRuleId = '';
    }, 1500);
  }

  async function saveAndTestRule() {
    const saved = await saveRule();
    if (saved && saved.id) {
      await testRule(saved);
    }
  }

  async function saveRule(): Promise<RuleDefinition | null> {
    if (!editingRule.name.trim() || !editingRule.action.command.trim()) {
      flashStatus('⚠️ Escribe un nombre para la regla y un comando de Minecraft');
      return null;
    }

    const result = await run(
      () =>
        editingRule.id
          ? api.updateRule(editingRule.id, editingRule)
          : api.createRule(editingRule),
      'No se pudo guardar la regla',
    );

    if (!result) return null;

    const savedRule = result.rule ?? editingRule;
    editingRule = savedRule;
    isEditingRule = false;
    await fetchRules();
    flashStatus('✅ Regla guardada y aplicada al instante');
    return savedRule;
  }

  async function deleteRule(id: string) {
    if (!confirm('¿Seguro que quieres borrar esta regla?')) return;
    const result = await run(() => api.deleteRule(id), 'No se pudo borrar la regla');
    if (result) {
      await fetchRules();
      flashStatus('🗑️ Regla borrada');
    }
  }

  function openNewGoal() {
    editingGoal = createEmptyGoal();
    selectedGoalPresetId = '';
    isEditingGoal = true;
  }

  function openEditGoal(goal: Goal) {
    editingGoal = JSON.parse(JSON.stringify(goal));
    selectedGoalPresetId = '';
    isEditingGoal = true;
  }

  function applyGoalPreset(preset: CommunityGoalPreset) {
    selectedGoalPresetId = preset.id;
    editingGoal.name = preset.name;
    editingGoal.eventType = preset.eventType;
    editingGoal.giftName = preset.giftName;
    editingGoal.targetValue = preset.targetValue;
    editingGoal.unit = preset.unit;
    editingGoal.rewardDescription = preset.rewardDescription;
    editingGoal.actionCommand = preset.actionCommand;
  }

  async function saveGoal(): Promise<Goal | null> {
    if (!editingGoal.name.trim() || !editingGoal.actionCommand.trim()) {
      flashStatus('⚠️ Escribe un nombre para la meta y un comando de Minecraft');
      return null;
    }

    const result = await run(
      () =>
        editingGoal.id ? api.updateGoal(editingGoal.id, editingGoal) : api.createGoal(editingGoal),
      'No se pudo guardar la meta',
    );

    if (!result) return null;

    isEditingGoal = false;
    await fetchGoals();
    flashStatus('🎯 Meta guardada');
    return result.goal;
  }

  async function deleteGoal(id: string) {
    if (!confirm('¿Seguro que quieres borrar esta meta comunitaria?')) return;
    const result = await run(() => api.deleteGoal(id), 'No se pudo borrar la meta');
    if (result) {
      await fetchGoals();
      flashStatus('🗑️ Meta borrada');
    }
  }

  async function resetGoal(id: string) {
    if (!confirm('¿Reiniciar el progreso de esta meta a 0?')) return;
    const result = await run(() => api.resetGoal(id), 'No se pudo reiniciar la meta');
    if (result) {
      await fetchGoals();
      flashStatus('🔄 Progreso de la meta reiniciado');
    }
  }

  async function injectSynthetic(eventData: Record<string, unknown>) {
    const result = await run(() => api.injectTestEvent(eventData), 'No se pudo inyectar el evento');
    if (result) {
      flashStatus(`🚀 Evento "${eventData.type}" inyectado`);
      void fetchStatus();
    }
  }

  function flashStatus(msg: string) {
    statusMessage = msg;
    setTimeout(() => {
      if (statusMessage === msg) statusMessage = '';
    }, 3500);
  }

  async function fetchOverlaySettings() {
    const result = await run(() => api.getOverlaySettings(), 'No se pudieron cargar los ajustes');
    if (result) {
      overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS, ...result };
      setMasterVolume(overlaySettings.masterVolume);
      setMuted(!overlaySettings.soundEnabled);
    }
  }

  async function saveOverlaySettings() {
    const result = await run(
      () => api.updateOverlaySettings(overlaySettings),
      'No se pudieron guardar los ajustes',
    );
    if (result) {
      setMasterVolume(overlaySettings.masterVolume);
      setMuted(!overlaySettings.soundEnabled);
      flashStatus('🎨 Ajustes guardados y aplicados en directo');
    }
  }

  function copyToClipboard(text: string, type: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      copiedUrlType = type;
      flashStatus(`📋 Enlace de ${type} copiado`);
      setTimeout(() => {
        if (copiedUrlType === type) copiedUrlType = '';
      }, 2500);
    }
  }

  function insertVariable(token: string) {
    editingRule.action.command += ` ${token}`;
  }

  function insertGoalVariable(token: string) {
    editingGoal.actionCommand += ` ${token}`;
  }
</script>

<div class="dashboard-root">
  <header class="dashboard-header">
    <div class="header-left">
      <div class="brand">
        <span class="brand-icon">⚡</span>
        <div class="brand-text">
          <h1>CHAOS-LIVE</h1>
          <span class="subtext">CENTRO DE CONTROL</span>
        </div>
      </div>

      <nav class="nav-tabs">
        <button
          id="tab-monitor"
          class="nav-tab {activeTab === 'monitor' ? 'active' : ''}"
          onclick={() => { activeTab = 'monitor'; void runDiagnostics(); }}
        >
          📊 Monitor
        </button>
        <button
          id="tab-rules"
          class="nav-tab {activeTab === 'rules' ? 'active' : ''}"
          onclick={() => (activeTab = 'rules')}
        >
          ⚙️ Reglas ({rules.length})
        </button>
        <button
          id="tab-goals"
          class="nav-tab {activeTab === 'goals' ? 'active' : ''}"
          onclick={() => (activeTab = 'goals')}
        >
          🎯 Metas ({goals.length})
        </button>
        <button
          id="tab-overlay-studio"
          class="nav-tab {activeTab === 'overlay-studio' ? 'active' : ''}"
          onclick={() => { activeTab = 'overlay-studio'; void fetchOverlaySettings(); }}
        >
          🎨 Estudio de Overlay
        </button>
        <button
          id="tab-history"
          class="nav-tab {activeTab === 'history' ? 'active' : ''}"
          onclick={() => (activeTab = 'history')}
        >
          📜 Historial
        </button>
        <button
          id="tab-simulator"
          class="nav-tab {activeTab === 'simulator' ? 'active' : ''}"
          onclick={() => (activeTab = 'simulator')}
        >
          🧪 Simulador
        </button>
      </nav>
    </div>

    <div class="header-right">
      {#if statusMessage}
        <span class="flash-pill">{statusMessage}</span>
      {/if}

      {#if !isServerConnected}
        <div class="status-indicator-badge">
          <span class="status-dot dot-offline"></span>
          <span class="status-label">SIN CONEXIÓN</span>
        </div>
      {:else}
        <div class="status-indicator-badge">
          <span class="status-dot {status?.adapters?.gameConnected ? 'dot-online' : 'dot-offline'}"></span>
          <span class="status-label">{status?.adapters?.gameConnected ? 'JUEGO CONECTADO' : 'EN ESPERA'}</span>
        </div>
      {/if}

      <button
        id="btn-switch-overlay"
        class="action-btn btn-obs"
        onclick={onSwitchToOverlay}
        title="Ver el overlay tal y como lo verá la audiencia"
      >
        📺 Ver el overlay
      </button>
    </div>
  </header>

  <main class="dashboard-main">
    {#if activeTab === 'monitor'}
      <MonitorTab
        {status}
        {rules}
        {liveEvents}
        {diagnostics}
        {isCheckingDiagnostics}
        onTogglePause={togglePause}
        onClearQueue={clearQueue}
        onRefresh={fetchStatus}
        onRunDiagnostics={runDiagnostics}
      />
    {/if}

    {#if activeTab === 'rules'}
      <RulesTab
        {rules}
        {filteredRules}
        bind:ruleFilterPlatform
        {testingRuleId}
        {openNewRule}
        {openEditRule}
        {toggleRule}
        {testRule}
        {deleteRule}
      />
    {/if}

    {#if activeTab === 'goals'}
      <GoalsTab {goals} {openNewGoal} {openEditGoal} {deleteGoal} {resetGoal} />
    {/if}

    {#if activeTab === 'history'}
      <HistoryTab {filteredHistory} bind:historySearch {status} {fetchHistory} />
    {/if}

    {#if activeTab === 'simulator'}
      <SimulatorTab {injectSynthetic} />
    {/if}

    {#if activeTab === 'overlay-studio'}
      <OverlayStudioTab
        bind:overlaySettings
        {copiedUrlType}
        {saveOverlaySettings}
        {copyToClipboard}
      />
    {/if}
  </main>

  {#if isEditingRule}
    <RuleEditorModal
      bind:editingRule
      bind:selectedPresetGiftId
      {commandPreview}
      {testingRuleId}
      {applyGiftPreset}
      {applyCommandPreset}
      {insertVariable}
      saveRule={() => void saveRule()}
      saveAndTestRule={() => void saveAndTestRule()}
      {testRule}
      closeEditor={() => (isEditingRule = false)}
    />
  {/if}

  {#if isEditingGoal}
    <GoalEditorModal
      bind:editingGoal
      bind:selectedGoalPresetId
      {goalCommandPreview}
      {applyGoalPreset}
      {insertGoalVariable}
      saveGoal={() => void saveGoal()}
      closeEditor={() => (isEditingGoal = false)}
    />
  {/if}
</div>
