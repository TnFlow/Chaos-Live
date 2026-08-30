<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let onSwitchToOverlay: () => void = () => {};

  interface RuleDefinition {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    cooldownSeconds?: number;
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
  }

  interface Goal {
    id: string;
    name: string;
    currentValue: number;
    targetValue: number;
    unit: string;
    completed: boolean;
    rewardDescription?: string;
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
  let activeTab: 'monitor' | 'rules' | 'goals' | 'history' | 'simulator' = 'monitor';

  // State
  let status: SystemStatus | null = null;
  let rules: RuleDefinition[] = [];
  let goals: Goal[] = [];
  let historyEvents: HistoryEvent[] = [];
  let historySearch = '';
  let isLoading = false;
  let statusMessage = '';

  // Rule Editor modal state
  let isEditingRule = false;
  let editingRule: RuleDefinition = createEmptyRule();
  let ruleFilterPlatform = 'all';

  // Live event logs from WebSocket
  let liveEvents: Array<{ id: string; text: string; time: string; type: string }> = [];

  let pollTimer: ReturnType<typeof setInterval>;
  let ws: WebSocket;

  function createEmptyRule(): RuleDefinition {
    return {
      id: '',
      name: '',
      enabled: true,
      priority: 10,
      cooldownSeconds: 0,
      matcher: {
        platforms: ['tiktok', 'twitch'],
        eventTypes: ['gift'],
        metadataMatch: {},
      },
      action: {
        actionType: 'execute_command',
        command: 'say Hello from ${user.displayName}!',
      },
    };
  }

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
          if (msg.type === 'EVENT') {
            const e = msg.payload;
            liveEvents = [
              {
                id: e.id,
                time,
                type: e.type,
                text: `[${e.platform.toUpperCase()}] ${e.user?.displayName || 'Someone'} triggered ${e.type} (${e.metadata?.giftName || e.value})`,
              },
              ...liveEvents.slice(0, 49),
            ];
          } else if (msg.type === 'GAME_ACTION') {
            const a = msg.payload;
            liveEvents = [
              {
                id: a.id,
                time,
                type: 'action',
                text: `🎮 Executed: "${a.command}"`,
              },
              ...liveEvents.slice(0, 49),
            ];
          } else if (msg.type === 'GOAL_PROGRESS') {
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
    } catch {
      // offline
    }
  }

  async function fetchRules() {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) {
        rules = await res.json();
      }
    } catch {
      // offline
    }
  }

  async function fetchGoals() {
    try {
      const res = await fetch('/api/goals');
      if (res.ok) {
        goals = await res.json();
      }
    } catch {
      // offline
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch('/api/history?limit=30');
      if (res.ok) {
        const data = await res.json();
        historyEvents = data.events || [];
      }
    } catch {
      // offline
    }
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
    isEditingRule = true;
  }

  function openEditRule(rule: RuleDefinition) {
    editingRule = JSON.parse(JSON.stringify(rule));
    isEditingRule = true;
  }

  async function saveRule() {
    if (!editingRule.name.trim() || !editingRule.action.command.trim()) {
      alert('Please provide a rule name and Minecraft command');
      return;
    }

    try {
      let res: Response;
      if (editingRule.id) {
        // Update
        res = await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingRule),
        });
      } else {
        // Create
        res = await fetch('/api/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingRule),
        });
      }

      if (res.ok) {
        isEditingRule = false;
        await fetchRules();
        flashStatus('✅ Rule saved & hot-reloaded successfully!');
      }
    } catch {
      flashStatus('Failed to save rule');
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

  async function resetGoal(id: string) {
    if (!confirm('Reset progress for this goal?')) return;
    try {
      const res = await fetch(`/api/goals/${id}/reset`, { method: 'POST' });
      if (res.ok) {
        await fetchGoals();
        flashStatus('🎯 Goal reset');
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

  function insertVariable(token: string) {
    editingRule.action.command += ` ${token}`;
  }

  $: filteredRules = rules.filter((r) => {
    if (ruleFilterPlatform === 'all') return true;
    if (!r.matcher.platforms || r.matcher.platforms.length === 0) return true;
    return r.matcher.platforms.includes(ruleFilterPlatform);
  });

  $: filteredHistory = historyEvents.filter((h) => {
    if (!historySearch.trim()) return true;
    const q = historySearch.toLowerCase();
    return (
      h.userName.toLowerCase().includes(q) ||
      (h.actionCommand && h.actionCommand.toLowerCase().includes(q)) ||
      h.eventType.toLowerCase().includes(q)
    );
  });

  $: commandPreview = editingRule.action.command
    .replace(/\$\{user\.displayName\}/g, 'SuperFan99')
    .replace(/\$\{metadata\.giftName\}/g, 'Rose')
    .replace(/\$\{event\.value\}/g, '10');
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
          on:click={() => (activeTab = 'monitor')}
        >
          📊 Monitor
        </button>
        <button
          id="tab-rules"
          class="nav-tab {activeTab === 'rules' ? 'active' : ''}"
          on:click={() => (activeTab = 'rules')}
        >
          ⚙️ Rules ({rules.length})
        </button>
        <button
          id="tab-goals"
          class="nav-tab {activeTab === 'goals' ? 'active' : ''}"
          on:click={() => (activeTab = 'goals')}
        >
          🎯 Goals ({goals.length})
        </button>
        <button
          id="tab-history"
          class="nav-tab {activeTab === 'history' ? 'active' : ''}"
          on:click={() => (activeTab = 'history')}
        >
          📜 Audit Log
        </button>
        <button
          id="tab-simulator"
          class="nav-tab {activeTab === 'simulator' ? 'active' : ''}"
          on:click={() => (activeTab = 'simulator')}
        >
          🧪 Simulator
        </button>
      </nav>
    </div>

    <div class="header-right">
      {#if statusMessage}
        <div class="toast-pill">{statusMessage}</div>
      {/if}

      <div class="system-pills">
        {#if status}
          <div class="status-pill {status.isPaused ? 'pill-paused' : 'pill-active'}">
            <span class="dot"></span>
            {status.isPaused ? 'PAUSED' : 'ONLINE'}
          </div>

          <div class="status-pill pill-neutral" title="Minecraft Connector">
            🎮 {status.adapters.game}
          </div>

          <div class="status-pill pill-neutral" title="Queue Depth">
            📥 Queue: {status.queue.size}
          </div>
        {/if}
      </div>

      <!-- Emergency Action Controls -->
      <div class="emergency-bar">
        <button
          id="btn-pause"
          class="ctrl-btn {status?.isPaused ? 'btn-resume' : 'btn-pause'}"
          on:click={togglePause}
          title={status?.isPaused ? 'Resume dispatching' : 'Pause action dispatching'}
        >
          {status?.isPaused ? '▶️ Resume' : '⏸️ Pause'}
        </button>

        <button
          id="btn-clear-queue"
          class="ctrl-btn btn-danger"
          on:click={clearQueue}
          title="Emergency purge queue"
        >
          🧹 Purge Queue
        </button>

        <button
          id="btn-view-overlay"
          class="ctrl-btn btn-overlay"
          on:click={onSwitchToOverlay}
          title="Switch to OBS Overlay HUD"
        >
          👁️ OBS HUD
        </button>
      </div>
    </div>
  </header>

  <!-- Main Content Area -->
  <main class="dashboard-body">
    <!-- TAB 1: MONITOR -->
    {#if activeTab === 'monitor'}
      <div class="monitor-grid">
        <!-- KPI Row -->
        <div class="kpi-row">
          <div class="kpi-card">
            <span class="kpi-label">PIPELINE STATUS</span>
            <div class="kpi-value {status?.isPaused ? 'text-amber' : 'text-cyan'}">
              {status?.isPaused ? 'PAUSED' : 'ACTIVE'}
            </div>
            <span class="kpi-sub">Auto-aging queue enabled</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">QUEUE DEPTH</span>
            <div class="kpi-value text-green">{status?.queue.size || 0}</div>
            <span class="kpi-sub">Pending game commands</span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">CONNECTED CLIENTS</span>
            <div class="kpi-value text-purple">{status?.adapters.clients.total || 0}</div>
            <span class="kpi-sub">
              Overlay: {status?.adapters.clients.overlay || 0} | Fabric Mod: {status?.adapters.clients.mod || 0}
            </span>
          </div>

          <div class="kpi-card">
            <span class="kpi-label">PLATFORM INGESTION</span>
            <div class="kpi-value text-cyan" style="font-size: 1.25rem; font-weight: 600;">
              {(status?.adapters.platforms || ['TikTok', 'Twitch']).join(' • ')}
            </div>
            <span class="kpi-sub">Concurrent multi-stream</span>
          </div>
        </div>

        <!-- Live Feeds Row -->
        <div class="feeds-row">
          <div class="feed-panel glass-card">
            <div class="panel-header">
              <h3>📡 Real-Time Event & Execution Feed</h3>
              <span class="pulse-indicator">LIVE</span>
            </div>
            <div class="feed-list" id="feed-container">
              {#if liveEvents.length === 0}
                <div class="empty-feed">
                  Waiting for stream events... Use the <strong>Simulator</strong> tab to test triggers!
                </div>
              {:else}
                {#each liveEvents as item (item.id + item.time)}
                  <div class="feed-row feed-{item.type}">
                    <span class="row-time">{item.time}</span>
                    <span class="row-text">{item.text}</span>
                  </div>
                {/each}
              {/if}
            </div>
          </div>

          <!-- Quick Test Controls -->
          <div class="quick-sim-panel glass-card">
            <div class="panel-header">
              <h3>⚡ Quick Simulator</h3>
            </div>
            <p class="panel-desc">Click any preset to test the live overlay and Minecraft execution.</p>

            <div class="sim-buttons">
              <button
                class="sim-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 1,
                    user: { id: 'u-rose', displayName: 'StreamFan' },
                    metadata: { giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
                  })}
              >
                🌹 1x Rose (TikTok)
              </button>

              <button
                class="sim-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'twitch',
                    type: 'gift',
                    value: 500,
                    user: { id: 'u-cheer', displayName: 'TwitchKing' },
                    metadata: { giftName: 'Cheer 500 Bits', diamondCount: 500, repeatCount: 1 },
                  })}
              >
                💎 500 Bits Cheer (Twitch)
              </button>

              <button
                class="sim-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'gift',
                    value: 1000,
                    user: { id: 'u-lion', displayName: 'WhaleSponsor' },
                    metadata: { giftName: 'Lion', diamondCount: 1000, repeatCount: 1 },
                  })}
              >
                🦁 1x Lion (TikTok)
              </button>

              <button
                class="sim-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'like',
                    value: 100,
                    user: { id: 'u-like', displayName: 'HeartSpammer' },
                    metadata: { likeCount: 100 },
                  })}
              >
                ❤️ 100 Likes
              </button>

              <button
                class="sim-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'twitch',
                    type: 'follow',
                    value: 5,
                    user: { id: 'u-sub', displayName: 'NewFollower' },
                    metadata: {},
                  })}
              >
                👤 New Follower
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- TAB 2: RULES EDITOR -->
    {#if activeTab === 'rules'}
      <div class="rules-view">
        <div class="rules-toolbar">
          <div class="toolbar-left">
            <button id="btn-add-rule" class="action-btn btn-primary" on:click={openNewRule}>
              ➕ Create New Rule
            </button>

            <div class="filter-group">
              <span>Platform:</span>
              <select bind:value={ruleFilterPlatform} class="styled-select">
                <option value="all">All Platforms</option>
                <option value="tiktok">TikTok</option>
                <option value="twitch">Twitch</option>
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
                    on:click={() => toggleRule(rule)}
                    title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                  >
                    {rule.enabled ? 'ON' : 'OFF'}
                  </button>
                  <h4 class="rule-name">{rule.name}</h4>
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
                    (≥ {rule.matcher.minValue})
                  {/if}
                </span>
              </div>

              <div class="rule-action">
                <span class="action-label">Minecraft Command:</span>
                <code class="cmd-code">{rule.action.command}</code>
              </div>

              <div class="rule-footer">
                <span class="cooldown-tag">⏱️ Cooldown: {rule.cooldownSeconds || 0}s</span>
                <div class="card-actions">
                  <button class="btn-sm btn-edit" on:click={() => openEditRule(rule)}>Edit</button>
                  <button class="btn-sm btn-del" on:click={() => deleteRule(rule.id)}>Delete</button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- TAB 3: GOALS -->
    {#if activeTab === 'goals'}
      <div class="goals-view">
        <div class="goals-header-bar">
          <h2>Stream Community Goals</h2>
          <span class="desc">Goals track viewer collective contributions to trigger grand server events.</span>
        </div>

        <div class="goals-grid">
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

              <div class="goal-bottom">
                <span class="goal-counter">
                  <strong>{goal.currentValue}</strong> / {goal.targetValue} {goal.unit}
                </span>

                <button class="btn-sm btn-reset" on:click={() => resetGoal(goal.id)}>
                  🔄 Reset Progress
                </button>
              </div>
            </div>
          {/each}
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
          <button class="action-btn btn-secondary" on:click={fetchHistory}>🔄 Refresh</button>
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
        <p class="panel-desc">Test your Minecraft live interactions without needing an active stream.</p>

        <div class="sim-grid">
          <div class="sim-card">
            <h4>Quick Presets</h4>
            <div class="sim-grid-buttons">
              <button
                class="sim-action-btn"
                on:click={() =>
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
                on:click={() =>
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
                on:click={() =>
                  injectSynthetic({
                    platform: 'twitch',
                    type: 'gift',
                    value: 100,
                    user: { id: 'u-3', displayName: 'TwitchCheer100' },
                    metadata: { giftName: 'Cheer 100 Bits', diamondCount: 100, repeatCount: 1 },
                  })}
              >
                💎 Cheer 100 Bits
              </button>

              <button
                class="sim-action-btn"
                on:click={() =>
                  injectSynthetic({
                    platform: 'tiktok',
                    type: 'comment',
                    value: 1,
                    user: { id: 'u-4', displayName: 'ChatterPro' },
                    metadata: { text: 'Hello Minecraft!' },
                  })}
              >
                💬 Chat Comment
              </button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>

  <!-- RULE EDITOR MODAL -->
  {#if isEditingRule}
    <div class="modal-backdrop" on:click|self={() => (isEditingRule = false)}>
      <div class="modal-card glass-card">
        <div class="modal-header">
          <h3>{editingRule.id ? 'Edit Rule' : 'Create New Rule'}</h3>
          <button class="close-btn" on:click={() => (isEditingRule = false)}>✕</button>
        </div>

        <div class="modal-form">
          <div class="form-row">
            <label>Rule Name</label>
            <input
              type="text"
              bind:value={editingRule.name}
              placeholder="e.g. Summon Zombie on Rose"
              class="styled-input"
            />
          </div>

          <div class="form-columns">
            <div class="form-col">
              <label>Priority (Higher executes first)</label>
              <input type="number" bind:value={editingRule.priority} class="styled-input" />
            </div>
            <div class="form-col">
              <label>Cooldown (Seconds)</label>
              <input type="number" bind:value={editingRule.cooldownSeconds} class="styled-input" />
            </div>
          </div>

          <div class="form-row">
            <label>Minecraft In-Game Command</label>
            <input
              type="text"
              bind:value={editingRule.action.command}
              placeholder="/summon zombie ~ ~ ~"
              class="styled-input"
            />
            <div class="token-helpers">
              <span>Click to add token:</span>
              <button class="token-pill" on:click={() => insertVariable('${user.displayName}')}>
                $&#123;user.displayName&#125;
              </button>
              <button class="token-pill" on:click={() => insertVariable('${metadata.giftName}')}>
                $&#123;metadata.giftName&#125;
              </button>
              <button class="token-pill" on:click={() => insertVariable('${event.value}')}>
                $&#123;event.value&#125;
              </button>
            </div>
          </div>

          <div class="preview-box">
            <span class="preview-label">Live Command Preview:</span>
            <code class="preview-code">{commandPreview}</code>
          </div>
        </div>

        <div class="modal-footer">
          <button class="action-btn btn-secondary" on:click={() => (isEditingRule = false)}>Cancel</button>
          <button class="action-btn btn-primary" on:click={saveRule}>💾 Save & Hot Reload</button>
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
    color: #f8fafc;
    background: rgba(255, 255, 255, 0.05);
  }

  .nav-tab.active {
    color: #00f0ff;
    background: rgba(0, 240, 255, 0.12);
    box-shadow: inset 0 0 8px rgba(0, 240, 255, 0.2);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .toast-pill {
    background: rgba(0, 240, 255, 0.2);
    border: 1px solid #00f0ff;
    color: #00f0ff;
    font-size: 0.8rem;
    padding: 6px 14px;
    border-radius: 20px;
    animation: fadeIn 0.3s ease;
  }

  .system-pills {
    display: flex;
    gap: 8px;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .pill-active {
    color: #10b981;
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.1);
  }

  .pill-paused {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.1);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px currentColor;
  }

  .emergency-bar {
    display: flex;
    gap: 8px;
  }

  .ctrl-btn {
    border: none;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-pause {
    background: #f59e0b;
    color: #000;
  }

  .btn-resume {
    background: #10b981;
    color: #000;
  }

  .btn-danger {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid #ef4444;
  }

  .btn-danger:hover {
    background: #ef4444;
    color: #fff;
  }

  .btn-overlay {
    background: rgba(0, 240, 255, 0.15);
    color: #00f0ff;
    border: 1px solid #00f0ff;
  }

  .btn-overlay:hover {
    background: #00f0ff;
    color: #000;
  }

  /* Body */
  .dashboard-body {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  /* Glass Card styling */
  .glass-card {
    background: rgba(18, 24, 38, 0.65);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 20px;
  }

  /* Monitor Grid */
  .kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .kpi-card {
    background: rgba(18, 24, 38, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .kpi-label {
    font-size: 0.7rem;
    letter-spacing: 1px;
    color: #64748b;
    font-weight: 700;
  }

  .kpi-value {
    font-size: 2rem;
    font-weight: 800;
  }

  .text-cyan {
    color: #00f0ff;
  }
  .text-green {
    color: #10b981;
  }
  .text-purple {
    color: #a855f7;
  }
  .text-amber {
    color: #f59e0b;
  }

  .kpi-sub {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .feeds-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #f8fafc;
  }

  .pulse-indicator {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    font-size: 0.7rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 12px;
  }

  .feed-list {
    height: 380px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .feed-row {
    font-family: monospace;
    font-size: 0.85rem;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 3px solid #64748b;
    display: flex;
    gap: 12px;
  }

  .feed-row.feed-action {
    border-left-color: #10b981;
    background: rgba(16, 185, 129, 0.05);
  }

  .feed-row.feed-gift {
    border-left-color: #a855f7;
    background: rgba(168, 85, 247, 0.05);
  }

  .row-time {
    color: #64748b;
  }

  .row-text {
    color: #e2e8f0;
  }

  .empty-feed {
    padding: 40px;
    text-align: center;
    color: #64748b;
  }

  .panel-desc {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-bottom: 16px;
  }

  .sim-buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .sim-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #e2e8f0;
    padding: 12px 16px;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .sim-btn:hover {
    background: rgba(0, 240, 255, 0.1);
    border-color: #00f0ff;
    color: #00f0ff;
  }

  /* Rules View */
  .rules-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .action-btn {
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: linear-gradient(90deg, #00f0ff, #0284c7);
    color: #000;
  }

  .btn-primary:hover {
    box-shadow: 0 0 16px rgba(0, 240, 255, 0.5);
  }

  .styled-select,
  .styled-input {
    background: rgba(13, 17, 23, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.9rem;
  }

  .rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 16px;
  }

  .rule-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: all 0.2s ease;
  }

  .rule-card:hover {
    border-color: rgba(0, 240, 255, 0.3);
  }

  .rule-disabled {
    opacity: 0.5;
  }

  .rule-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .rule-title-area {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-btn {
    border: none;
    font-size: 0.75rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .toggle-on {
    background: #10b981;
    color: #000;
  }
  .toggle-off {
    background: #64748b;
    color: #fff;
  }

  .rule-name {
    margin: 0;
    font-size: 1rem;
    color: #f8fafc;
  }

  .rule-badges {
    display: flex;
    gap: 6px;
  }

  .badge {
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
    text-transform: uppercase;
  }

  .badge-priority {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }

  .badge-platform {
    background: rgba(0, 240, 255, 0.2);
    color: #38bdf8;
  }

  .rule-criteria {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .criteria-val {
    color: #00f0ff;
    font-weight: 600;
  }

  .cmd-code {
    display: block;
    background: rgba(0, 0, 0, 0.4);
    padding: 8px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 0.85rem;
    color: #4ade80;
    overflow-x: auto;
    word-break: break-all;
  }

  .rule-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    border: none;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    font-weight: 600;
  }

  .btn-edit {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
  }
  .btn-del {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* Goals View */
  .goals-header-bar {
    margin-bottom: 24px;
  }

  .goals-header-bar h2 {
    margin: 0 0 6px 0;
  }

  .goals-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 20px;
  }

  .goal-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .goal-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .goal-name {
    margin: 0 0 4px 0;
    font-size: 1.1rem;
  }

  .goal-reward {
    font-size: 0.85rem;
    color: #f59e0b;
  }

  .goal-percentage {
    font-size: 1.5rem;
    font-weight: 800;
    color: #00f0ff;
  }

  .progress-track {
    height: 12px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00f0ff, #a855f7);
    border-radius: 6px;
    transition: width 0.3s ease;
  }

  .goal-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .btn-reset {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
  }

  /* History Table */
  .history-toolbar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .search-input {
    flex: 1;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .history-table th {
    text-align: left;
    padding: 10px 12px;
    color: #64748b;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .history-table td {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .status-tag {
    font-size: 0.75rem;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .tag-success {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
  }
  .tag-fail {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    width: 90%;
    max-width: 560px;
    background: #0d1117;
    border: 1px solid rgba(0, 240, 255, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 1.2rem;
    cursor: pointer;
  }

  .modal-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .form-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .token-helpers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 4px;
  }

  .token-pill {
    background: rgba(0, 240, 255, 0.1);
    border: 1px solid rgba(0, 240, 255, 0.3);
    color: #00f0ff;
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .preview-box {
    background: rgba(0, 0, 0, 0.4);
    padding: 12px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .preview-label {
    font-size: 0.75rem;
    color: #64748b;
  }

  .preview-code {
    color: #4ade80;
    font-family: monospace;
    font-size: 0.85rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .sim-grid-buttons {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .sim-action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #e2e8f0;
    padding: 14px;
    border-radius: 10px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .sim-action-btn:hover {
    background: rgba(168, 85, 247, 0.15);
    border-color: #a855f7;
    color: #c084fc;
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
