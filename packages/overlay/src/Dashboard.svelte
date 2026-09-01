<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    TIKTOK_GIFTS,
    MINECRAFT_COMMAND_PRESETS,
    COMMUNITY_GOAL_PRESETS,
    type TikTokGiftPreset,
    type CommandPreset,
    type CommunityGoalPreset,
  } from './data/tiktok-gifts';
  import { SOUND_PRESETS, playSound, setMasterVolume, setMuted } from './utils/sound-engine';
  import {
    type OverlayCustomSettings,
    type OverlayLayout,
    type OverlayTheme,
    DEFAULT_OVERLAY_SETTINGS,
    THEME_PALETTES,
  } from './types/overlay-config';

  let { onSwitchToOverlay = () => {} } = $props<{ onSwitchToOverlay?: () => void }>();

  interface RuleDefinition {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    cooldownSeconds?: number;
    cooldownMs?: number;
    icon?: string;
    imageUrl?: string;
    matcher: {
      platforms?: string[];
      eventTypes?: string[];
      minValue?: number;
      maxValue?: number;
      metadataMatch?: Record<string, unknown>;
    };
    action: {
      actionType: string;
      command: string;
      payload?: Record<string, unknown>;
    };
    viewerFeedback?: {
      title?: string;
      description?: string;
      bannerColor?: string;
      soundEffect?: string;
    };
  }

  interface Goal {
    id: string;
    name: string;
    eventType: string;
    giftName?: string;
    currentValue: number;
    targetValue: number;
    unit: string;
    rewardDescription: string;
    actionCommand: string;
    actionType?: string;
    completed: boolean;
    repeatable?: boolean;
  }

  interface SystemStatus {
    status: string;
    uptime: number;
    isPaused: boolean;
    queue: {
      size: number;
      isEmpty: boolean;
    };
    adapters: {
      game: string;
      gameConnected: boolean;
      platforms: string[];
      clients: {
        total: number;
        overlay: number;
        mod: number;
      };
    };
    rulesCount: number;
    goalsCount: number;
  }

  interface HistoryEvent {
    id: string;
    eventId: string;
    platform: string;
    eventType: string;
    userName: string;
    actionCommand?: string;
    success: boolean;
    executionTimeMs?: number;
    createdAt: string;
  }

  // Active navigation tab
  let activeTab = $state<'monitor' | 'rules' | 'goals' | 'history' | 'simulator' | 'overlay-studio'>('rules');

  // State
  let status = $state<SystemStatus | null>(null);
  let rules = $state<RuleDefinition[]>([]);
  let goals = $state<Goal[]>([]);
  let historyEvents = $state<HistoryEvent[]>([]);
  let historySearch = $state('');
  let statusMessage = $state('');

  // Overlay Studio Settings State
  let overlaySettings = $state<OverlayCustomSettings>({ ...DEFAULT_OVERLAY_SETTINGS });
  let copiedUrlType = $state<string>('');

  // Rule Editor modal state
  let isEditingRule = $state(false);
  let editingRule = $state<RuleDefinition>(createEmptyRule());
  let ruleFilterPlatform = $state('all');
  let testingRuleId = $state('');
  let selectedPresetGiftId = $state('');

  // Goal Editor modal state
  let isEditingGoal = $state(false);
  let editingGoal = $state<Goal>(createEmptyGoal());
  let selectedGoalPresetId = $state('');

  // Live event logs from WebSocket
  let liveEvents = $state<Array<{ id: string; text: string; time: string; type: string }>>([]);

  let pollTimer: ReturnType<typeof setInterval>;
  let ws: WebSocket;

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
        platforms: ['tiktok', 'twitch', 'mock'],
        eventTypes: ['gift'],
        metadataMatch: { giftName: 'Rose' },
        minValue: 1,
      },
      action: {
        actionType: 'execute_command',
        command: 'summon chicken ~ ~1 ~ {CustomName:\'"${user.displayName}"\'}',
      },
      viewerFeedback: {
        title: '🎁 SPECIAL GIFT!',
        description: '${user.displayName} triggered an in-game action!',
        bannerColor: '#f43f5e',
      },
    };
  }

  function createEmptyGoal(): Goal {
    return {
      id: '',
      name: '🌹 50 Roses ➜ Summon Warden Boss',
      eventType: 'gift',
      giftName: 'Rose',
      currentValue: 0,
      targetValue: 50,
      unit: 'Roses',
      rewardDescription: 'Summon Warden Boss Battle',
      actionCommand: 'summon warden ~ ~ ~ {CustomName:\'"COMMUNITY BOSS: WARDEN"\'}',
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
    })
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
    })
  );

  let commandPreview = $derived(
    editingRule.action.command
      .replace(/\$\{user\.displayName\}/g, 'SuperFan99')
      .replace(/\$\{metadata\.giftName\}/g, editingRule.matcher.metadataMatch?.giftName || 'Rose')
      .replace(/\$\{event\.value\}/g, String(editingRule.matcher.minValue || 10))
  );

  let goalCommandPreview = $derived(
    editingGoal.actionCommand
      .replace(/\$\{goal\.name\}/g, editingGoal.name || 'Community Goal')
      .replace(/\$\{user\.displayName\}/g, 'TopDonor')
  );

  onMount(() => {
    void fetchStatus();
    void fetchRules();
    void fetchGoals();
    void fetchHistory();

    // Poll status every 2.5 seconds
    pollTimer = setInterval(() => {
      void fetchStatus();
      if (activeTab === 'history') void fetchHistory();
      if (activeTab === 'goals') void fetchGoals();
    }, 2500);

    // Connect WebSocket for live event feed
    connectWebSocket();
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
    if (ws) ws.close();
  });

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/?clientType=overlay`;

    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const time = new Date().toLocaleTimeString();
          if (msg.type === 'EVENT' || msg.type === 'CHAOS_EVENT') {
            const e = msg.payload;
            liveEvents = [
              {
                id: e.id,
                time,
                type: e.type,
                text: `[${e.platform?.toUpperCase() || 'LIVE'}] ${e.user?.displayName || 'Someone'} triggered ${e.type} (${e.metadata?.giftName || e.value})`,
              },
              ...liveEvents.slice(0, 49),
            ];
          } else if (msg.type === 'GAME_ACTION' || msg.type === 'ACTION_DISPATCHED') {
            const a = msg.payload;
            liveEvents = [
              {
                id: a.correlationId || a.id || String(Date.now()),
                time,
                type: 'action',
                text: `🎮 Executed: "${a.command}"`,
              },
              ...liveEvents.slice(0, 49),
            ];
          } else if (msg.type === 'GOAL_PROGRESS' || msg.type === 'INITIAL_GOALS') {
            void fetchGoals();
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        status = await res.json();
      }
    } catch {}
  }

  async function fetchRules() {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) {
        rules = await res.json();
      }
    } catch {}
  }

  async function fetchGoals() {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        goals = await res.json();
      }
    } catch {}
  }

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history?limit=30');
      if (res.ok) {
        const data = await res.json();
        historyEvents = data.events || [];
      }
    } catch {}
  }

  async function togglePause() {
    if (!status) return;
    const endpoint = status.isPaused ? '/api/queue/resume' : '/api/queue/pause';
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        status.isPaused = data.isPaused;
        flashStatus(status.isPaused ? '⏸️ Execution paused' : '▶️ Execution resumed');
      }
    } catch {
      flashStatus('Failed to toggle pause');
    }
  }

  async function clearQueue() {
    if (!confirm('Are you sure you want to clear all queued Minecraft actions?')) return;
    try {
      const res = await fetch('/api/queue/clear', { method: 'POST' });
      if (res.ok) {
        flashStatus('🧹 Action queue purged');
        void fetchStatus();
      }
    } catch {
      flashStatus('Failed to clear queue');
    }
  }

  async function toggleRule(rule: RuleDefinition) {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (res.ok) {
        rule.enabled = !rule.enabled;
        rules = [...rules];
        flashStatus(`Rule "${rule.name}" ${rule.enabled ? 'enabled' : 'disabled'}`);
      }
    } catch {
      flashStatus('Failed to update rule');
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
        title: '⚡ ACTION TRIGGERED!',
        description: '${user.displayName} caused chaos!',
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
    editingRule.name = `Gift: ${preset.name}`;
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
    try {
      const res = await fetch(`/api/rules/${rule.id}/test`, { method: 'POST' });
      if (res.ok) {
        flashStatus(`🚀 Test executed for "${rule.name}"!`);
      } else {
        flashStatus(`⚠️ Test failed: ${res.statusText}`);
      }
    } catch {
      flashStatus('Failed to run rule test');
    } finally {
      setTimeout(() => {
        if (testingRuleId === rule.id) testingRuleId = '';
      }, 1500);
    }
  }

  async function saveAndTestRule() {
    const saved = await saveRule();
    if (saved && saved.id) {
      await testRule(saved);
    }
  }

  async function saveRule(): Promise<RuleDefinition | null> {
    if (!editingRule.name.trim() || !editingRule.action.command.trim()) {
      alert('Please provide a rule name and Minecraft command');
      return null;
    }

    try {
      let res: Response;
      if (editingRule.id) {
        res = await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingRule),
        });
      } else {
        res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingRule),
        });
      }

      if (res.ok) {
        const data = await res.json();
        const savedRule: RuleDefinition = data.rule || editingRule;
        editingRule = savedRule;
        isEditingRule = false;
        await fetchRules();
        flashStatus('✅ Rule saved & hot-reloaded successfully!');
        return savedRule;
      } else {
        flashStatus('Failed to save rule: ' + res.statusText);
        return null;
      }
    } catch {
      flashStatus('Failed to save rule');
      return null;
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchRules();
        flashStatus('🗑️ Rule deleted');
      }
    } catch {
      flashStatus('Failed to delete rule');
    }
  }

  // --- Community Goals Functions ---

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
      alert('Please provide a goal name and Minecraft command');
      return null;
    }

    try {
      let res: Response;
      if (editingGoal.id) {
        res = await fetch(`/api/goals/${editingGoal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingGoal),
        });
      } else {
        res = await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingGoal),
        });
      }

      if (res.ok) {
        const data = await res.json();
        isEditingGoal = false;
        await fetchGoals();
        flashStatus('🎯 Goal saved successfully!');
        return data.goal;
      } else {
        flashStatus('Failed to save goal: ' + res.statusText);
        return null;
      }
    } catch {
      flashStatus('Failed to save goal');
      return null;
    }
  }

  async function deleteGoal(id: string) {
    if (!confirm('Are you sure you want to delete this community goal?')) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchGoals();
        flashStatus('🗑️ Goal deleted');
      }
    } catch {
      flashStatus('Failed to delete goal');
    }
  }

  async function resetGoal(id: string) {
    if (!confirm('Reset progress for this goal back to 0?')) return;
    try {
      const res = await fetch(`/api/goals/${id}/reset`, { method: 'POST' });
      if (res.ok) {
        await fetchGoals();
        flashStatus('🔄 Goal progress reset to 0');
      }
    } catch {
      flashStatus('Failed to reset goal');
    }
  }

  async function injectSynthetic(eventData: Record<string, unknown>) {
    try {
      const res = await fetch('/api/test/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventData),
      });
      if (res.ok) {
        flashStatus(`🚀 Injected ${eventData.type} event!`);
        void fetchStatus();
      }
    } catch {
      flashStatus('Failed to inject event');
    }
  }

  function flashStatus(msg: string) {
    statusMessage = msg;
    setTimeout(() => {
      if (statusMessage === msg) statusMessage = '';
    }, 3500);
  }

  async function fetchOverlaySettings() {
    try {
      const res = await fetch('/api/overlay-settings');
      if (res.ok) {
        const data = await res.json();
        overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS, ...data };
        setMasterVolume(overlaySettings.masterVolume);
        setMuted(!overlaySettings.soundEnabled);
      }
    } catch {}
  }

  async function saveOverlaySettings() {
    try {
      const res = await fetch('/api/overlay-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlaySettings),
      });
      if (res.ok) {
        setMasterVolume(overlaySettings.masterVolume);
        setMuted(!overlaySettings.soundEnabled);
        flashStatus('🎨 Overlay settings saved & synced live!');
      } else {
        flashStatus('Failed to save overlay settings');
      }
    } catch {
      flashStatus('Failed to save overlay settings');
    }
  }

  function copyToClipboard(text: string, type: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      copiedUrlType = type;
      flashStatus(`📋 Copied ${type} URL to clipboard!`);
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
  <!-- Top Navigation Header -->
  <header class="dashboard-header">
    <div class="header-left">
      <div class="brand">
        <span class="brand-icon">⚡</span>
        <div class="brand-text">
          <h1>CHAOS-LIVE</h1>
          <span class="subtext">STREAMER MANAGEMENT HUB</span>
        </div>
      </div>

      <nav class="nav-tabs">
        <button
          id="tab-monitor"
          class="nav-tab {activeTab === 'monitor' ? 'active' : ''}"
          onclick={() => (activeTab = 'monitor')}
        >
          📊 Monitor
        </button>
        <button
          id="tab-rules"
          class="nav-tab {activeTab === 'rules' ? 'active' : ''}"
          onclick={() => (activeTab = 'rules')}
        >
          ⚙️ Rules ({rules.length})
        </button>
        <button
          id="tab-goals"
          class="nav-tab {activeTab === 'goals' ? 'active' : ''}"
          onclick={() => (activeTab = 'goals')}
        >
          🎯 Goals ({goals.length})
        </button>
        <button
          id="tab-overlay-studio"
          class="nav-tab {activeTab === 'overlay-studio' ? 'active' : ''}"
          onclick={() => { activeTab = 'overlay-studio'; void fetchOverlaySettings(); }}
        >
          🎨 Overlay Studio
        </button>
        <button
          id="tab-history"
          class="nav-tab {activeTab === 'history' ? 'active' : ''}"
          onclick={() => (activeTab = 'history')}
        >
          📜 Audit Log
        </button>
        <button
          id="tab-simulator"
          class="nav-tab {activeTab === 'simulator' ? 'active' : ''}"
          onclick={() => (activeTab = 'simulator')}
        >
          🧪 Simulator
        </button>
      </nav>
    </div>

    <div class="header-right">
      {#if statusMessage}
        <span class="flash-pill">{statusMessage}</span>
      {/if}

      <div class="status-indicator-badge">
        <span class="status-dot {status?.adapters?.gameConnected ? 'dot-online' : 'dot-offline'}"></span>
        <span class="status-label">{status?.adapters?.gameConnected ? 'GAME CONNECTED' : 'STANDBY MODE'}</span>
      </div>

      <button id="btn-switch-overlay" class="action-btn btn-obs" onclick={onSwitchToOverlay} title="Open OBS Browser Source HUD">
        📺 Switch to OBS View
      </button>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="dashboard-main">
    <!-- TAB 1: MONITOR -->
    {#if activeTab === 'monitor'}
      <div class="monitor-grid">
        <div class="kpi-card glass-card">
          <span class="kpi-icon">🎮</span>
          <div class="kpi-info">
            <span class="kpi-label">Game Adapter</span>
            <span class="kpi-value">{status?.adapters?.game || 'Standby Mode'}</span>
            <span class="kpi-sub">{status?.adapters?.gameConnected ? '🟢 Active & Ready' : '🟡 Standby / Console Fallback'}</span>
          </div>
        </div>

        <div class="kpi-card glass-card">
          <span class="kpi-icon">📦</span>
          <div class="kpi-info">
            <span class="kpi-label">Action Queue</span>
            <span class="kpi-value">{status?.queue?.size || 0}</span>
            <span class="kpi-sub">{status?.isPaused ? '⏸️ Engine Paused' : '⚡ Pipeline Running'}</span>
          </div>
        </div>

        <div class="kpi-card glass-card">
          <span class="kpi-icon">🎯</span>
          <div class="kpi-info">
            <span class="kpi-label">Active Rules</span>
            <span class="kpi-value">{rules.filter((r) => r.enabled).length} / {rules.length}</span>
            <span class="kpi-sub">Priority engine active</span>
          </div>
        </div>

        <div class="kpi-card glass-card">
          <span class="kpi-icon">👥</span>
          <div class="kpi-info">
            <span class="kpi-label">Connected Clients</span>
            <span class="kpi-value">{status?.adapters?.clients?.total || 0}</span>
            <span class="kpi-sub">Overlay & Fabric Mod Hub</span>
          </div>
        </div>

        <!-- Emergency & Queue Controls -->
        <div class="control-panel-card glass-card full-width">
          <h3>🚨 Emergency Controls</h3>
          <div class="controls-row">
            <button
              class="action-btn {status?.isPaused ? 'btn-resume' : 'btn-pause'}"
              onclick={togglePause}
            >
              {status?.isPaused ? '▶️ Resume Processing' : '⏸️ Pause Pipeline'}
            </button>
            <button class="action-btn btn-danger" onclick={clearQueue}>
              🧹 Purge Queue
            </button>
            <button class="action-btn btn-secondary" onclick={fetchStatus}>
              🔄 Refresh Status
            </button>
          </div>
        </div>

        <!-- Live Event Stream Feed -->
        <div class="live-feed-card glass-card full-width">
          <h3>⚡ Live Stream Events & Executed Actions Feed</h3>
          <div class="feed-list">
            {#if liveEvents.length === 0}
              <div class="empty-feed">Waiting for stream events... (Send a test event in Simulator)</div>
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
    {/if}

    <!-- TAB 2: RULES (StreamToEarn Personalization) -->
    {#if activeTab === 'rules'}
      <div class="rules-view">
        <div class="rules-toolbar">
          <div class="toolbar-left">
            <button id="btn-add-rule" class="action-btn btn-primary" onclick={openNewRule}>
              ➕ Create New Rule
            </button>

            <div class="filter-group">
              <span>Platform:</span>
              <select bind:value={ruleFilterPlatform} class="styled-select">
                <option value="all">All Platforms</option>
                <option value="tiktok">TikTok</option>
                <option value="twitch">Twitch</option>
                <option value="mock">Mock / Simulator</option>
              </select>
            </div>
          </div>

          <span class="rules-counter">{filteredRules.length} active rules</span>
        </div>

        <div class="rules-grid">
          {#each filteredRules as rule (rule.id)}
            <div class="rule-card glass-card {rule.enabled ? '' : 'rule-disabled'}">
              <div class="rule-header">
                <div class="rule-title-area">
                  <button
                    class="toggle-btn {rule.enabled ? 'toggle-on' : 'toggle-off'}"
                    onclick={() => toggleRule(rule)}
                    title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    {rule.enabled ? 'ON' : 'OFF'}
                  </button>
                  <div class="rule-icon-box">
                    {#if rule.imageUrl}
                      <img src={rule.imageUrl} alt={rule.name} class="rule-custom-img" />
                    {:else}
                      <span class="rule-emoji">{rule.icon || '🎁'}</span>
                    {/if}
                  </div>
                  <div>
                    <h4 class="rule-name">{rule.name}</h4>
                    {#if rule.matcher.metadataMatch?.giftName}
                      <span class="gift-subtag">TikTok Gift: {rule.matcher.metadataMatch.giftName}</span>
                    {/if}
                  </div>
                </div>

                <div class="rule-badges">
                  <span class="badge badge-priority">P: {rule.priority}</span>
                  {#if rule.matcher.platforms}
                    {#each rule.matcher.platforms as p}
                      <span class="badge badge-platform">{p}</span>
                    {/each}
                  {:else}
                    <span class="badge badge-platform">all</span>
                  {/if}
                </div>
              </div>

              <div class="rule-criteria">
                <span class="criteria-label">Matches:</span>
                <span class="criteria-val">
                  {(rule.matcher.eventTypes || ['any']).join(', ')}
                  {#if rule.matcher.metadataMatch?.giftName}
                    ({rule.matcher.metadataMatch.giftName})
                  {/if}
                  {#if rule.matcher.minValue}
                    (≥ {rule.matcher.minValue} 💎)
                  {/if}
                </span>
              </div>

              <div class="rule-action">
                <span class="action-label">Minecraft Command:</span>
                <code class="cmd-code">{rule.action.command}</code>
              </div>

              <!-- Viewer Feedback Preview Pill -->
              {#if rule.viewerFeedback}
                <div class="viewer-feedback-preview" style="border-left-color: {rule.viewerFeedback.bannerColor || '#00f0ff'}">
                  <span class="feedback-label">👁️ Stream Overlay Alert:</span>
                  <div class="feedback-title" style="color: {rule.viewerFeedback.bannerColor || '#00f0ff'}">
                    {rule.viewerFeedback.title || 'In-Game Event'}
                  </div>
                  <div class="feedback-desc">{rule.viewerFeedback.description || ''}</div>
                </div>
              {/if}

              <div class="rule-footer">
                <span class="cooldown-tag">⏱️ Cooldown: {rule.cooldownSeconds || 0}s</span>
                <div class="card-actions">
                  <button
                    class="btn-sm btn-test {testingRuleId === rule.id ? 'btn-testing' : ''}"
                    onclick={() => testRule(rule)}
                    disabled={testingRuleId === rule.id}
                    title="Fire test event to run this in Minecraft and show on overlay"
                  >
                    {testingRuleId === rule.id ? '⏳ Testing...' : '🧪 Test Rule'}
                  </button>
                  <button class="btn-sm btn-edit" onclick={() => openEditRule(rule)}>Edit</button>
                  <button class="btn-sm btn-del" onclick={() => deleteRule(rule.id)}>Delete</button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- TAB 3: GOALS (Community Goals Personalization) -->
    {#if activeTab === 'goals'}
      <div class="goals-view">
        <div class="goals-header-bar">
          <div>
            <h2>🎯 Stream Community Goals</h2>
            <span class="desc">Goals track viewer collective contributions to trigger grand server events and boss battles.</span>
          </div>
          <button id="btn-add-goal" class="action-btn btn-primary" onclick={openNewGoal}>
            ➕ Create New Goal
          </button>
        </div>

        <div class="goals-grid">
          {#if goals.length === 0}
            <div class="empty-feed full-width">No active community goals. Click "➕ Create New Goal" to start one!</div>
          {:else}
            {#each goals as goal (goal.id)}
              <div class="goal-card glass-card {goal.completed ? 'goal-card-completed' : ''}">
                <div class="goal-top">
                  <div class="goal-info">
                    <h3 class="goal-name">{goal.name}</h3>
                    <span class="goal-reward">🏆 Reward: {goal.rewardDescription || 'Boss Event'}</span>
                  </div>
                  <div class="goal-percentage">
                    {Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100))}%
                  </div>
                </div>

                <div class="progress-track">
                  <div
                    class="progress-fill"
                    style="width: {Math.min(100, (goal.currentValue / goal.targetValue) * 100)}%"
                  ></div>
                </div>

                <div class="goal-command-pill">
                  <span class="cmd-label">Command:</span>
                  <code>{goal.actionCommand}</code>
                </div>

                <div class="goal-bottom">
                  <span class="goal-counter">
                    <strong>{goal.currentValue}</strong> / {goal.targetValue} {goal.unit || 'Points'}
                    {#if goal.repeatable}
                      <span class="repeat-tag" title="Auto-restarts when completed">🔄 Repeatable</span>
                    {/if}
                  </span>

                  <div class="card-actions">
                    <button class="btn-sm btn-reset" onclick={() => resetGoal(goal.id)} title="Reset progress back to 0">
                      🔄 Reset
                    </button>
                    <button class="btn-sm btn-edit" onclick={() => openEditGoal(goal)}>Edit</button>
                    <button class="btn-sm btn-del" onclick={() => deleteGoal(goal.id)}>Delete</button>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}

    <!-- TAB 4: AUDIT HISTORY -->
    {#if activeTab === 'history'}
      <div class="history-view glass-card">
        <div class="history-toolbar">
          <input
            type="text"
            placeholder="Search events by user, command, or type..."
            bind:value={historySearch}
            class="styled-input search-input"
          />
          <button class="action-btn btn-secondary" onclick={fetchHistory}>🔄 Refresh</button>
        </div>

        <div class="table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Platform</th>
                <th>User</th>
                <th>Event Type</th>
                <th>Executed Command</th>
                <th>Duration</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#if filteredHistory.length === 0}
                <tr>
                  <td colspan="7" class="empty-table">No matching events found in audit log.</td>
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
                        {h.success ? 'SUCCESS' : 'FAILED'}
                      </span>
                    </td>
                  </tr>
                {/each}
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}

    <!-- TAB 5: SIMULATOR -->
    {#if activeTab === 'simulator'}
      <div class="sim-view glass-card">
        <h2>🧪 Chaos Stream Simulator</h2>
        <p class="panel-desc">Test your Minecraft live interactions without needing an active live stream.</p>

        <div class="sim-grid">
          <div class="sim-card">
            <h4>Quick Presets</h4>
            <div class="sim-grid-buttons">
              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 1,
                    user: { id: 'u-1', displayName: 'ViewerOne' },
                    metadata: { giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
                  })}
              >
                🌹 Send 1x Rose
              </button>

              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 30,
                    user: { id: 'u-2', displayName: 'IceCreamFan' },
                    metadata: { giftName: 'Ice Cream Cone', diamondCount: 30, repeatCount: 1 },
                  })}
              >
                🍦 Send Ice Cream Cone
              </button>

              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 500,
                    user: { id: 'u-3', displayName: 'MoneyMaker' },
                    metadata: { giftName: 'Money Gun', diamondCount: 500, repeatCount: 1 },
                  })}
              >
                💸 Send Money Gun
              </button>

              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 1000,
                    user: { id: 'u-4', displayName: 'KingDonator' },
                    metadata: { giftName: 'Lion', diamondCount: 1000, repeatCount: 1 },
                  })}
              >
                🦁 Send Lion
              </button>

              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'like',
                    value: 150,
                    user: { id: 'u-5', displayName: 'TapperHero' },
                    metadata: { likeCount: 150 },
                  })}
              >
                ❤️ Send 150 Likes
              </button>

              <button
                class="sim-action-btn"
                onclick={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'follow',
                    value: 1,
                    user: { id: 'u-6', displayName: 'NewFollower123' },
                    metadata: {},
                  })}
              >
                ⭐ New Follower
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- TAB 6: OVERLAY STUDIO (StreamToEarn & TikTok Live Studio Customizer) -->
    {#if activeTab === 'overlay-studio'}
      <div class="studio-view glass-card">
        <div class="studio-header">
          <div>
            <h2>🎨 StreamToEarn Overlay Studio</h2>
            <p class="panel-desc">
              Fully personalize your on-screen HUD for <strong>OBS Studio</strong> and <strong>TikTok Live Studio</strong>.
            </p>
          </div>
          <div class="studio-header-actions">
            <button class="action-btn btn-secondary" onclick={() => window.open('/overlay', '_blank')}>
              📺 Open Overlay
            </button>
            <button class="action-btn btn-primary" onclick={saveOverlaySettings}>
              💾 Save & Sync Live
            </button>
          </div>
        </div>

        <!-- Section 1: One-Click OBS & TikTok Live Studio URLs -->
        <div class="studio-section">
          <h3 class="section-title">📋 1-Click Stream Source URLs</h3>
          <p class="section-subtitle">Copy and paste these URLs directly as a <em>Browser Source</em> in OBS or TikTok Live Studio:</p>

          <div class="url-cards-grid">
            <div class="url-card">
              <div class="url-card-header">
                <span class="url-type-badge landscape-badge">🖥️ OBS Studio (16:9 Landscape)</span>
                <span class="res-tag">1920 x 1080</span>
              </div>
              <div class="url-input-row">
                <input type="text" readonly value="http://localhost:8080/overlay" class="styled-input url-input" />
                <button
                  class="action-btn btn-copy {copiedUrlType === 'Landscape' ? 'btn-copied' : ''}"
                  onclick={() => copyToClipboard('http://localhost:8080/overlay', 'Landscape')}
                >
                  {copiedUrlType === 'Landscape' ? '✓ Copied!' : '📋 Copy URL'}
                </button>
              </div>
            </div>

            <div class="url-card">
              <div class="url-card-header">
                <span class="url-type-badge vertical-badge">📱 TikTok Live Studio (9:16 Portrait)</span>
                <span class="res-tag">1080 x 1920</span>
              </div>
              <div class="url-input-row">
                <input type="text" readonly value="http://localhost:8080/overlay?layout=vertical" class="styled-input url-input" />
                <button
                  class="action-btn btn-copy {copiedUrlType === 'Vertical' ? 'btn-copied' : ''}"
                  onclick={() => copyToClipboard('http://localhost:8080/overlay?layout=vertical', 'Vertical')}
                >
                  {copiedUrlType === 'Vertical' ? '✓ Copied!' : '📋 Copy URL'}
                </button>
              </div>
            </div>

            <div class="url-card">
              <div class="url-card-header">
                <span class="url-type-badge modular-badge">🎯 Goal Bar Only (Modular)</span>
                <span class="res-tag">Custom Box</span>
              </div>
              <div class="url-input-row">
                <input type="text" readonly value="http://localhost:8080/overlay?modular=goal" class="styled-input url-input" />
                <button
                  class="action-btn btn-copy {copiedUrlType === 'Goal' ? 'btn-copied' : ''}"
                  onclick={() => copyToClipboard('http://localhost:8080/overlay?modular=goal', 'Goal')}
                >
                  {copiedUrlType === 'Goal' ? '✓ Copied!' : '📋 Copy URL'}
                </button>
              </div>
            </div>

            <div class="url-card">
              <div class="url-card-header">
                <span class="url-type-badge modular-badge">⚡ Gift Marquee Ticker Only</span>
                <span class="res-tag">1920 x 80</span>
              </div>
              <div class="url-input-row">
                <input type="text" readonly value="http://localhost:8080/overlay?modular=ticker" class="styled-input url-input" />
                <button
                  class="action-btn btn-copy {copiedUrlType === 'Ticker' ? 'btn-copied' : ''}"
                  onclick={() => copyToClipboard('http://localhost:8080/overlay?modular=ticker', 'Ticker')}
                >
                  {copiedUrlType === 'Ticker' ? '✓ Copied!' : '📋 Copy URL'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="studio-settings-grid">
          <!-- Column 1: Layout & Themes -->
          <div class="studio-col glass-card">
            <h4>📐 Layout & Aesthetics</h4>

            <div class="form-row">
              <label for="studio-layout-select">Layout Orientation Preset</label>
              <select id="studio-layout-select" bind:value={overlaySettings.layout} class="styled-select">
                <option value="landscape">🖥️ 16:9 Landscape (OBS / Twitch / YouTube)</option>
                <option value="vertical">📱 9:16 Vertical Portrait (TikTok Live Studio)</option>
                <option value="compact">🧩 Compact Minimalist Corner</option>
              </select>
            </div>

            <div class="form-row">
              <label for="studio-theme-select">Visual Color Palette Theme</label>
              <select id="studio-theme-select" bind:value={overlaySettings.theme} class="styled-select">
                {#each Object.entries(THEME_PALETTES) as [id, theme]}
                  <option value={id}>{theme.name}</option>
                {/each}
              </select>
            </div>

            <div class="form-row">
              <label for="studio-scale-slider">
                Canvas UI Scale: <strong>{Math.round(overlaySettings.scale * 100)}%</strong>
              </label>
              <input
                id="studio-scale-slider"
                type="range"
                min="0.7"
                max="1.4"
                step="0.05"
                bind:value={overlaySettings.scale}
                class="styled-range"
              />
            </div>

            <div class="form-row">
              <label for="studio-glass-slider">
                Glassmorphism Intensity: <strong>{Math.round(overlaySettings.glassIntensity * 100)}%</strong>
              </label>
              <input
                id="studio-glass-slider"
                type="range"
                min="0.4"
                max="0.95"
                step="0.05"
                bind:value={overlaySettings.glassIntensity}
                class="styled-range"
              />
            </div>

            <div class="form-row">
              <label for="studio-glow-slider">
                Neon Glow Intensity: <strong>{Math.round(overlaySettings.glowIntensity * 100)}%</strong>
              </label>
              <input
                id="studio-glow-slider"
                type="range"
                min="0.2"
                max="1.0"
                step="0.1"
                bind:value={overlaySettings.glowIntensity}
                class="styled-range"
              />
            </div>
          </div>

          <!-- Column 2: Sound & Audio Effects Studio -->
          <div class="studio-col glass-card">
            <h4>🔊 Sound & Audio Effects Studio</h4>

            <div class="form-row checkbox-row">
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  bind:checked={overlaySettings.soundEnabled}
                  onchange={() => setMuted(!overlaySettings.soundEnabled)}
                />
                <span><strong>Enable Sound Effects</strong> (Plays when gifts & events occur)</span>
              </label>
            </div>

            <div class="form-row">
              <label for="studio-volume-slider">
                Master Audio Volume: <strong>{Math.round(overlaySettings.masterVolume * 100)}%</strong>
              </label>
              <input
                id="studio-volume-slider"
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                bind:value={overlaySettings.masterVolume}
                oninput={() => setMasterVolume(overlaySettings.masterVolume)}
                class="styled-range"
              />
            </div>

            <div class="sound-test-pad">
              <span class="pad-title">🎵 Sound Effect Test Pad (Click to Preview):</span>
              <div class="sound-buttons-grid">
                {#each SOUND_PRESETS as sound}
                  <button
                    type="button"
                    class="sound-preset-btn"
                    onclick={() => playSound(sound.id)}
                  >
                    <span class="sound-btn-icon">{sound.icon}</span>
                    <span class="sound-btn-name">{sound.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- Column 3: Widget Positions & Display -->
          <div class="studio-col glass-card">
            <h4>🧩 Widget Placement & HUD Display</h4>

            <div class="form-row">
              <label for="studio-rewards-mode">Gift Rewards HUD Display</label>
              <select id="studio-rewards-mode" bind:value={overlaySettings.rewardsMode} class="styled-select">
                <option value="both">🎁 Both Sidebar Board & Bottom Marquee</option>
                <option value="ticker">⚡ Bottom Marquee Ticker Only</option>
                <option value="menu">📋 Sidebar Rewards Board Only</option>
                <option value="off">🚫 Hide Rewards Menu</option>
              </select>
            </div>

            <div class="form-row">
              <label for="studio-goal-pos">Community Goal Progress Position</label>
              <select id="studio-goal-pos" bind:value={overlaySettings.goalPosition} class="styled-select">
                <option value="top">⬆️ Top Header Bar</option>
                <option value="bottom">⬇️ Bottom Marquee Area</option>
                <option value="hidden">🚫 Hidden</option>
              </select>
            </div>

            <div class="form-row">
              <label for="studio-feed-pos">Recent Interactions Feed Position</label>
              <select id="studio-feed-pos" bind:value={overlaySettings.feedPosition} class="styled-select">
                <option value="left">⬅️ Left Column</option>
                <option value="right">➡️ Right Column</option>
                <option value="hidden">🚫 Hidden</option>
              </select>
            </div>

            <div class="form-row">
              <label for="studio-leaderboard-pos">Top Supporters Leaderboard Position</label>
              <select id="studio-leaderboard-pos" bind:value={overlaySettings.leaderboardPosition} class="styled-select">
                <option value="right">➡️ Right Column</option>
                <option value="left">⬅️ Left Column</option>
                <option value="hidden">🚫 Hidden</option>
              </select>
            </div>

            <div class="form-row">
              <label for="studio-marquee-speed">
                Marquee Ticker Speed: <strong>{overlaySettings.marqueeSpeedSeconds}s</strong>
              </label>
              <input
                id="studio-marquee-speed"
                type="range"
                min="15"
                max="45"
                step="1"
                bind:value={overlaySettings.marqueeSpeedSeconds}
                class="styled-range"
              />
            </div>

            <div class="form-row">
              <label for="studio-banner-duration">
                Grand Alert Duration: <strong>{overlaySettings.bannerDurationSeconds}s</strong>
              </label>
              <input
                id="studio-banner-duration"
                type="range"
                min="3"
                max="10"
                step="0.5"
                bind:value={overlaySettings.bannerDurationSeconds}
                class="styled-range"
              />
            </div>
          </div>
        </div>

        <div class="studio-footer">
          <button class="action-btn btn-secondary" onclick={() => (overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS })}>
            🔄 Reset to Defaults
          </button>
          <button class="action-btn btn-primary btn-save-studio" onclick={saveOverlaySettings}>
            💾 Save & Broadcast to OBS Overlay
          </button>
        </div>
      </div>
    {/if}
  </main>

  <!-- RULE EDITOR MODAL (StreamToEarn Style) -->
  {#if isEditingRule}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => {
        if (e.target === e.currentTarget) isEditingRule = false;
      }}
      onkeydown={(e) => {
        if (e.key === 'Escape') isEditingRule = false;
      }}
    >
      <div class="modal-card glass-card modal-card-large">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon-badge">{editingRule.icon || '🎁'}</span>
            <div>
              <h3>{editingRule.id ? 'Customize Event Rule' : 'Create New Interactive Event'}</h3>
              <span class="modal-subtitle">StreamToEarn Personalization Engine</span>
            </div>
          </div>
          <button class="close-btn" onclick={() => (isEditingRule = false)}>✕</button>
        </div>

        <div class="modal-form-scrollable">
          <!-- Step 1: TikTok Gift & Trigger Presets Quick Picker -->
          <div class="preset-section">
            <div class="section-label">⚡ Quick TikTok Gift Presets (Click to Auto-Fill):</div>
            <div class="preset-pills-wrap">
              {#each TIKTOK_GIFTS as gift (gift.id)}
                <button
                  type="button"
                  class="gift-preset-pill {selectedPresetGiftId === gift.id ? 'preset-selected' : ''}"
                  onclick={() => applyGiftPreset(gift)}
                >
                  <span class="preset-emoji">{gift.icon}</span>
                  <span class="preset-name">{gift.name}</span>
                  <span class="preset-coins">{gift.coins} 💎</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="rule-name-input">Rule / Event Name</label>
              <input
                id="rule-name-input"
                type="text"
                bind:value={editingRule.name}
                placeholder="e.g. Gift: Rose -> Summon Chicken"
                class="styled-input"
              />
            </div>

            <div class="form-col">
              <label for="rule-giftname-input">Matching TikTok Gift Name</label>
              <input
                id="rule-giftname-input"
                type="text"
                value={editingRule.matcher.metadataMatch?.giftName || ''}
                oninput={(e) => {
                  if (!editingRule.matcher.metadataMatch) editingRule.matcher.metadataMatch = {};
                  editingRule.matcher.metadataMatch.giftName = (e.target as HTMLInputElement).value;
                }}
                placeholder="e.g. Rose, Ice Cream, Lion"
                class="styled-input"
              />
            </div>
          </div>

          <!-- Icon & Custom Image Personalization -->
          <div class="icon-customizer-box">
            <div class="form-col">
              <label for="rule-icon-input">Icon / Emoji Customization</label>
              <div class="emoji-selector-row">
                <input
                  id="rule-icon-input"
                  type="text"
                  bind:value={editingRule.icon}
                  placeholder="🌹"
                  class="styled-input emoji-input"
                  maxlength="4"
                />
                <div class="quick-emojis">
                  {#each ['🌹', '🍦', '🍩', '💖', '💸', '🦁', '⭐', '❤️', '💣', '⚡', '🏹', '💎'] as em}
                    <button
                      type="button"
                      class="quick-emoji-btn"
                      onclick={() => (editingRule.icon = em)}
                    >
                      {em}
                    </button>
                  {/each}
                </div>
              </div>
            </div>

            <div class="form-col">
              <label for="rule-imgurl-input">Custom Image / TikTok Sticker URL (Optional)</label>
              <div class="imgurl-input-wrap">
                <input
                  id="rule-imgurl-input"
                  type="url"
                  bind:value={editingRule.imageUrl}
                  placeholder="https://... or data:image/png;base64,..."
                  class="styled-input"
                />
                {#if editingRule.imageUrl}
                  <img src={editingRule.imageUrl} alt="Preview" class="input-preview-thumb" />
                {/if}
              </div>
            </div>
          </div>

          <!-- Command Presets Quick Bar -->
          <div class="preset-section">
            <div class="section-label">🎮 Minecraft Command Presets:</div>
            <div class="command-presets-wrap">
              {#each MINECRAFT_COMMAND_PRESETS as cmd (cmd.id)}
                <button
                  type="button"
                  class="cmd-preset-pill"
                  onclick={() => applyCommandPreset(cmd)}
                  title={cmd.command}
                >
                  {cmd.label}
                </button>
              {/each}
            </div>
          </div>

          <!-- Minecraft In-Game Command -->
          <div class="form-row">
            <label for="rule-command-input">Minecraft In-Game Command (RCON / Mod)</label>
            <input
              id="rule-command-input"
              type="text"
              bind:value={editingRule.action.command}
              placeholder="/summon zombie ~ ~ ~"
              class="styled-input"
            />
            <div class="token-helpers">
              <span>Quick Helpers:</span>
              <button
                type="button"
                class="token-pill"
                onclick={() => {
                  if (!editingRule.action.command.startsWith('execute at @p run')) {
                    editingRule.action.command = `execute at @p run ${editingRule.action.command}`.trim();
                  }
                }}
                title="Execute the command right at the player's current location"
              >
                📍 execute at @p run
              </button>
              <button type="button" class="token-pill" onclick={() => insertVariable('${user.displayName}')}>
                $&#123;user.displayName&#125;
              </button>
              <button type="button" class="token-pill" onclick={() => insertVariable('${metadata.giftName}')}>
                $&#123;metadata.giftName&#125;
              </button>
              <button type="button" class="token-pill" onclick={() => insertVariable('${event.value}')}>
                $&#123;event.value&#125;
              </button>
            </div>
          </div>

          <!-- StreamToEarn Viewer Feedback Section -->
          <div class="viewer-feedback-section">
            <div class="section-header-row">
              <span class="section-title">👁️ Viewer On-Screen Feedback (Stream HUD Alert)</span>
              <span class="section-hint">Personalize what the stream audience sees on screen</span>
            </div>

            <div class="form-columns">
              <div class="form-col">
                <label for="feedback-title-input">Banner Headline / Title</label>
                <input
                  id="feedback-title-input"
                  type="text"
                  bind:value={editingRule.viewerFeedback.title}
                  placeholder="e.g. 🦁 MEGA LION SUMMON!"
                  class="styled-input"
                />
              </div>

              <div class="form-col">
                <label for="feedback-color-input">Banner Accent Color</label>
                <div class="color-picker-row">
                  <input
                    id="feedback-color-input"
                    type="color"
                    bind:value={editingRule.viewerFeedback.bannerColor}
                    class="styled-color-picker"
                  />
                  <div class="quick-colors">
                    {#each ['#f43f5e', '#06b6d4', '#10b981', '#f59e0b', '#a855f7', '#ec4899'] as color}
                      <button
                        type="button"
                        class="color-dot"
                        aria-label="Select accent color {color}"
                        style="background-color: {color};"
                        onclick={() => {
                          if (editingRule.viewerFeedback) editingRule.viewerFeedback.bannerColor = color;
                        }}
                      ></button>
                    {/each}
                  </div>
                </div>
              </div>
            </div>

            <div class="form-row">
              <label for="feedback-desc-input">Action Description for Viewers</label>
              <input
                id="feedback-desc-input"
                type="text"
                bind:value={editingRule.viewerFeedback.description}
                placeholder="e.g. SuperFan99 summoned a Charged Creeper on stream!"
                class="styled-input"
              />
            </div>

            <!-- Custom Sound Effect Picker -->
            <div class="form-row">
              <label for="rule-sound-select">🔊 Event Sound Effect (Plays on OBS & TikTok Live Studio)</label>
              <div class="sound-selector-row">
                <select
                  id="rule-sound-select"
                  bind:value={editingRule.viewerFeedback.soundEffect}
                  class="styled-select sound-dropdown"
                >
                  <option value="">-- Default / Silent --</option>
                  {#each SOUND_PRESETS as sound}
                    <option value={sound.id}>{sound.name} ({sound.description})</option>
                  {/each}
                </select>
                <button
                  type="button"
                  class="action-btn btn-sound-test"
                  onclick={() => playSound(editingRule.viewerFeedback.soundEffect || 'chime-diamond')}
                  title="Test Sound Effect"
                >
                  🔊 Test Sound
                </button>
              </div>
            </div>

            <!-- Live Viewer Alert Preview Box -->
            <div class="alert-preview-card" style="--preview-accent: {editingRule.viewerFeedback.bannerColor || '#00f0ff'}">
              <div class="preview-card-icon">
                {#if editingRule.imageUrl}
                  <img src={editingRule.imageUrl} alt="Icon" class="preview-img-thumb" />
                {:else}
                  <span>{editingRule.icon || '🎁'}</span>
                {/if}
              </div>
              <div class="preview-card-text">
                <div class="preview-card-title">{editingRule.viewerFeedback.title || 'SPECIAL EVENT'}</div>
                <div class="preview-card-desc">
                  {(editingRule.viewerFeedback.description || '${user.displayName} sent a gift!')
                    .replace(/\$\{user\.displayName\}/g, 'SuperFan99')
                    .replace(/\$\{metadata\.giftName\}/g, editingRule.matcher.metadataMatch?.giftName || 'Rose')
                    .replace(/\$\{event\.value\}/g, String(editingRule.matcher.minValue || 10))}
                </div>
              </div>
              <span class="preview-tag">VIEWER HUD PREVIEW</span>
            </div>
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="rule-priority-input">Priority (Higher executes first)</label>
              <input id="rule-priority-input" type="number" bind:value={editingRule.priority} class="styled-input" />
            </div>
            <div class="form-col">
              <label for="rule-cooldown-input">Cooldown (Seconds)</label>
              <input id="rule-cooldown-input" type="number" bind:value={editingRule.cooldownSeconds} class="styled-input" />
            </div>
          </div>

          <div class="preview-box">
            <span class="preview-label">Live Command Preview:</span>
            <code class="preview-code">{commandPreview}</code>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="action-btn btn-secondary" onclick={() => (isEditingRule = false)}>Cancel</button>
          {#if editingRule.id}
            <button
              type="button"
              class="action-btn btn-test {testingRuleId === editingRule.id ? 'btn-testing' : ''}"
              onclick={() => testRule(editingRule)}
              disabled={testingRuleId === editingRule.id}
            >
              {testingRuleId === editingRule.id ? '⏳ Testing...' : '🧪 Test Live'}
            </button>
          {/if}
          <button type="button" class="action-btn btn-primary" onclick={saveAndTestRule}>
            💾 Save & Test Rule
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- GOAL EDITOR MODAL (Community Goals Personalization) -->
  {#if isEditingGoal}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => {
        if (e.target === e.currentTarget) isEditingGoal = false;
      }}
      onkeydown={(e) => {
        if (e.key === 'Escape') isEditingGoal = false;
      }}
    >
      <div class="modal-card glass-card modal-card-large">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <span class="modal-icon-badge">🎯</span>
            <div>
              <h3>{editingGoal.id ? 'Edit Community Goal' : 'Create New Community Goal'}</h3>
              <span class="modal-subtitle">Collective Viewers Milestones & Boss Events</span>
            </div>
          </div>
          <button class="close-btn" onclick={() => (isEditingGoal = false)}>✕</button>
        </div>

        <div class="modal-form-scrollable">
          <!-- Step 1: Goal Presets Quick Bar -->
          <div class="preset-section">
            <div class="section-label">⚡ Quick Community Goal Presets (Click to Auto-Fill):</div>
            <div class="preset-pills-wrap">
              {#each COMMUNITY_GOAL_PRESETS as preset (preset.id)}
                <button
                  type="button"
                  class="gift-preset-pill {selectedGoalPresetId === preset.id ? 'preset-selected' : ''}"
                  onclick={() => applyGoalPreset(preset)}
                >
                  <span class="preset-emoji">{preset.icon}</span>
                  <span class="preset-name">{preset.name}</span>
                  <span class="preset-coins">{preset.targetValue} {preset.unit}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="goal-name-input">Goal Headline / Title</label>
              <input
                id="goal-name-input"
                type="text"
                bind:value={editingGoal.name}
                placeholder="e.g. 🌹 50 Roses ➜ Summon Warden Boss"
                class="styled-input"
              />
            </div>

            <div class="form-col">
              <label for="goal-reward-input">Reward Summary for Viewers</label>
              <input
                id="goal-reward-input"
                type="text"
                bind:value={editingGoal.rewardDescription}
                placeholder="e.g. Summon Warden Boss Battle"
                class="styled-input"
              />
            </div>
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="goal-eventtype-select">Contribution Event Type</label>
              <select id="goal-eventtype-select" bind:value={editingGoal.eventType} class="styled-select">
                <option value="gift">Gifts (e.g. Roses, Ice Creams, Diamonds)</option>
                <option value="like">Likes</option>
                <option value="follow">Follows</option>
                <option value="comment">Comments</option>
              </select>
            </div>

            {#if editingGoal.eventType === 'gift'}
              <div class="form-col">
                <label for="goal-giftname-input">Specific TikTok Gift (Optional)</label>
                <input
                  id="goal-giftname-input"
                  type="text"
                  bind:value={editingGoal.giftName}
                  placeholder="e.g. Rose, Ice Cream, Lion (leave blank for any gift)"
                  class="styled-input"
                />
              </div>
            {/if}
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label for="goal-target-input">Target Value (Goal Threshold)</label>
              <input id="goal-target-input" type="number" min="1" bind:value={editingGoal.targetValue} class="styled-input" />
            </div>

            <div class="form-col">
              <label for="goal-current-input">Current Progress</label>
              <input id="goal-current-input" type="number" min="0" bind:value={editingGoal.currentValue} class="styled-input" />
            </div>

            <div class="form-col">
              <label for="goal-unit-input">Unit Label</label>
              <input id="goal-unit-input" type="text" bind:value={editingGoal.unit} placeholder="Roses, Likes, Points" class="styled-input" />
            </div>
          </div>

          <!-- Goal Minecraft Command -->
          <div class="form-row">
            <label for="goal-command-input">Reward Minecraft Command (Triggered upon completion)</label>
            <input
              id="goal-command-input"
              type="text"
              bind:value={editingGoal.actionCommand}
              placeholder="summon warden ~ ~ ~"
              class="styled-input"
            />
            <div class="token-helpers">
              <span>Quick Helpers:</span>
              <button
                type="button"
                class="token-pill"
                onclick={() => {
                  if (!editingGoal.actionCommand.startsWith('execute at @p run')) {
                    editingGoal.actionCommand = `execute at @p run ${editingGoal.actionCommand}`.trim();
                  }
                }}
                title="Execute the command right at the player's current location"
              >
                📍 execute at @p run
              </button>
              <button type="button" class="token-pill" onclick={() => insertGoalVariable('${goal.name}')}>
                $&#123;goal.name&#125;
              </button>
              <button type="button" class="token-pill" onclick={() => insertGoalVariable('${user.displayName}')}>
                $&#123;user.displayName&#125;
              </button>
            </div>
          </div>

          <div class="form-row checkbox-row">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={editingGoal.repeatable} />
              <span><strong>Repeatable Goal:</strong> Automatically reset progress back to 0 so the community can trigger it repeatedly</span>
            </label>
          </div>

          <!-- Live Goal Progress Preview Box -->
          <div class="goal-preview-card">
            <div class="goal-top">
              <div class="goal-info">
                <h4 class="goal-name">{editingGoal.name || 'Community Goal'}</h4>
                <span class="goal-reward">🏆 Reward: {editingGoal.rewardDescription || 'Boss Event'}</span>
              </div>
              <div class="goal-percentage">
                {Math.min(100, Math.round(((editingGoal.currentValue || 0) / (editingGoal.targetValue || 1)) * 100))}%
              </div>
            </div>
            <div class="progress-track">
              <div
                class="progress-fill"
                style="width: {Math.min(100, ((editingGoal.currentValue || 0) / (editingGoal.targetValue || 1)) * 100)}%"
              ></div>
            </div>
            <div class="goal-bottom">
              <span class="goal-counter">
                <strong>{editingGoal.currentValue || 0}</strong> / {editingGoal.targetValue || 50} {editingGoal.unit || 'Points'}
              </span>
              <span class="preview-tag">GOAL HUD PREVIEW</span>
            </div>
          </div>

          <div class="preview-box">
            <span class="preview-label">Live Reward Command:</span>
            <code class="preview-code">{goalCommandPreview}</code>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="action-btn btn-secondary" onclick={() => (isEditingGoal = false)}>Cancel</button>
          <button type="button" class="action-btn btn-primary" onclick={saveGoal}>
            💾 Save Goal
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background: #090b10;
    color: #e2e8f0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  .dashboard-root {
    min-height: 100vh;
    height: auto;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 10% 20%, rgba(0, 240, 255, 0.05) 0%, transparent 40%),
      radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 40%),
      #090b10;
  }

  /* Header */
  .dashboard-header {
    height: 70px;
    background: rgba(13, 17, 23, 0.85);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-icon {
    font-size: 2rem;
    color: #00f0ff;
    text-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
  }

  .brand-text h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: 1px;
    background: linear-gradient(90deg, #00f0ff, #a855f7);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtext {
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    color: #64748b;
    font-weight: 700;
  }

  .nav-tabs {
    display: flex;
    gap: 8px;
  }

  .nav-tab {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .nav-tab:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-tab.active {
    color: #00f0ff;
    background: rgba(0, 240, 255, 0.1);
    border: 1px solid rgba(0, 240, 255, 0.3);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .flash-pill {
    background: rgba(0, 240, 255, 0.2);
    color: #00f0ff;
    border: 1px solid #00f0ff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    animation: fadeIn 0.3s ease;
  }

  .status-indicator-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.4);
    padding: 6px 12px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot-online {
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }

  .dot-offline {
    background: #eab308;
    box-shadow: 0 0 8px #eab308;
  }

  .status-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #cbd5e1;
    letter-spacing: 0.5px;
  }

  .btn-obs {
    background: linear-gradient(135deg, #00f0ff, #a855f7);
    color: #000;
    font-weight: 700;
  }

  /* Main container */
  .dashboard-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .glass-card {
    background: rgba(18, 24, 38, 0.6);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 20px;
  }

  /* Monitor KPIs */
  .monitor-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }

  .full-width {
    grid-column: 1 / -1;
  }

  .kpi-card {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .kpi-icon {
    font-size: 2.2rem;
    background: rgba(255, 255, 255, 0.05);
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  }

  .kpi-info {
    display: flex;
    flex-direction: column;
  }

  .kpi-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .kpi-value {
    font-size: 1.4rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .kpi-sub {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  /* Controls */
  .controls-row {
    display: flex;
    gap: 12px;
    margin-top: 12px;
  }

  .action-btn {
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.9rem;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: linear-gradient(135deg, #00f0ff, #0284c7);
    color: #000;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-danger {
    background: rgba(244, 63, 94, 0.2);
    color: #f43f5e;
    border: 1px solid rgba(244, 63, 94, 0.4);
  }

  .btn-danger:hover {
    background: rgba(244, 63, 94, 0.3);
  }

  .btn-pause {
    background: rgba(234, 179, 8, 0.2);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.4);
  }

  .btn-resume {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.4);
  }

  /* Live Feed */
  .feed-list {
    margin-top: 12px;
    max-height: 250px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-feed {
    padding: 24px;
    text-align: center;
    color: #64748b;
    font-style: italic;
  }

  .feed-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.85rem;
    background: rgba(0, 0, 0, 0.2);
    border-left: 3px solid #64748b;
  }

  .feed-gift {
    border-left-color: #f43f5e;
  }

  .feed-like {
    border-left-color: #eab308;
  }

  .feed-follow {
    border-left-color: #10b981;
  }

  .feed-action {
    border-left-color: #00f0ff;
    background: rgba(0, 240, 255, 0.05);
  }

  .feed-time {
    font-size: 0.75rem;
    color: #64748b;
    font-family: monospace;
  }

  /* Rules Toolbar */
  .rules-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .styled-select {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.85rem;
    outline: none;
  }

  .rules-counter {
    font-size: 0.85rem;
    color: #64748b;
    font-weight: 600;
  }

  /* Rules Grid */
  .rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 16px;
  }

  .rule-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: transform 0.2s ease, border-color 0.2s ease;
  }

  .rule-card:hover {
    border-color: rgba(0, 240, 255, 0.3);
    transform: translateY(-2px);
  }

  .rule-disabled {
    opacity: 0.55;
    filter: grayscale(0.6);
  }

  .rule-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .rule-title-area {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .toggle-btn {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 800;
    border: none;
    cursor: pointer;
  }

  .toggle-on {
    background: #10b981;
    color: #000;
  }

  .toggle-off {
    background: #475569;
    color: #cbd5e1;
  }

  .rule-icon-box {
    width: 42px;
    height: 42px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .rule-emoji {
    font-size: 1.5rem;
  }

  .rule-custom-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    border-radius: 6px;
  }

  .rule-name {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .gift-subtag {
    font-size: 0.72rem;
    color: #f43f5e;
    font-weight: 700;
    display: block;
  }

  .rule-badges {
    display: flex;
    gap: 6px;
  }

  .badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  .badge-priority {
    background: rgba(0, 240, 255, 0.15);
    color: #00f0ff;
    border: 1px solid rgba(0, 240, 255, 0.3);
  }

  .badge-platform {
    background: rgba(168, 85, 247, 0.15);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .rule-criteria {
    font-size: 0.8rem;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.2);
    padding: 6px 10px;
    border-radius: 6px;
  }

  .criteria-label {
    font-weight: 700;
    color: #64748b;
    margin-right: 4px;
  }

  .criteria-val {
    color: #e2e8f0;
  }

  .rule-action {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .action-label {
    font-size: 0.72rem;
    color: #64748b;
    font-weight: 700;
    text-transform: uppercase;
  }

  .cmd-code {
    background: #0d1117;
    padding: 8px 12px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', Consolas, monospace;
    font-size: 0.85rem;
    color: #38bdf8;
    border: 1px solid rgba(255, 255, 255, 0.05);
    word-break: break-all;
  }

  /* Viewer Feedback Box in Card */
  .viewer-feedback-preview {
    background: rgba(0, 0, 0, 0.3);
    border-left: 3px solid #00f0ff;
    padding: 8px 12px;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .feedback-label {
    font-size: 0.68rem;
    text-transform: uppercase;
    font-weight: 700;
    color: #64748b;
  }

  .feedback-title {
    font-weight: 800;
    font-size: 0.85rem;
    letter-spacing: 0.5px;
  }

  .feedback-desc {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .rule-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .cooldown-tag {
    font-size: 0.75rem;
    color: #64748b;
  }

  .card-actions {
    display: flex;
    gap: 6px;
  }

  .btn-sm {
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-test {
    background: rgba(0, 240, 255, 0.15);
    color: #00f0ff;
    border: 1px solid rgba(0, 240, 255, 0.3);
  }

  .btn-test:hover {
    background: rgba(0, 240, 255, 0.3);
  }

  .btn-testing {
    background: #eab308 !important;
    color: #000 !important;
  }

  .btn-edit {
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
  }

  .btn-edit:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .btn-del {
    background: rgba(244, 63, 94, 0.15);
    color: #f43f5e;
  }

  .btn-del:hover {
    background: rgba(244, 63, 94, 0.25);
  }

  .btn-reset {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }

  .btn-reset:hover {
    background: rgba(234, 179, 8, 0.25);
  }

  /* Goals View */
  .goals-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .goals-header-bar h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 800;
  }

  .desc {
    color: #64748b;
    font-size: 0.85rem;
  }

  .goals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 16px;
  }

  .goal-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .goal-card-completed {
    border-color: rgba(16, 185, 129, 0.5);
    box-shadow: 0 0 20px rgba(16, 185, 129, 0.1);
  }

  .goal-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }

  .goal-name {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .goal-reward {
    font-size: 0.8rem;
    color: #f59e0b;
    font-weight: 600;
  }

  .goal-percentage {
    font-size: 1.5rem;
    font-weight: 800;
    color: #00f0ff;
  }

  .progress-track {
    height: 12px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00f0ff, #a855f7);
    border-radius: 6px;
    transition: width 0.4s ease;
  }

  .goal-command-pill {
    background: #0d1117;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .cmd-label {
    color: #64748b;
    font-weight: 700;
  }

  .goal-command-pill code {
    color: #38bdf8;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .goal-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .goal-counter {
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .repeat-tag {
    font-size: 0.7rem;
    color: #a855f7;
    background: rgba(168, 85, 247, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    margin-left: 6px;
  }

  /* Modals */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-card {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    width: 100%;
    max-width: 820px;
    display: flex;
    flex-direction: column;
    max-height: 90vh;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .modal-title-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .modal-icon-badge {
    font-size: 1.8rem;
    width: 48px;
    height: 48px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .modal-title-wrap h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .modal-subtitle {
    font-size: 0.75rem;
    color: #00f0ff;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 6px;
    border-radius: 8px;
  }

  .close-btn:hover {
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.05);
  }

  .modal-form-scrollable {
    padding: 20px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Preset Pills */
  .preset-section {
    background: rgba(0, 0, 0, 0.25);
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .section-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .preset-pills-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .gift-preset-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .gift-preset-pill:hover {
    background: rgba(0, 240, 255, 0.15);
    border-color: #00f0ff;
    color: #fff;
  }

  .preset-selected {
    background: rgba(0, 240, 255, 0.25) !important;
    border-color: #00f0ff !important;
    color: #00f0ff !important;
    font-weight: 700;
  }

  .preset-emoji {
    font-size: 1.1rem;
  }

  .preset-coins {
    color: #f59e0b;
    font-weight: 700;
    font-size: 0.72rem;
  }

  .form-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .form-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 0.78rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .styled-input {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.9rem;
    outline: none;
    box-sizing: border-box;
    width: 100%;
  }

  .styled-input:focus {
    border-color: #00f0ff;
    box-shadow: 0 0 0 2px rgba(0, 240, 255, 0.2);
  }

  /* Emoji customizer */
  .icon-customizer-box {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    background: rgba(0, 0, 0, 0.25);
    padding: 14px;
    border-radius: 12px;
  }

  .emoji-selector-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .emoji-input {
    width: 60px !important;
    text-align: center;
    font-size: 1.3rem;
  }

  .quick-emojis {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .quick-emoji-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 1.1rem;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
  }

  .quick-emoji-btn:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .imgurl-input-wrap {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .input-preview-thumb {
    width: 38px;
    height: 38px;
    border-radius: 6px;
    object-fit: contain;
    background: #000;
  }

  /* Command presets */
  .command-presets-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .cmd-preset-pill {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
  }

  .cmd-preset-pill:hover {
    background: rgba(0, 240, 255, 0.15);
    color: #00f0ff;
    border-color: #00f0ff;
  }

  .token-helpers {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: #64748b;
    margin-top: 2px;
  }

  .token-pill {
    background: rgba(255, 255, 255, 0.05);
    border: 1px dashed rgba(255, 255, 255, 0.2);
    color: #38bdf8;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .token-pill:hover {
    background: rgba(56, 189, 248, 0.15);
  }

  /* Viewer Feedback Box in Modal */
  .viewer-feedback-section {
    background: rgba(0, 240, 255, 0.03);
    border: 1px solid rgba(0, 240, 255, 0.2);
    padding: 16px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    font-weight: 800;
    font-size: 0.85rem;
    color: #00f0ff;
    letter-spacing: 0.5px;
  }

  .section-hint {
    font-size: 0.72rem;
    color: #64748b;
  }

  .color-picker-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .styled-color-picker {
    width: 44px;
    height: 38px;
    padding: 2px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: transparent;
    cursor: pointer;
  }

  .quick-colors {
    display: flex;
    gap: 6px;
  }

  .color-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .color-dot:hover {
    transform: scale(1.2);
  }

  /* Alert Live Preview */
  .alert-preview-card {
    background: rgba(13, 17, 23, 0.9);
    border-left: 4px solid var(--preview-accent, #00f0ff);
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    position: relative;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .preview-card-icon {
    font-size: 2rem;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-img-thumb {
    width: 40px;
    height: 40px;
    object-fit: contain;
  }

  .preview-card-title {
    font-weight: 800;
    font-size: 0.95rem;
    color: var(--preview-accent, #00f0ff);
    letter-spacing: 0.5px;
  }

  .preview-card-desc {
    font-size: 0.8rem;
    color: #e2e8f0;
  }

  .preview-tag {
    position: absolute;
    right: 12px;
    top: 10px;
    font-size: 0.65rem;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 1px;
  }

  /* Goal Preview Card */
  .goal-preview-card {
    background: rgba(13, 17, 23, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
  }

  .checkbox-row {
    flex-direction: row;
    align-items: center;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .preview-box {
    background: #090b10;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preview-label {
    font-size: 0.7rem;
    color: #64748b;
    font-weight: 700;
    text-transform: uppercase;
  }

  .preview-code {
    font-family: monospace;
    font-size: 0.85rem;
    color: #00f0ff;
    word-break: break-all;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* Table */
  .table-wrap {
    overflow-x: auto;
    margin-top: 16px;
  }

  .history-toolbar {
    display: flex;
    gap: 12px;
  }

  .search-input {
    max-width: 400px;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .history-table th {
    text-align: left;
    padding: 10px 14px;
    color: #64748b;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.72rem;
  }

  .history-table td {
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .status-tag {
    font-size: 0.7rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
  }

  .tag-success {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }

  .tag-fail {
    background: rgba(244, 63, 94, 0.2);
    color: #f43f5e;
  }

  /* Simulator */
  .sim-grid-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .sim-action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f8fafc;
    padding: 12px 16px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .sim-action-btn:hover {
    background: rgba(0, 240, 255, 0.15);
    border-color: #00f0ff;
    transform: translateY(-2px);
  }

  /* Sound Selector in Modals */
  .sound-selector-row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .sound-dropdown {
    flex: 1;
  }

  .btn-sound-test {
    background: rgba(168, 85, 247, 0.2);
    border: 1px solid rgba(168, 85, 247, 0.4);
    color: #c084fc;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-sound-test:hover {
    background: #a855f7;
    color: #ffffff;
  }

  /* Overlay Studio View */
  .studio-view {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
  }

  .studio-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 16px;
  }

  .studio-header-actions {
    display: flex;
    gap: 12px;
  }

  .studio-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-title {
    font-size: 1.1rem;
    font-weight: 800;
    color: #f8fafc;
    margin: 0;
  }

  .section-subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
    margin: 0;
  }

  .url-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 16px;
  }

  .url-card {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .url-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .url-type-badge {
    font-size: 0.82rem;
    font-weight: 800;
  }

  .landscape-badge {
    color: #00f0ff;
  }

  .vertical-badge {
    color: #fe2c55;
  }

  .modular-badge {
    color: #10b981;
  }

  .res-tag {
    font-size: 0.72rem;
    font-family: monospace;
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 6px;
    border-radius: 4px;
    color: #94a3b8;
  }

  .url-input-row {
    display: flex;
    gap: 8px;
  }

  .url-input {
    flex: 1;
    font-family: monospace;
    font-size: 0.78rem;
    background: rgba(0, 0, 0, 0.6);
    color: #38bdf8;
  }

  .btn-copy {
    background: rgba(0, 240, 255, 0.15);
    border: 1px solid rgba(0, 240, 255, 0.3);
    color: #00f0ff;
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .btn-copy:hover {
    background: #00f0ff;
    color: #000;
  }

  .btn-copied {
    background: #10b981 !important;
    border-color: #10b981 !important;
    color: #ffffff !important;
  }

  .studio-settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 20px;
  }

  .studio-col {
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .studio-col h4 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 800;
    color: #00f0ff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }

  .styled-range {
    width: 100%;
    accent-color: #00f0ff;
    cursor: pointer;
  }

  .sound-test-pad {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }

  .pad-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: #94a3b8;
  }

  .sound-buttons-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .sound-preset-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
  }

  .sound-preset-btn:hover {
    background: rgba(168, 85, 247, 0.2);
    border-color: #a855f7;
    color: #ffffff;
    transform: scale(1.02);
  }

  .sound-btn-icon {
    font-size: 0.9rem;
  }

  .sound-btn-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .studio-footer {
    display: flex;
    justify-content: flex-end;
    gap: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 16px;
  }

  .btn-save-studio {
    padding: 10px 24px;
    font-size: 0.95rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
