<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './Dashboard.svelte';
  import { SOUND_PRESETS, playSound, setMasterVolume, setMuted } from './utils/sound-engine';
  import {
    type OverlayCustomSettings,
    type OverlayLayout,
    type OverlayTheme,
    DEFAULT_OVERLAY_SETTINGS,
    THEME_PALETTES,
  } from './types/overlay-config';

  let isDashboard = $state(
    typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/overlay') &&
      !window.location.search.includes('view=overlay')
  );

  $effect(() => {
    if (typeof document !== 'undefined') {
      if (isDashboard) {
        document.body.classList.add('dashboard-mode');
        document.body.classList.remove('overlay-mode');
      } else {
        document.body.classList.add('overlay-mode');
        document.body.classList.remove('dashboard-mode');
      }
    }
  });

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
    imageUrl?: string;
    color: string;
    viewerFeedback?: {
      title?: string;
      description?: string;
      bannerColor?: string;
      soundEffect?: string;
    };
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

  interface RuleItem {
    id: string;
    name: string;
    enabled: boolean;
    priority: number;
    icon?: string;
    imageUrl?: string;
    matcher: {
      platforms?: string[];
      eventTypes?: string[];
      minValue?: number;
      metadataMatch?: { giftName?: string };
    };
    action: {
      actionType: string;
      command: string;
    };
    viewerFeedback?: {
      title?: string;
      description?: string;
      bannerColor?: string;
      soundEffect?: string;
    };
  }

  // State
  let isConnected = $state(false);
  let totalEventsReceived = $state(0);
  let events = $state<EventItem[]>([]);
  let activeAlert = $state<ActiveAlert | null>(null);
  let leaderboard = $state<LeaderboardEntry[]>([]);
  let recentActions = $state<ActionItem[]>([]);
  let showControls = $state(false);
  let showStudioDrawer = $state(false);
  let modularMode = $state<string>('');

  // Overlay Customization Settings
  let overlaySettings = $state<OverlayCustomSettings>({ ...DEFAULT_OVERLAY_SETTINGS });
  let rewardsDisplayMode = $state<'both' | 'ticker' | 'menu' | 'off'>('both');

  let currentTheme = $derived(
    THEME_PALETTES[overlaySettings.theme] || THEME_PALETTES.cyberpunk
  );

  // Stream Simulation State
  let isSimulation = $state(false);
  let isAutoSimulating = $state(false);
  let simInterval: any = null;
  let floatingHearts = $state<{ id: number; left: number; emoji: string }[]>([]);
  let heartCounter = 0;

  function spawnFloatingHeart(emoji = '❤️') {
    const id = ++heartCounter;
    const left = overlaySettings.layout === 'vertical' ? 60 + Math.random() * 32 : 70 + Math.random() * 25;
    floatingHearts = [...floatingHearts, { id, left, emoji }];
    setTimeout(() => {
      floatingHearts = floatingHearts.filter((h) => h.id !== id);
    }, 2200);
  }

  const SIM_VIEWERS = [
    { name: 'SacredFan_99', color: '#06b6d4' },
    { name: 'CarlosCraft', color: '#10b981' },
    { name: 'BellaGamer', color: '#f43f5e' },
    { name: 'WhaleKing_MC', color: '#f59e0b' },
    { name: 'AlexGamerPro', color: '#a855f7' },
    { name: 'Diana_MC', color: '#ec4899' },
  ];

  const SIM_COMMENTS = [
    'vamos streamer a por el warden!! 🔥',
    'Cuidado con la espalda jaja 😂',
    'MÁNDENLE UN LEÓN YA MISMO 🦁',
    'Droppeen rosas a ver si aguanta 🌹',
    'GG buena esa jugada 👏',
    'El creeper cargado te va a explotar todo 💥',
    'Qué pro con la espada de diamante ⚔️',
  ];

  function toggleAutoSimulation() {
    isAutoSimulating = !isAutoSimulating;
    if (isAutoSimulating) {
      runSimStep();
      simInterval = setInterval(runSimStep, 3600);
    } else {
      if (simInterval) clearInterval(simInterval);
      simInterval = null;
    }
  }

  function runSimStep() {
    const rand = Math.random();
    const viewer = SIM_VIEWERS[Math.floor(Math.random() * SIM_VIEWERS.length)]!;

    if (rand < 0.28) {
      // Comment
      const text = SIM_COMMENTS[Math.floor(Math.random() * SIM_COMMENTS.length)]!;
      handleIncomingPacket({
        type: 'CHAOS_EVENT',
        payload: {
          id: `sim-cmt-${Date.now()}`,
          type: 'comment',
          user: { id: viewer.name, displayName: viewer.name },
          value: 1,
          metadata: { text },
          timestamp: Date.now(),
        },
      });
    } else if (rand < 0.55) {
      // Likes burst
      const count = Math.floor(Math.random() * 25) + 15;
      for (let i = 0; i < 4; i++) {
        setTimeout(() => spawnFloatingHeart(Math.random() > 0.3 ? '❤️' : '🔥'), i * 200);
      }
      handleIncomingPacket({
        type: 'CHAOS_EVENT',
        payload: {
          id: `sim-like-${Date.now()}`,
          type: 'like',
          user: { id: viewer.name, displayName: viewer.name },
          value: count,
          metadata: { likeCount: count },
          timestamp: Date.now(),
        },
      });
    } else if (rand < 0.72) {
      // Rose gift
      testGift('Rose', 1, '🌹');
      spawnFloatingHeart('🌹');
    } else if (rand < 0.88) {
      // Ice cream or Doughnut
      if (Math.random() > 0.5) {
        testGift('Ice Cream', 30, '🍦');
      } else {
        testGift('Doughnut', 30, '🍩');
      }
    } else if (rand < 0.96) {
      // Money Gun
      testGift('Money Gun', 500, '💸');
      spawnFloatingHeart('💸');
    } else {
      // Mega Lion!
      testGift('Lion', 29999, '🦁');
      spawnFloatingHeart('🦁');
      spawnFloatingHeart('👑');
    }
  }

  // Rules for Interactive Gift Rewards Menu & Ticker
  let rules = $state<RuleItem[]>([
    {
      id: 'rule-gift-rose',
      name: 'Gift: Rose',
      enabled: true,
      priority: 10,
      icon: '🌹',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Rose' }, minValue: 1 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon chicken ~ ~1 ~' },
      viewerFeedback: { title: '🌹 ROSE SHOWER!', description: 'Spawns Chicken in Game', bannerColor: '#f43f5e', soundEffect: 'chime-diamond' },
    },
    {
      id: 'rule-gift-ice-cream',
      name: 'Gift: Ice Cream',
      enabled: true,
      priority: 15,
      icon: '🍦',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Ice Cream' }, minValue: 30 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon zombie ~ ~ ~' },
      viewerFeedback: { title: '🍦 ICE CREAM ALERT!', description: 'Spawns Zombie Horde', bannerColor: '#06b6d4', soundEffect: 'retro-8bit' },
    },
    {
      id: 'rule-gift-doughnut',
      name: 'Gift: Doughnut',
      enabled: true,
      priority: 15,
      icon: '🍩',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Doughnut' }, minValue: 30 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon skeleton ~ ~ ~' },
      viewerFeedback: { title: '🍩 SKELETON SNIPER!', description: 'Invoca Esqueleto Sniper', bannerColor: '#f97316', soundEffect: 'retro-8bit' },
    },
    {
      id: 'rule-gift-money-gun',
      name: 'Gift: Money Gun',
      enabled: true,
      priority: 25,
      icon: '💸',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Money Gun' }, minValue: 500 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon tnt ~ ~2 ~' },
      viewerFeedback: { title: '💸 MONEY GUN TNT!', description: 'Detona TNT Dinamita', bannerColor: '#10b981', soundEffect: 'tnt-boom' },
    },
    {
      id: 'rule-gift-lion',
      name: 'Gift: Lion',
      enabled: true,
      priority: 50,
      icon: '🦁',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Lion' }, minValue: 29999 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon creeper ~ ~ ~ {powered:1b}' },
      viewerFeedback: { title: '🦁 KING LION!', description: 'Invoca Creeper Cargado Jefe!', bannerColor: '#f59e0b', soundEffect: 'monster-roar' },
    },
    {
      id: 'rule-new-follow',
      name: 'New Follower',
      enabled: true,
      priority: 5,
      icon: '⭐',
      matcher: { eventTypes: ['follow'] },
      action: { actionType: 'execute_command', command: 'effect give @p minecraft:speed 10 1' },
      viewerFeedback: { title: '⭐ NEW FOLLOWER!', description: 'Velocidad al Streamer', bannerColor: '#eab308', soundEffect: 'powerup-level' },
    },
    {
      id: 'rule-likes-streak',
      name: 'Likes Streak',
      enabled: true,
      priority: 5,
      icon: '❤️',
      matcher: { eventTypes: ['like'], minValue: 100 },
      action: { actionType: 'execute_command', command: 'execute at @p run particle heart ~ ~1 ~ 1 1 1 0.1 20' },
      viewerFeedback: { title: '❤️ 100+ LIKES!', description: 'Lluvia de Corazones', bannerColor: '#f43f5e', soundEffect: 'heart-pop' },
    },
  ]);

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

  // Process rules into clean viewer-facing rewards list
  let activeRewards = $derived(
    rules
      .filter((r) => r.enabled)
      .map((r) => {
        const giftName = r.matcher?.metadataMatch?.giftName || r.name.replace(/^Gift:\s*/i, '');
        const cost =
          r.matcher?.minValue ||
          (giftName === 'Lion' ? 29999 : giftName === 'Money Gun' ? 500 : giftName === 'Ice Cream' || giftName === 'Doughnut' ? 30 : 1);
        const icon =
          r.icon ||
          (giftName === 'Lion'
            ? '🦁'
            : giftName === 'Money Gun'
              ? '💸'
              : giftName === 'Ice Cream'
                ? '🍦'
                : giftName === 'Doughnut'
                  ? '🍩'
                  : giftName === 'Rose'
                    ? '🌹'
                    : '🎁');

        let rewardText = r.viewerFeedback?.description || r.viewerFeedback?.title || r.action?.command || 'In-Game Event';
        if (r.action?.command?.includes('summon creeper') && r.action?.command?.includes('powered:1b')) {
          rewardText = 'Invoca Creeper Cargado Jefe';
        } else if (r.action?.command?.includes('summon zombie')) {
          rewardText = 'Invoca Horda Zombie';
        } else if (r.action?.command?.includes('summon skeleton')) {
          rewardText = 'Invoca Esqueleto Sniper';
        } else if (r.action?.command?.includes('summon tnt')) {
          rewardText = 'Detona TNT Dinamita';
        } else if (r.action?.command?.includes('summon chicken')) {
          rewardText = 'Invoca Pollo en el Juego';
        } else if (r.action?.command?.includes('summon lightning_bolt')) {
          rewardText = 'Rayo / Tormenta Cósmica';
        } else if (r.action?.command?.includes('summon warden')) {
          rewardText = 'Invoca al Jefe Warden';
        } else if (r.action?.command?.includes('effect give') && r.action?.command?.includes('speed')) {
          rewardText = 'Velocidad al Streamer';
        } else if (r.action?.command?.includes('particle heart')) {
          rewardText = 'Lluvia de Corazones';
        }

        return {
          id: r.id,
          icon,
          imageUrl: r.imageUrl,
          giftName,
          cost,
          rewardText,
          color: r.viewerFeedback?.bannerColor || currentTheme.accent1,
          soundEffect: r.viewerFeedback?.soundEffect,
          eventType: (r.matcher?.eventTypes && r.matcher.eventTypes[0]) || 'gift',
        };
      })
  );

  function formatTime(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  }

  function triggerAlert(alert: ActiveAlert) {
    if (alertTimeout) {
      clearTimeout(alertTimeout);
    }
    activeAlert = alert;

    // Play Sound Effect
    if (overlaySettings.soundEnabled) {
      const soundId =
        alert.viewerFeedback?.soundEffect ||
        (alert.giftName === 'Lion' ? 'monster-roar' : alert.giftName === 'Money Gun' ? 'tnt-boom' : 'chime-diamond');
      playSound(soundId);
    }

    const duration = (overlaySettings.bannerDurationSeconds || 4.8) * 1000;
    alertTimeout = setTimeout(() => {
      activeAlert = null;
    }, duration);
  }

  function triggerCelebration(goal: GoalItem) {
    if (celebrationTimeout) {
      clearTimeout(celebrationTimeout);
    }
    celebratingGoal = goal;

    if (overlaySettings.soundEnabled) {
      playSound('victory-fanfare');
    }

    celebrationTimeout = setTimeout(() => {
      celebratingGoal = null;
    }, 5500);
  }

  async function fetchRules() {
    try {
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          rules = data;
        }
      }
    } catch {}
  }

  async function fetchOverlaySettings() {
    try {
      const res = await fetch('/api/overlay-settings');
      if (res.ok) {
        const data = await res.json();
        overlaySettings = { ...DEFAULT_OVERLAY_SETTINGS, ...data };
        rewardsDisplayMode = overlaySettings.rewardsMode || 'both';
        setMasterVolume(overlaySettings.masterVolume);
        setMuted(!overlaySettings.soundEnabled);
      }
    } catch {}
  }

  async function saveOverlaySettingsLive() {
    try {
      await fetch('/api/overlay-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overlaySettings),
      });
      setMasterVolume(overlaySettings.masterVolume);
      setMuted(!overlaySettings.soundEnabled);
    } catch {}
  }

  function handleIncomingPacket(packet: any) {
    if (!packet || !packet.type) return;

    if (packet.type === 'INITIAL_RULES' || packet.type === 'RULES_UPDATED') {
      if (Array.isArray(packet.payload) && packet.payload.length > 0) {
        rules = packet.payload;
      }
    } else if (packet.type === 'INITIAL_OVERLAY_SETTINGS' || packet.type === 'OVERLAY_SETTINGS_UPDATED') {
      if (packet.payload) {
        overlaySettings = { ...overlaySettings, ...packet.payload };
        rewardsDisplayMode = overlaySettings.rewardsMode || 'both';
        setMasterVolume(overlaySettings.masterVolume);
        setMuted(!overlaySettings.soundEnabled);
      }
    } else if (packet.type === 'INITIAL_GOALS') {
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
      let accentColor = currentTheme.accent1;

      switch (event.type) {
        case 'gift': {
          icon = '🎁';
          accentColor = currentTheme.accent2;
          const giftName = event.metadata?.giftName || 'Gift';
          const repeat = event.metadata?.repeatCount || 1;
          subtitle = `sent ${giftName} ${repeat > 1 ? `x${repeat}` : ''} (${event.value} 💎)`;

          triggerAlert({
            id: event.id,
            title: repeat > 1 ? `GIFT STREAK x${repeat}!` : `🎁 ${giftName.toUpperCase()} ENVIADO!`,
            sender: user.displayName,
            giftName,
            value: event.value,
            icon: giftName === 'Lion' ? '🦁' : giftName === 'Rose' ? '🌹' : giftName === 'Money Gun' ? '💸' : '🍦',
            color: accentColor,
          });

          updateLeaderboard(user.displayName, event.value);
          break;
        }
        case 'like': {
          icon = '❤️';
          accentColor = currentTheme.accent3;
          subtitle = `sent ${event.metadata?.likeCount || 1} likes!`;
          if (overlaySettings.soundEnabled && Math.random() > 0.6) {
            playSound('heart-pop', 0.4);
          }
          break;
        }
        case 'follow': {
          icon = '⭐';
          accentColor = currentTheme.accent3;
          subtitle = 'started following the stream!';
          triggerAlert({
            id: event.id,
            title: '⭐ NEW FOLLOWER!',
            sender: user.displayName,
            value: event.value,
            icon: '⭐',
            color: accentColor,
            viewerFeedback: {
              title: '⭐ NEW FOLLOWER!',
              description: `Welcome ${user.displayName}! Streamer gained Speed boost!`,
              bannerColor: currentTheme.accent3,
              soundEffect: 'powerup-level',
            },
          });
          break;
        }
        case 'comment': {
          icon = '💬';
          accentColor = currentTheme.accent1;
          subtitle = event.metadata?.text || 'said hello';
          break;
        }
        case 'share': {
          icon = '🚀';
          accentColor = currentTheme.accent2;
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

      // Update current active alert with in-game consequence & command
      if (activeAlert && activeAlert.id === action.correlationId) {
        activeAlert = {
          ...activeAlert,
          command: action.command,
          icon: action.icon || activeAlert.icon,
          imageUrl: action.imageUrl || activeAlert.imageUrl,
          color: action.viewerFeedback?.bannerColor || activeAlert.color,
          title: action.viewerFeedback?.title || activeAlert.title,
          viewerFeedback: action.viewerFeedback || activeAlert.viewerFeedback,
        };
      } else if (!activeAlert && action.command) {
        triggerAlert({
          id: action.correlationId,
          title: action.viewerFeedback?.title || '⚡ IN-GAME ACTION!',
          sender: 'TopSupporter',
          value: 10,
          command: action.command,
          icon: action.icon || '⚡',
          imageUrl: action.imageUrl,
          color: action.viewerFeedback?.bannerColor || currentTheme.accent1,
          viewerFeedback: action.viewerFeedback,
        });
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

  function toggleRewardsMode() {
    if (rewardsDisplayMode === 'both') rewardsDisplayMode = 'ticker';
    else if (rewardsDisplayMode === 'ticker') rewardsDisplayMode = 'menu';
    else if (rewardsDisplayMode === 'menu') rewardsDisplayMode = 'off';
    else rewardsDisplayMode = 'both';
    overlaySettings.rewardsMode = rewardsDisplayMode;
    void saveOverlaySettingsLive();
  }

  // Simulated triggers for preview / testing
  function testGift(name: string, diamonds: number, icon: string) {
    const testId = `mock-gift-${Date.now()}`;
    handleIncomingPacket({
      type: 'CHAOS_EVENT',
      payload: {
        id: testId,
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
        correlationId: testId,
        actionType: 'execute_command',
        icon,
        command:
          name === 'Lion'
            ? 'execute at @p run summon creeper ~ ~ ~ {powered:1b}'
            : name === 'Money Gun'
              ? 'execute at @p run summon tnt ~ ~2 ~ {Fuse:40}'
              : 'execute at @p run summon zombie ~ ~ ~',
        viewerFeedback: {
          title:
            name === 'Lion'
              ? '🦁 KING OF THE JUNGLE: LION!'
              : name === 'Rose'
                ? '🌹 ROSE SHOWER!'
                : name === 'Money Gun'
                  ? '💸 MONEY GUN TNT EXPLOSION!'
                  : '🍦 ICE CREAM ALERT!',
          description: `HeroGamer sent ${name}! In-game action unleashed!`,
          bannerColor: name === 'Lion' ? '#f59e0b' : name === 'Rose' ? '#f43f5e' : name === 'Money Gun' ? '#10b981' : '#06b6d4',
          soundEffect: name === 'Lion' ? 'monster-roar' : name === 'Money Gun' ? 'tnt-boom' : 'chime-diamond',
        },
      },
    });
  }

  function testLike() {
    handleIncomingPacket({
      type: 'CHAOS_EVENT',
      payload: {
        id: `mock-like-${Date.now()}`,
        type: 'like',
        user: { id: 'u2', displayName: 'TapperFan' },
        value: 100,
        metadata: { likeCount: 100 },
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
    void fetchRules();
    void fetchOverlaySettings();

    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1') {
      showControls = true;
    }
    if (params.get('simulation') === '1' || params.get('sim') === '1') {
      isSimulation = true;
      toggleAutoSimulation();
    }
    if (params.get('layout')) {
      const l = params.get('layout') as OverlayLayout;
      if (['landscape', 'vertical', 'compact', 'modular'].includes(l)) {
        overlaySettings.layout = l;
      }
    }
    if (params.get('modular')) {
      modularMode = params.get('modular') || '';
    }
    if (params.get('theme')) {
      const t = params.get('theme') as OverlayTheme;
      if (THEME_PALETTES[t]) {
        overlaySettings.theme = t;
      }
    }
    if (params.get('scale')) {
      const s = parseFloat(params.get('scale') || '1');
      if (!isNaN(s)) overlaySettings.scale = s;
    }
    if (params.get('volume')) {
      const v = parseFloat(params.get('volume') || '0.8');
      if (!isNaN(v)) {
        overlaySettings.masterVolume = v;
        setMasterVolume(v);
      }
    }
    if (params.get('muted') === '1') {
      overlaySettings.soundEnabled = false;
      setMuted(true);
    }
    if (params.get('rewards')) {
      const r = params.get('rewards') as any;
      if (['both', 'ticker', 'menu', 'off'].includes(r)) {
        rewardsDisplayMode = r;
        overlaySettings.rewardsMode = r;
      }
    }

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
      if (simInterval) clearInterval(simInterval);
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
<div
  class="overlay-root layout-{overlaySettings.layout} theme-{overlaySettings.theme} {isSimulation ? 'simulation-active' : ''} {modularMode ? `modular-${modularMode}` : ''}"
  id="chaos-overlay-container"
  style="
    --theme-accent-1: {currentTheme.accent1};
    --theme-accent-2: {currentTheme.accent2};
    --theme-accent-3: {currentTheme.accent3};
    --theme-bg-glass: {currentTheme.bgGlass};
    --theme-border-glow: {currentTheme.borderGlow};
    --ui-scale: {overlaySettings.scale};
    --marquee-speed: {overlaySettings.marqueeSpeedSeconds}s;
    --glass-opacity: {overlaySettings.glassIntensity};
    --glow-opacity: {overlaySettings.glowIntensity};
  "
>
  <!-- Simulation Mode Floating Control Bar -->
  {#if isSimulation}
    <div class="sim-floating-bar glass-panel" id="simulation-bar">
      <div class="sim-title">
        <span class="sim-dot">🔴</span>
        <strong>VISTA DEL ESPECTADOR (Stream Simulado)</strong>
      </div>
      <div class="sim-actions">
        <button
          class="sim-btn {isAutoSimulating ? 'active-sim' : ''}"
          onclick={toggleAutoSimulation}
        >
          {isAutoSimulating ? '⏸️ Pausar Simulación' : '▶️ Auto-Simular'}
        </button>
        <button class="sim-btn" onclick={() => { testGift('Rose', 1, '🌹'); spawnFloatingHeart('🌹'); }}>
          🌹 Rosa
        </button>
        <button class="sim-btn" onclick={() => { testGift('Ice Cream', 30, '🍦'); spawnFloatingHeart('🍦'); }}>
          🍦 Helado
        </button>
        <button class="sim-btn" onclick={() => { testGift('Money Gun', 500, '💸'); spawnFloatingHeart('💸'); }}>
          💸 Money Gun
        </button>
        <button class="sim-btn mega-btn" onclick={() => { testGift('Lion', 29999, '🦁'); spawnFloatingHeart('🦁'); }}>
          🦁 León Boss
        </button>
        <button class="sim-btn" onclick={testLike}>
          ❤️ +Likes
        </button>
        <button class="sim-btn exit-btn" onclick={() => { isSimulation = false; if (isAutoSimulating) toggleAutoSimulation(); }}>
          ❌ Salir
        </button>
      </div>
    </div>

    <!-- Floating TikTok Hearts -->
    <div class="floating-hearts-layer">
      {#each floatingHearts as h (h.id)}
        <div class="floating-heart-item" style="left: {h.left}%;">
          {h.emoji}
        </div>
      {/each}
    </div>

    <!-- Viewer Count HUD Badge -->
    <div class="viewer-count-pill glass-panel">
      <span class="live-dot-pulse">🔴</span>
      <span class="viewer-text">1.8K Viewers</span>
      <span class="streamer-handle">@SacredNOBLEYT</span>
    </div>
  {/if}

  <!-- Modular Mode: Goal Only -->
  {#if modularMode === 'goal'}
    <div class="modular-goal-container">
      {#if goals.length > 0}
        {@const activeGoal = goals[0]}
        <div class="goal-widget modular-goal-box glass-panel">
          <div class="goal-label-row">
            <span class="goal-name">{activeGoal?.name}</span>
            <span class="goal-counts">
              <strong>{activeGoal?.currentValue}</strong> / {activeGoal?.targetValue}
              <span class="goal-percent">({activeGoal?.percent}%)</span>
            </span>
          </div>
          <div class="goal-track">
            <div class="goal-fill" style="width: {activeGoal?.percent}%;">
              <div class="goal-shimmer"></div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  <!-- Modular Mode: Ticker Only -->
  {:else if modularMode === 'ticker'}
    <div class="modular-ticker-container">
      <div class="rewards-marquee-ticker glass-panel">
        <div class="marquee-badge">
          <span class="badge-icon">🎁</span>
          <span>GIFT ACTIONS</span>
        </div>
        <div class="marquee-wrapper">
          <div class="marquee-track">
            {#each activeRewards as r (r.id + '-mod1')}
              <div class="marquee-item" style="--item-color: {r.color}">
                <span class="item-icon">{r.icon}</span>
                <span class="item-name">{r.giftName}</span>
                <span class="item-cost">({r.cost} 💎)</span>
                <span class="item-arrow">➔</span>
                <span class="item-reward">{r.rewardText}</span>
              </div>
            {/each}
            {#each activeRewards as r (r.id + '-mod2')}
              <div class="marquee-item" style="--item-color: {r.color}">
                <span class="item-icon">{r.icon}</span>
                <span class="item-name">{r.giftName}</span>
                <span class="item-cost">({r.cost} 💎)</span>
                <span class="item-arrow">➔</span>
                <span class="item-reward">{r.rewardText}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  <!-- Standard Full Overlay / Vertical TikTok Live Studio Overlay -->
  {:else}
    <!-- Top Header Status Bar -->
    {#if overlaySettings.goalPosition !== 'hidden'}
      <header class="status-bar glass-panel" id="overlay-status-bar">
        <div class="status-pill">
          <span class="indicator-dot {isConnected ? 'connected' : 'disconnected'}"></span>
          <span class="status-text">{isConnected ? 'LIVE OVERLAY' : 'CONNECTING...'}</span>
        </div>

        <!-- Community Goal Progress Bar (Centered in header) -->
        {#if goals.length > 0 && overlaySettings.goalPosition === 'top'}
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

        <!-- Quick Live Customizer Button -->
        <button
          class="customizer-toggle-btn"
          onclick={() => (showStudioDrawer = !showStudioDrawer)}
          title="Open Quick Live Customizer Drawer"
        >
          🎨 Customize
        </button>

        <!-- Simulation Mode Toggle Button -->
        <button
          class="sim-mode-toggle-btn {isSimulation ? 'sim-on' : ''}"
          onclick={() => {
            isSimulation = !isSimulation;
            if (isSimulation && !isAutoSimulating) toggleAutoSimulation();
            else if (!isSimulation && isAutoSimulating) toggleAutoSimulation();
          }}
          title="Toggle Realistic Minecraft Live Stream Simulation"
        >
          🎬 {isSimulation ? 'Exit Sim' : 'Simulate'}
        </button>

        <!-- Rewards View Toggle Pill for Streamer -->
        <button
          class="rewards-toggle-btn"
          onclick={toggleRewardsMode}
          title="Toggle Rewards HUD Display (Both, Ticker, Menu, Off)"
        >
          🎁 Rewards: <span class="mode-val">{rewardsDisplayMode.toUpperCase()}</span>
        </button>

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
    {/if}

    <!-- Left / Feed Column -->
    {#if overlaySettings.feedPosition !== 'hidden'}
      <aside class="event-feed-container feed-pos-{overlaySettings.feedPosition}" id="overlay-event-feed">
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
    {/if}

    <!-- Center: Big Animated Alert Banner with Sound & Consequence Highlight -->
    {#if activeAlert}
      <div class="grand-alert-wrapper" id="grand-alert-box">
        <div class="grand-alert-card glass-panel" style="--alert-color: {activeAlert.color}">
          <div class="alert-shimmer"></div>
          <div class="alert-icon-ring">
            {#if activeAlert.imageUrl}
              <img src={activeAlert.imageUrl} alt={activeAlert.giftName || 'Alert'} class="alert-img" />
            {:else}
              <span class="alert-icon">{activeAlert.icon}</span>
            {/if}
          </div>
          <div class="alert-content">
            <h2 class="alert-banner-tag">{activeAlert.title}</h2>
            <h1 class="alert-sender-name">{activeAlert.sender}</h1>
            {#if activeAlert.giftName}
              <p class="alert-gift-detail">
                Sent <strong style="color: var(--alert-color);">{activeAlert.giftName}</strong> ({activeAlert.value} 💎)
              </p>
            {/if}

            <!-- High-visibility Viewer Reward Highlight Box -->
            <div class="alert-reward-box">
              <div class="reward-box-label">🎮 IN-GAME REWARD TRIGGERED:</div>
              <div class="reward-box-desc">
                {activeAlert.viewerFeedback?.description || `${activeAlert.sender} unleashed an action in Minecraft!`}
              </div>
            </div>

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
            <span>🎮 Spawning Boss Battle in Minecraft!</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Right Sidebar (Leaderboard + StreamToEarn Gift Rewards Menu Board) -->
    <aside class="right-sidebar-container sidebar-pos-{overlaySettings.leaderboardPosition}" id="overlay-right-sidebar">
      <!-- Top Supporters Leaderboard -->
      {#if overlaySettings.leaderboardPosition !== 'hidden'}
        <div class="leaderboard-container glass-panel" id="overlay-leaderboard">
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
        </div>
      {/if}

      <!-- STREAMTOEARN GIFT REWARDS MENU BOARD -->
      {#if rewardsDisplayMode === 'both' || rewardsDisplayMode === 'menu'}
        <div class="rewards-menu-card glass-panel" id="overlay-rewards-menu">
          <div class="rewards-menu-header">
            <div class="header-title-wrap">
              <span class="menu-icon">🎁</span>
              <span class="menu-title">GIFT REWARDS</span>
            </div>
            <span class="live-tag">LIVE HUD</span>
          </div>

          <div class="rewards-list-scroll">
            {#each activeRewards as r (r.id)}
              <div class="reward-item-row" style="--reward-accent: {r.color}">
                <div class="reward-icon-box">
                  {#if r.imageUrl}
                    <img src={r.imageUrl} alt={r.giftName} class="reward-img" />
                  {:else}
                    <span class="reward-emoji">{r.icon}</span>
                  {/if}
                </div>
                <div class="reward-info">
                  <div class="reward-top">
                    <span class="gift-name">{r.giftName}</span>
                    <span class="cost-badge">{r.cost} 💎</span>
                  </div>
                  <div class="reward-action-text">{r.rewardText}</div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </aside>

    <!-- Bottom: StreamToEarn Animated Marquee Ticker -->
    <footer class="bottom-hud-row" id="overlay-bottom-hud">
      {#if rewardsDisplayMode === 'both' || rewardsDisplayMode === 'ticker'}
        <!-- StreamToEarn Infinite Rewards Marquee Ticker -->
        <div class="rewards-marquee-ticker glass-panel" id="rewards-marquee">
          <div class="marquee-badge">
            <span class="badge-icon">🎁</span>
            <span>GIFT ACTIONS</span>
          </div>

          <div class="marquee-wrapper">
            <div class="marquee-track">
              {#each activeRewards as r (r.id + '-1')}
                <div class="marquee-item" style="--item-color: {r.color}">
                  <span class="item-icon">{r.icon}</span>
                  <span class="item-name">{r.giftName}</span>
                  <span class="item-cost">({r.cost} 💎)</span>
                  <span class="item-arrow">➔</span>
                  <span class="item-reward">{r.rewardText}</span>
                </div>
              {/each}
              {#each activeRewards as r (r.id + '-2')}
                <div class="marquee-item" style="--item-color: {r.color}">
                  <span class="item-icon">{r.icon}</span>
                  <span class="item-name">{r.giftName}</span>
                  <span class="item-cost">({r.cost} 💎)</span>
                  <span class="item-arrow">➔</span>
                  <span class="item-reward">{r.rewardText}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {:else if recentActions.length > 0}
        <!-- Standard Action Ticker if marquee is off -->
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
    </footer>
  {/if}

  <!-- Live Quick Customizer Studio Drawer -->
  {#if showStudioDrawer}
    <div class="studio-drawer glass-panel" id="live-studio-drawer">
      <div class="drawer-header">
        <div class="drawer-title">
          <span>🎨</span>
          <strong>Live Overlay Studio</strong>
        </div>
        <button class="drawer-close-btn" onclick={() => (showStudioDrawer = false)}>✕</button>
      </div>

      <div class="drawer-content">
        <div class="drawer-group">
          <label for="drawer-layout">Layout Orientation</label>
          <select id="drawer-layout" bind:value={overlaySettings.layout} onchange={saveOverlaySettingsLive} class="styled-select">
            <option value="landscape">🖥️ 16:9 Landscape (OBS Studio)</option>
            <option value="vertical">📱 9:16 Portrait (TikTok Live Studio)</option>
            <option value="compact">🧩 Compact Minimalist</option>
          </select>
        </div>

        <div class="drawer-group">
          <label for="drawer-theme">Theme Palette</label>
          <select id="drawer-theme" bind:value={overlaySettings.theme} onchange={saveOverlaySettingsLive} class="styled-select">
            {#each Object.entries(THEME_PALETTES) as [id, theme]}
              <option value={id}>{theme.name}</option>
            {/each}
          </select>
        </div>

        <div class="drawer-group">
          <label for="drawer-scale">UI Scale: <strong>{Math.round(overlaySettings.scale * 100)}%</strong></label>
          <input id="drawer-scale" type="range" min="0.7" max="1.4" step="0.05" bind:value={overlaySettings.scale} oninput={saveOverlaySettingsLive} class="styled-range" />
        </div>

        <div class="drawer-group">
          <label for="drawer-volume">Audio Volume: <strong>{Math.round(overlaySettings.masterVolume * 100)}%</strong></label>
          <input
            id="drawer-volume"
            type="range"
            min="0"
            max="1"
            step="0.05"
            bind:value={overlaySettings.masterVolume}
            oninput={() => { setMasterVolume(overlaySettings.masterVolume); void saveOverlaySettingsLive(); }}
            class="styled-range"
          />
        </div>

        <div class="drawer-group">
          <label for="drawer-rewards">Rewards Menu Display</label>
          <select id="drawer-rewards" bind:value={overlaySettings.rewardsMode} onchange={() => { rewardsDisplayMode = overlaySettings.rewardsMode; void saveOverlaySettingsLive(); }} class="styled-select">
            <option value="both">🎁 Both Board & Marquee</option>
            <option value="ticker">⚡ Bottom Marquee Only</option>
            <option value="menu">📋 Sidebar Board Only</option>
            <option value="off">🚫 Hide Rewards</option>
          </select>
        </div>

        <div class="drawer-actions">
          <button class="drawer-btn sound-btn" onclick={() => playSound('chime-diamond')}>🔊 Test Chime</button>
          <button class="drawer-btn sound-btn" onclick={() => playSound('victory-fanfare')}>🏆 Test Fanfare</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Floating Test Controls Toggle -->
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
        <button onclick={() => testGift('Rose', 1, '🌹')}>🌹 Test Rose (1 💎)</button>
        <button onclick={() => testGift('Ice Cream', 30, '🍦')}>🍦 Test Ice Cream (30 💎)</button>
        <button onclick={() => testGift('Money Gun', 500, '💸')}>💸 Test Money Gun (500 💎)</button>
        <button onclick={() => testGift('Lion', 29999, '🦁')}>🦁 Test Lion (29,999 💎)</button>
        <button onclick={testLike}>❤️ Test Likes</button>
        <button class="goal-test-btn" onclick={testCompleteGoal}>🏆 Complete Goal</button>
        <button class="mode-test-btn" onclick={toggleRewardsMode}>
          🎁 Display: {rewardsDisplayMode.toUpperCase()}
        </button>
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
    grid-template-columns: 340px 1fr 320px;
    grid-template-rows: 60px 1fr 54px;
    gap: 20px;
    transition: background 0.4s ease;
    transform: scale(var(--ui-scale, 1.0));
    transform-origin: top left;
  }

  /* TikTok Live Studio 9:16 Vertical Portrait Layout */
  .overlay-root.layout-vertical {
    grid-template-columns: 1fr;
    grid-template-rows: 56px auto 1fr auto 50px;
    padding: 16px;
    gap: 12px;
  }

  .overlay-root.layout-vertical .status-bar {
    grid-column: 1;
    grid-row: 1;
  }

  .overlay-root.layout-vertical .event-feed-container {
    grid-column: 1;
    grid-row: 2;
    max-height: 180px;
  }

  .overlay-root.layout-vertical .right-sidebar-container {
    grid-column: 1;
    grid-row: 4;
    max-height: 240px;
  }

  .overlay-root.layout-vertical .bottom-hud-row {
    grid-column: 1;
    grid-row: 5;
  }

  /* Modular Views */
  .modular-goal-container {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .modular-goal-box {
    width: 90vw;
    max-width: 800px;
    padding: 16px 24px;
  }

  .modular-ticker-container {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-end;
    height: 100%;
  }

  /* Simulation Mode Styles */
  .overlay-root.simulation-active {
    background: linear-gradient(rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.35)),
      url('/minecraft_bg.jpg') center/cover no-repeat !important;
  }

  .sim-floating-bar {
    position: absolute;
    top: 6px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 6px 18px;
    border-radius: 30px;
    border: 1px solid var(--theme-accent-1, #00f0ff);
    background: var(--theme-bg-glass, rgba(10, 15, 30, 0.88));
    box-shadow: 0 4px 25px rgba(0, 0, 0, 0.7), 0 0 15px var(--theme-border-glow, rgba(0, 240, 255, 0.25));
    animation: slideDown 0.3s ease;
  }

  .sim-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--theme-accent-1, #00f0ff);
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .sim-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sim-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .sim-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
  }

  .sim-btn.active-sim {
    background: rgba(16, 185, 129, 0.3);
    border-color: #10b981;
    color: #10b981;
  }

  .sim-btn.mega-btn {
    background: rgba(245, 158, 11, 0.25);
    border-color: #f59e0b;
    color: #f59e0b;
  }

  .sim-btn.exit-btn {
    background: rgba(244, 63, 94, 0.2);
    border-color: #f43f5e;
    color: #f43f5e;
  }

  .sim-mode-toggle-btn {
    background: rgba(0, 240, 255, 0.1);
    border: 1px solid var(--theme-accent-1, #00f0ff);
    color: var(--theme-accent-1, #00f0ff);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .sim-mode-toggle-btn.sim-on {
    background: var(--theme-accent-1, #00f0ff);
    color: #000000;
    box-shadow: 0 0 12px var(--theme-accent-1, rgba(0, 240, 255, 0.5));
  }

  .customizer-toggle-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ffffff;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .customizer-toggle-btn:hover {
    background: var(--theme-accent-1, #00f0ff);
    color: #000000;
  }

  .viewer-count-pill {
    position: absolute;
    top: 86px;
    left: 24px;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .live-dot-pulse {
    font-size: 8px;
    animation: pulseGlow 1.5s infinite;
  }

  .viewer-text {
    color: #ffffff;
  }

  .streamer-handle {
    color: var(--theme-accent-1, #00f0ff);
    font-family: var(--font-mono);
  }

  .floating-hearts-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 80;
  }

  .floating-heart-item {
    position: absolute;
    bottom: 80px;
    font-size: 26px;
    animation: floatHeart 2.2s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.6));
  }

  @keyframes floatHeart {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.6) rotate(0deg);
    }
    15% {
      opacity: 1;
      transform: translateY(-40px) scale(1.2) rotate(-8deg);
    }
    50% {
      transform: translateY(-160px) scale(1) rotate(10deg);
    }
    100% {
      opacity: 0;
      transform: translateY(-340px) scale(0.8) rotate(-15deg);
    }
  }

  @keyframes slideDown {
    from {
      transform: translate(-50%, -20px);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0);
      opacity: 1;
    }
  }

  /* Status Bar */
  .status-bar {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;
    height: 52px;
    gap: 16px;
    background: var(--theme-bg-glass, rgba(13, 17, 23, 0.85));
    border-color: var(--theme-border-glow, rgba(255, 255, 255, 0.1));
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
    max-width: 480px;
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
    color: var(--theme-accent-1, #00f0ff);
  }

  .goal-percent {
    color: var(--theme-accent-3, #10b981);
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
    background: linear-gradient(90deg, var(--theme-accent-3, #10b981), var(--theme-accent-1, #00f0ff));
    box-shadow: 0 0 12px var(--theme-border-glow, rgba(6, 182, 212, 0.5));
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

  .rewards-toggle-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--text-main);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .rewards-toggle-btn:hover {
    background: rgba(0, 240, 255, 0.15);
    border-color: var(--theme-accent-1, #00f0ff);
  }

  .mode-val {
    color: var(--theme-accent-1, #00f0ff);
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
    color: var(--theme-accent-1, #00f0ff);
    font-weight: 700;
  }

  .dashboard-launcher-btn {
    background: rgba(0, 240, 255, 0.12);
    border: 1px solid rgba(0, 240, 255, 0.3);
    color: var(--theme-accent-1, #00f0ff);
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
    background: var(--theme-accent-1, #00f0ff);
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
    background: var(--theme-bg-glass, rgba(13, 17, 23, 0.85));
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
    padding: 32px 44px;
    min-width: 500px;
    border: 2px solid var(--alert-color);
    box-shadow: 0 0 50px rgba(0, 0, 0, 0.85), 0 0 30px var(--alert-color);
    background: var(--theme-bg-glass, rgba(15, 23, 42, 0.94));
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
    margin-bottom: 14px;
    box-shadow: 0 0 20px var(--alert-color);
  }

  .alert-banner-tag {
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.2em;
    color: var(--alert-color);
    margin-bottom: 4px;
  }

  .alert-sender-name {
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 900;
    color: #ffffff;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
  }

  .alert-img {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
  }

  .alert-gift-detail {
    font-size: 14px;
    color: #cbd5e1;
    margin-top: 4px;
  }

  /* High-visibility Viewer Reward Highlight Box */
  .alert-reward-box {
    margin-top: 12px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--alert-color);
    border-left: 4px solid var(--alert-color);
    padding: 10px 16px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
  }

  .reward-box-label {
    font-size: 11px;
    font-weight: 800;
    color: var(--alert-color);
    letter-spacing: 0.08em;
  }

  .reward-box-desc {
    font-size: 14px;
    font-weight: 700;
    color: #ffffff;
  }

  .alert-command-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 16px;
    border-radius: 20px;
    margin-top: 14px;
    font-family: var(--font-mono);
    font-size: 12px;
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

  /* Right Sidebar (Leaderboard + Rewards Board) */
  .right-sidebar-container {
    grid-column: 3;
    grid-row: 2;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: hidden;
  }

  .leaderboard-container {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 220px;
    background: var(--theme-bg-glass, rgba(13, 17, 23, 0.85));
  }

  .leaderboard-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }

  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  .leaderboard-empty {
    font-size: 11px;
    color: var(--text-dim);
    text-align: center;
    padding: 12px 0;
  }

  .leaderboard-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.03);
    font-size: 12px;
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
    color: var(--theme-accent-1, #00f0ff);
    font-size: 11px;
  }

  .secondary-goal-widget {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .goal-name-small {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-main);
  }

  .goal-percent-small {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--theme-accent-3, #10b981);
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

  /* STREAMTOEARN GIFT REWARDS MENU BOARD */
  .rewards-menu-card {
    flex: 1;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 220px;
    overflow: hidden;
    background: var(--theme-bg-glass, rgba(13, 17, 23, 0.85));
  }

  .rewards-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }

  .header-title-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .menu-icon {
    font-size: 14px;
  }

  .menu-title {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--theme-accent-1, #00f0ff);
  }

  .live-tag {
    font-size: 9px;
    font-weight: 800;
    background: rgba(0, 240, 255, 0.15);
    color: var(--theme-accent-1, #00f0ff);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .rewards-list-scroll {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    flex: 1;
    padding-right: 2px;
  }

  .reward-item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-left: 3px solid var(--reward-accent, #00f0ff);
    transition: transform 0.2s ease;
  }

  .reward-item-row:hover {
    transform: translateX(3px);
    background: rgba(255, 255, 255, 0.05);
  }

  .reward-icon-box {
    font-size: 18px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reward-img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    border-radius: 4px;
  }

  .reward-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .reward-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .gift-name {
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
  }

  .cost-badge {
    font-size: 10px;
    font-weight: 800;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .reward-action-text {
    font-size: 11px;
    font-weight: 600;
    color: var(--theme-accent-1, #38bdf8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Bottom Row: StreamToEarn Infinite Rewards Marquee */
  .bottom-hud-row {
    grid-column: 1 / -1;
    grid-row: 3;
    display: flex;
    align-items: center;
  }

  .rewards-marquee-ticker {
    width: 100%;
    height: 44px;
    display: flex;
    align-items: center;
    padding: 0 16px;
    overflow: hidden;
    gap: 16px;
    background: var(--theme-bg-glass, rgba(13, 17, 23, 0.85));
  }

  .marquee-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--theme-accent-1, #00f0ff);
    background: rgba(0, 240, 255, 0.15);
    border: 1px solid var(--theme-border-glow, rgba(0, 240, 255, 0.3));
    padding: 4px 10px;
    border-radius: 6px;
    white-space: nowrap;
    z-index: 2;
  }

  .marquee-wrapper {
    flex: 1;
    overflow: hidden;
    position: relative;
    mask-image: linear-gradient(to right, transparent, black 4%, black 96%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 4%, black 96%, transparent);
  }

  .marquee-track {
    display: flex;
    align-items: center;
    gap: 24px;
    width: max-content;
    animation: marqueeScroll var(--marquee-speed, 28s) linear infinite;
  }

  .marquee-track:hover {
    animation-play-state: paused;
  }

  .marquee-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-left: 3px solid var(--item-color, #00f0ff);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    white-space: nowrap;
  }

  .item-icon {
    font-size: 14px;
  }

  .item-name {
    font-weight: 700;
    color: #f8fafc;
  }

  .item-cost {
    font-size: 11px;
    font-weight: 700;
    color: #f59e0b;
  }

  .item-arrow {
    color: #64748b;
    font-weight: 800;
  }

  .item-reward {
    font-weight: 700;
    color: var(--theme-accent-1, #00f0ff);
  }

  @keyframes marqueeScroll {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(-50%);
    }
  }

  /* Action Ticker */
  .action-ticker {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 20px;
    overflow: hidden;
    height: 44px;
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

  /* Live Quick Customizer Studio Drawer */
  .studio-drawer {
    position: fixed;
    top: 60px;
    right: 20px;
    width: 320px;
    z-index: 1000;
    padding: 16px;
    border: 1px solid var(--theme-accent-1, #00f0ff);
    background: rgba(10, 15, 30, 0.95);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px var(--theme-border-glow, rgba(0, 240, 255, 0.3));
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: slideInRight 0.3s ease;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 8px;
  }

  .drawer-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--theme-accent-1, #00f0ff);
  }

  .drawer-close-btn {
    background: transparent;
    border: none;
    color: var(--text-dim);
    font-size: 14px;
    cursor: pointer;
  }

  .drawer-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .drawer-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .drawer-group label {
    font-size: 11px;
    font-weight: 700;
    color: #cbd5e1;
  }

  .drawer-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 6px;
  }

  .drawer-btn {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #ffffff;
    padding: 6px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .drawer-btn:hover {
    background: var(--theme-accent-1, #00f0ff);
    color: #000000;
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

  .mode-test-btn {
    border-color: rgba(0, 240, 255, 0.4) !important;
    color: #00f0ff !important;
  }
</style>
