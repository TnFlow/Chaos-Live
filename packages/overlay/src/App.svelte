<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './Dashboard.svelte';

  let isDashboard = $state(
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/dashboard') ||
      window.location.search.includes('view=dashboard') ||
      window.location.hash.includes('dashboard'))
  );

  interface StreamUser {
    id: string;
    displayName: string;
  }

  interface EventItem {
    id: string;
    type: 'gift' | 'like' | 'follow' | 'comment' | 'share';
    user: StreamUser;
    value: number;
    title: string;
    subtitle: string;
    timestamp: number;
    icon: string;
    accentColor: string;
  }

  interface ActiveAlert {
    id: string;
    title: string;
    sender: string;
    giftName?: string;
    value: number;
    command?: string;
    icon: string;
    color: string;
  }

  interface LeaderboardEntry {
    name: string;
    totalValue: number;
  }

  interface ActionItem {
    id: string;
    actionType: string;
    command: string;
    timestamp: number;
  }

  interface GoalItem {
    id: string;
    name: string;
    eventType: string;
    targetValue: number;
    currentValue: number;
    percent: number;
    completed?: boolean;
  }

  // State
  let isConnected = $state(false);
  let totalEventsReceived = $state(0);
  let events = $state<EventItem[]>([]);
  let activeAlert = $state<ActiveAlert | null>(null);
  let leaderboard = $state<LeaderboardEntry[]>([]);
  let recentActions = $state<ActionItem[]>([]);
  let showControls = $state(false);

  // Goals state
  let goals = $state<GoalItem[]>([
    {
      id: 'goal-roses-50',
      name: '🌹 50 Roses ➜ Summon Warden',
      eventType: 'gift',
      targetValue: 50,
      currentValue: 12,
      percent: 24,
      completed: false,
    },
    {
      id: 'goal-likes-150',
      name: '❤️ 150 Likes ➜ Diamond Shower',
      eventType: 'like',
      targetValue: 150,
      currentValue: 45,
      percent: 30,
      completed: false,
    },
  ]);

  let celebratingGoal = $state<GoalItem | null>(null);
  let celebrationTimeout: any = null;
  let alertTimeout: any = null;

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  }

  function triggerAlert(alert: ActiveAlert) {
    if (alertTimeout) {
      clearTimeout(alertTimeout);
    }
    activeAlert = alert;
    alertTimeout = setTimeout(() => {
      activeAlert = null;
    }, 4500);
  }

  function triggerCelebration(goal: GoalItem) {
    if (celebrationTimeout) {
      clearTimeout(celebrationTimeout);
    }
    celebratingGoal = goal;
    celebrationTimeout = setTimeout(() => {
      celebratingGoal = null;
    }, 5500);
  }

  function handleIncomingPacket(packet: any) {
    if (!packet || !packet.type) return;

    if (packet.type === 'INITIAL_GOALS') {
      if (Array.isArray(packet.payload) && packet.payload.length > 0) {
        goals = packet.payload.map((g: any) => ({
          id: g.id,
          name: g.name,
          eventType: g.eventType,
          targetValue: g.targetValue,
          currentValue: g.currentValue ?? 0,
          percent: Math.min(100, Math.round(((g.currentValue ?? 0) / g.targetValue) * 100)),
          completed: g.completed ?? false,
        }));
      }
    } else if (packet.type === 'GOAL_PROGRESS') {
      const update = packet.payload;
      const targetId = update.goalId || update.id;
      const idx = goals.findIndex((g) => g.id === targetId);

      if (idx >= 0) {
        goals[idx] = {
          ...goals[idx]!,
          currentValue: update.currentValue,
          percent: update.percent,
          completed: update.completed,
        };
      } else {
        goals.push({
          id: targetId,
          name: update.name,
          eventType: update.eventType,
          targetValue: update.targetValue,
          currentValue: update.currentValue,
          percent: update.percent,
          completed: update.completed,
        });
      }
    } else if (packet.type === 'GOAL_COMPLETED') {
      const update = packet.payload;
      triggerCelebration({
        id: update.goalId || update.id,
        name: update.name,
        eventType: update.eventType,
        targetValue: update.targetValue,
        currentValue: update.targetValue,
        percent: 100,
        completed: true,
      });
    } else if (packet.type === 'CHAOS_EVENT') {
      const event = packet.payload;
      totalEventsReceived++;

      const user: StreamUser = event.user || { id: 'anon', displayName: 'Anonymous' };
      let icon = '💬';
      let title = user.displayName;
      let subtitle = '';
      let accentColor = 'var(--accent-cyan)';

      switch (event.type) {
        case 'gift': {
          icon = '🎁';
          accentColor = 'var(--accent-rose)';
          const giftName = event.metadata?.giftName || 'Gift';
          const repeat = event.metadata?.repeatCount || 1;
          subtitle = `sent ${giftName} ${repeat > 1 ? `x${repeat}` : ''} (${event.value} 💎)`;

          // Trigger grand popup alert for gifts
          triggerAlert({
            id: event.id,
            title: repeat > 1 ? `GIFT STREAK x${repeat}!` : 'SPECIAL GIFT!',
            sender: user.displayName,
            giftName,
            value: event.value,
            icon: giftName === 'Lion' ? '🦁' : giftName === 'Rose' ? '🌹' : '🍦',
            color: accentColor,
          });

          // Update leaderboard
          updateLeaderboard(user.displayName, event.value);
          break;
        }
        case 'like': {
          icon = '❤️';
          accentColor = 'var(--accent-amber)';
          subtitle = `sent ${event.metadata?.likeCount || 1} likes!`;
          break;
        }
        case 'follow': {
          icon = '⭐';
          accentColor = 'var(--accent-emerald)';
          subtitle = 'started following the stream!';
          triggerAlert({
            id: event.id,
            title: 'NEW FOLLOWER!',
            sender: user.displayName,
            value: event.value,
            icon: '⭐',
            color: accentColor,
          });
          break;
        }
        case 'comment': {
          icon = '💬';
          accentColor = 'var(--accent-blue)';
          subtitle = event.metadata?.text || 'said hello';
          break;
        }
        case 'share': {
          icon = '🚀';
          accentColor = 'var(--accent-violet)';
          subtitle = 'shared the stream!';
          break;
        }
      }

      const item: EventItem = {
        id: event.id,
        type: event.type,
        user,
        value: event.value,
        title,
        subtitle,
        timestamp: event.timestamp || Date.now(),
        icon,
        accentColor,
      };

      // Prepend to feed and limit to 8
      events = [item, ...events.slice(0, 7)];
    } else if (packet.type === 'ACTION_DISPATCHED') {
      const action = packet.payload;
      recentActions = [
        {
          id: action.correlationId || String(Date.now()),
          actionType: action.actionType || 'command',
          command: action.command || '',
          timestamp: Date.now(),
        },
        ...recentActions.slice(0, 4),
      ];

      // Update current active alert with command if matched
      if (activeAlert && activeAlert.id === action.correlationId) {
        activeAlert.command = action.command;
      }
    }
  }

  function updateLeaderboard(name: string, addValue: number) {
    const existing = leaderboard.find((e) => e.name === name);
    if (existing) {
      existing.totalValue += addValue;
    } else {
      leaderboard.push({ name, totalValue: addValue });
    }
    leaderboard = [...leaderboard].sort((a, b) => b.totalValue - a.totalValue).slice(0, 5);
  }

  // Simulated triggers for preview / testing
  function testGift(name: string, diamonds: number, icon: string) {
    handleIncomingPacket({
      type: 'CHAOS_EVENT',
      payload: {
        id: `mock-gift-${Date.now()}`,
        type: 'gift',
        user: { id: 'u1', displayName: 'HeroGamer' },
        value: diamonds,
        metadata: { giftName: name, repeatCount: 1, diamondCount: diamonds },
        timestamp: Date.now(),
      },
    });

    handleIncomingPacket({
      type: 'ACTION_DISPATCHED',
      payload: {
        correlationId: `mock-gift-${Date.now()}`,
        actionType: 'execute_command',
        command: name === 'Lion' ? 'summon creeper ~ ~ ~ {powered:1b}' : 'summon zombie ~ ~ ~',
      },
    });
  }

  function testLike() {
    handleIncomingPacket({
      type: 'CHAOS_EVENT',
      payload: {
        id: `mock-like-${Date.now()}`,
        type: 'like',
        user: { id: 'u2', displayName: 'StreamFan' },
        value: 15,
        metadata: { likeCount: 15 },
        timestamp: Date.now(),
      },
    });
  }

  function testCompleteGoal() {
    const goal = goals[0] || {
      id: 'g-test',
      name: '🌹 50 Roses ➜ Summon Warden',
      eventType: 'gift',
      targetValue: 50,
      currentValue: 50,
      percent: 100,
    };
    triggerCelebration(goal);
  }

  onMount(() => {
    // Check url params for ?preview=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1') {
      showControls = true;
    }

    // Connect to WebSocket hub
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:8080';
    const wsUrl = `${protocol}//${host}/?clientType=overlay`;

    let socket: WebSocket;
    let reconnectTimer: any = null;

    function connect() {
      try {
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          isConnected = true;
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleIncomingPacket(data);
          } catch {
            // Ignore
          }
        };

        socket.onclose = () => {
          isConnected = false;
          reconnectTimer = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  });
</script>

{#if isDashboard}
  <Dashboard
    onSwitchToOverlay={() => {
      isDashboard = false;
      window.history.pushState({}, '', '/');
    }}
  />
{:else}
<div class="overlay-root" id="chaos-overlay-container">
  <!-- Top Header Status Bar -->
  <header class="status-bar glass-panel" id="overlay-status-bar">
    <div class="status-pill">
      <span class="indicator-dot {isConnected ? 'connected' : 'disconnected'}"></span>
      <span class="status-text">{isConnected ? 'LIVE OVERLAY' : 'CONNECTING...'}</span>
    </div>

    <!-- Community Goal Progress Bar (Centered in header) -->
    {#if goals.length > 0}
      {@const activeGoal = goals[0]}
      <div class="goal-widget" id="active-goal-widget">
        <div class="goal-label-row">
          <span class="goal-name">{activeGoal?.name}</span>
          <span class="goal-counts">
            <strong>{activeGoal?.currentValue}</strong> / {activeGoal?.targetValue}
            <span class="goal-percent">({activeGoal?.percent}%)</span>
          </span>
        </div>
        <div class="goal-track">
          <div
            class="goal-fill"
            style="width: {activeGoal?.percent}%;"
          >
            <div class="goal-shimmer"></div>
          </div>
        </div>
      </div>
    {/if}

    <div class="stats-counter">
      <span class="counter-label">EVENTS</span>
      <span class="counter-val">{totalEventsReceived}</span>
    </div>

    <button
      id="btn-goto-dashboard"
      class="dashboard-launcher-btn"
      onclick={() => {
        isDashboard = true;
        window.history.pushState({}, '', '/dashboard');
      }}
      title="Open Streamer Dashboard"
    >
      ⚙️ Dashboard
    </button>
  </header>

  <!-- Left: Live Event Feed -->
  <aside class="event-feed-container" id="overlay-event-feed">
    <div class="feed-header">
      <span class="feed-title">RECENT INTERACTIONS</span>
    </div>
    <div class="feed-items">
      {#each events as item (item.id)}
        <div
          class="event-card glass-panel"
          style="--card-accent: {item.accentColor}"
          id="event-card-{item.id}"
        >
          <div class="event-icon-badge">{item.icon}</div>
          <div class="event-details">
            <div class="event-top-row">
              <span class="event-username">{item.title}</span>
              <span class="event-timestamp">{formatTime(item.timestamp)}</span>
            </div>
            <div class="event-subtitle">{item.subtitle}</div>
          </div>
        </div>
      {/each}
    </div>
  </aside>

  <!-- Center: Big Animated Alert Banner -->
  {#if activeAlert}
    <div class="grand-alert-wrapper" id="grand-alert-box">
      <div class="grand-alert-card glass-panel" style="--alert-color: {activeAlert.color}">
        <div class="alert-shimmer"></div>
        <div class="alert-icon-ring">
          <span class="alert-icon">{activeAlert.icon}</span>
        </div>
        <div class="alert-content">
          <h2 class="alert-banner-tag">{activeAlert.title}</h2>
          <h1 class="alert-sender-name">{activeAlert.sender}</h1>
          {#if activeAlert.giftName}
            <p class="alert-gift-detail">
              Sent <strong style="color: var(--alert-color);">{activeAlert.giftName}</strong> ({activeAlert.value} 💎)
            </p>
          {/if}
          {#if activeAlert.command}
            <div class="alert-command-pill">
              <span class="cmd-icon">⚡</span>
              <span class="cmd-text">MC: /{activeAlert.command}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Center Celebration Banner when a Community Goal is completed -->
  {#if celebratingGoal}
    <div class="celebration-overlay" id="goal-celebration-banner">
      <div class="celebration-card glass-panel">
        <div class="celebration-rays"></div>
        <div class="celebration-trophy">🏆</div>
        <h2 class="celebration-subtitle">COMMUNITY GOAL UNLOCKED!</h2>
        <h1 class="celebration-title">{celebratingGoal.name}</h1>
        <div class="celebration-pill">
          <span>🎮 Spawning in Minecraft!</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Right: Top Gifters Leaderboard & Secondary Goals -->
  <aside class="leaderboard-container glass-panel" id="overlay-leaderboard">
    <div class="leaderboard-header">
      <span class="trophy-icon">🏆</span>
      <span class="leaderboard-title">TOP SUPPORTERS</span>
    </div>
    <div class="leaderboard-list">
      {#if leaderboard.length === 0}
        <div class="leaderboard-empty">Send gifts to claim #1!</div>
      {:else}
        {#each leaderboard as entry, i}
          <div class="leaderboard-row rank-{i + 1}">
            <div class="rank-badge">#{i + 1}</div>
            <div class="donor-name">{entry.name}</div>
            <div class="diamond-count">{entry.totalValue} 💎</div>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Secondary Goal in sidebar -->
    {#if goals.length > 1}
      {@const secGoal = goals[1]}
      <div class="secondary-goal-widget">
        <div class="goal-label-row">
          <span class="goal-name-small">{secGoal?.name}</span>
          <span class="goal-percent-small">{secGoal?.percent}%</span>
        </div>
        <div class="goal-track-small">
          <div class="goal-fill-sec" style="width: {secGoal?.percent}%;"></div>
        </div>
      </div>
    {/if}
  </aside>

  <!-- Bottom: Game Action Ticker -->
  {#if recentActions.length > 0}
    <div class="action-ticker glass-panel" id="overlay-action-ticker">
      <div class="ticker-label">GAME EXECUTIONS</div>
      <div class="ticker-items">
        {#each recentActions as action (action.id)}
          <div class="ticker-item">
            <span class="ticker-cmd">/{action.command}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Floating Test Controls (can be toggled in OBS or testing) -->
  <div class="preview-controls-toggle">
    <button
      class="toggle-btn"
      onclick={() => (showControls = !showControls)}
      title="Toggle test controls"
    >
      ⚙️
    </button>
  </div>

  {#if showControls}
    <div class="preview-controls-panel glass-panel" id="preview-controls">
      <h4>Overlay Test Suite</h4>
      <div class="control-buttons">
        <button onclick={() => testGift('Rose', 1, '🌹')}>🌹 Test Rose</button>
        <button onclick={() => testGift('Ice Cream', 1, '🍦')}>🍦 Test Ice Cream</button>
        <button onclick={() => testGift('Lion', 29999, '🦁')}>🦁 Test Lion</button>
        <button onclick={testLike}>❤️ Test Likes</button>
        <button class="goal-test-btn" onclick={testCompleteGoal}>🏆 Complete Goal</button>
      </div>
    </div>
  {/if}
</div>
{/if}

<style>
  .overlay-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    padding: 24px;
    display: grid;
    grid-template-columns: 340px 1fr 300px;
    grid-template-rows: 60px 1fr 50px;
    gap: 20px;
  }

  /* Status Bar */
  .status-bar {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
    height: 52px;
    gap: 24px;
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .indicator-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .indicator-dot.connected {
    background: var(--accent-emerald);
    box-shadow: 0 0 10px var(--accent-emerald);
    animation: pulseGlow 2s infinite;
  }

  .indicator-dot.disconnected {
    background: var(--accent-rose);
    box-shadow: 0 0 10px var(--accent-rose);
  }

  /* Goal Widget in Header */
  .goal-widget {
    flex: 1;
    max-width: 540px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .goal-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    font-family: var(--font-display);
    font-weight: 700;
  }

  .goal-name {
    color: var(--text-main);
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .goal-counts {
    font-family: var(--font-mono);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .goal-counts strong {
    color: var(--accent-cyan);
  }

  .goal-percent {
    color: var(--accent-emerald);
    margin-left: 4px;
  }

  .goal-track {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .goal-fill {
    height: 100%;
    background: linear-gradient(90deg, #10b981, #06b6d4);
    box-shadow: 0 0 12px rgba(6, 182, 212, 0.5);
    border-radius: 6px;
    transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
    overflow: hidden;
  }

  .goal-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.3),
      transparent
    );
    background-size: 200% 100%;
    animation: shimmer 2s infinite linear;
  }

  .stats-counter {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 13px;
    white-space: nowrap;
  }

  .counter-label {
    color: var(--text-dim);
    font-weight: 600;
  }

  .counter-val {
    color: var(--accent-cyan);
    font-weight: 700;
  }

  .dashboard-launcher-btn {
    background: rgba(0, 240, 255, 0.12);
    border: 1px solid rgba(0, 240, 255, 0.3);
    color: var(--accent-cyan);
    padding: 6px 12px;
    border-radius: 8px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .dashboard-launcher-btn:hover {
    background: var(--accent-cyan);
    color: #000;
    box-shadow: 0 0 12px rgba(0, 240, 255, 0.5);
  }

  /* Event Feed */
  .event-feed-container {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feed-header {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--text-muted);
  }

  .feed-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .event-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    animation: slideInLeft 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    border-left: 4px solid var(--card-accent);
  }

  .event-icon-badge {
    font-size: 22px;
  }

  .event-details {
    flex: 1;
    overflow: hidden;
  }

  .event-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .event-username {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    color: var(--text-main);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-timestamp {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim);
  }

  .event-subtitle {
    font-size: 12px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  /* Center Grand Alert */
  .grand-alert-wrapper {
    position: absolute;
    top: 35%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 100;
    animation: alertPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }

  .grand-alert-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 36px 48px;
    min-width: 480px;
    border: 2px solid var(--alert-color);
    box-shadow: 0 0 50px rgba(0, 0, 0, 0.8), 0 0 30px var(--alert-color);
    overflow: hidden;
  }

  .alert-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.08),
      transparent
    );
    background-size: 200% 100%;
    animation: shimmer 2.5s infinite linear;
  }

  .alert-icon-ring {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid var(--alert-color);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 42px;
    margin-bottom: 16px;
    box-shadow: 0 0 20px var(--alert-color);
  }

  .alert-banner-tag {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--alert-color);
    margin-bottom: 6px;
  }

  .alert-sender-name {
    font-family: var(--font-display);
    font-size: 34px;
    font-weight: 900;
    color: #ffffff;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  }

  .alert-gift-detail {
    font-size: 16px;
    color: var(--text-muted);
    margin-top: 6px;
  }

  .alert-command-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 16px;
    border-radius: 20px;
    margin-top: 16px;
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent-emerald);
  }

  /* Goal Celebration Banner */
  .celebration-overlay {
    position: absolute;
    top: 35%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 150;
    animation: alertPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }

  .celebration-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 40px 60px;
    min-width: 520px;
    border: 2px solid var(--accent-amber);
    box-shadow: 0 0 60px rgba(245, 158, 11, 0.5), 0 0 100px rgba(0, 0, 0, 0.9);
    background: rgba(15, 23, 42, 0.94);
    overflow: hidden;
  }

  .celebration-trophy {
    font-size: 54px;
    margin-bottom: 12px;
    animation: bounceSoft 1.5s infinite;
  }

  .celebration-subtitle {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.25em;
    color: var(--accent-amber);
    margin-bottom: 8px;
  }

  .celebration-title {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 900;
    color: #ffffff;
    margin-bottom: 16px;
  }

  .celebration-pill {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid var(--accent-amber);
    color: var(--accent-amber);
    padding: 6px 20px;
    border-radius: 20px;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
  }

  /* Right Leaderboard */
  .leaderboard-container {
    grid-column: 3;
    grid-row: 2;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .leaderboard-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 10px;
  }

  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .leaderboard-empty {
    font-size: 12px;
    color: var(--text-dim);
    text-align: center;
    padding: 20px 0;
  }

  .leaderboard-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    font-size: 13px;
  }

  .rank-badge {
    font-family: var(--font-mono);
    font-weight: 800;
    font-size: 11px;
    color: var(--text-dim);
  }

  .rank-1 .rank-badge {
    color: var(--accent-amber);
  }

  .donor-name {
    flex: 1;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diamond-count {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--accent-cyan);
    font-size: 12px;
  }

  /* Secondary Goal in sidebar */
  .secondary-goal-widget {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .goal-name-small {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-main);
  }

  .goal-percent-small {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--accent-emerald);
  }

  .goal-track-small {
    height: 6px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    overflow: hidden;
  }

  .goal-fill-sec {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #ef4444);
    border-radius: 4px;
    transition: width 0.4s ease;
  }

  /* Bottom Action Ticker */
  .action-ticker {
    grid-column: 1 / -1;
    grid-row: 3;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    overflow: hidden;
  }

  .ticker-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--accent-emerald);
    white-space: nowrap;
  }

  .ticker-items {
    display: flex;
    gap: 16px;
    overflow: hidden;
  }

  .ticker-cmd {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    background: rgba(255, 255, 255, 0.04);
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
  }

  /* Test Controls */
  .preview-controls-toggle {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 1000;
  }

  .toggle-btn {
    background: var(--bg-glass-strong);
    border: 1px solid var(--border-glass);
    color: white;
    font-size: 18px;
    padding: 8px 12px;
    border-radius: 50%;
    cursor: pointer;
    backdrop-filter: blur(10px);
  }

  .preview-controls-panel {
    position: fixed;
    bottom: 60px;
    right: 16px;
    z-index: 1000;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .preview-controls-panel h4 {
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.1em;
  }

  .control-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-buttons button {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-main);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: var(--font-body);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .control-buttons button:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .goal-test-btn {
    border-color: rgba(245, 158, 11, 0.4) !important;
    color: var(--accent-amber) !important;
  }
</style>
