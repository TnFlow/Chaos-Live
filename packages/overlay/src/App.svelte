<script lang="ts">
  import { onMount } from 'svelte';
  import Dashboard from './Dashboard.svelte';
  import './styles/overlay.css';
  import GoalBar from './overlay/GoalBar.svelte';
  import EventFeed from './overlay/EventFeed.svelte';
  import AlertBanner from './overlay/AlertBanner.svelte';
  import GoalCelebration from './overlay/GoalCelebration.svelte';
  import Leaderboard from './overlay/Leaderboard.svelte';
  import RewardsBoard from './overlay/RewardsBoard.svelte';
  import MarqueeTicker from './overlay/MarqueeTicker.svelte';
  import { connectChaosSocket, type ChaosSocket } from './lib/ws-client';
  import type {
    ActionView,
    AlertView,
    FeedItem,
    GoalView,
    LeaderboardEntry,
    RewardView,
    RuleView,
  } from './lib/overlay-types';
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

  // Las formas de vista viven en ./lib/overlay-types.ts

  // State
  let isConnected = $state(false);
  let totalEventsReceived = $state(0);
  let events = $state<FeedItem[]>([]);
  let activeAlert = $state<AlertView | null>(null);
  let leaderboard = $state<LeaderboardEntry[]>([]);
  let recentActions = $state<ActionView[]>([]);
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
  let rules = $state<RuleView[]>([
    {
      id: 'rule-gift-rose',
      name: 'Regalo: Rosa',
      enabled: true,
      priority: 10,
      icon: '🌹',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Rose' }, minValue: 1 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon chicken ~ ~1 ~' },
      viewerFeedback: { title: '🌹 ROSE SHOWER!', description: 'Invoca una gallina', bannerColor: '#f43f5e', soundEffect: 'chime-diamond' },
    },
    {
      id: 'rule-gift-ice-cream',
      name: 'Regalo: Helado',
      enabled: true,
      priority: 15,
      icon: '🍦',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Ice Cream' }, minValue: 30 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon zombie ~ ~ ~' },
      viewerFeedback: { title: '🍦 ICE CREAM ALERT!', description: 'Invoca una horda de zombis', bannerColor: '#06b6d4', soundEffect: 'retro-8bit' },
    },
    {
      id: 'rule-gift-doughnut',
      name: 'Regalo: Dona',
      enabled: true,
      priority: 15,
      icon: '🍩',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Doughnut' }, minValue: 30 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon skeleton ~ ~ ~' },
      viewerFeedback: { title: '🍩 SKELETON SNIPER!', description: 'Invoca Esqueleto Sniper', bannerColor: '#f97316', soundEffect: 'retro-8bit' },
    },
    {
      id: 'rule-gift-money-gun',
      name: 'Regalo: Money Gun',
      enabled: true,
      priority: 25,
      icon: '💸',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Money Gun' }, minValue: 500 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon tnt ~ ~2 ~' },
      viewerFeedback: { title: '💸 MONEY GUN TNT!', description: 'Detona TNT Dinamita', bannerColor: '#10b981', soundEffect: 'tnt-boom' },
    },
    {
      id: 'rule-gift-lion',
      name: 'Regalo: León',
      enabled: true,
      priority: 50,
      icon: '🦁',
      matcher: { eventTypes: ['gift'], metadataMatch: { giftName: 'Lion' }, minValue: 29999 },
      action: { actionType: 'execute_command', command: 'execute at @p run summon creeper ~ ~ ~ {powered:1b}' },
      viewerFeedback: { title: '🦁 KING LION!', description: 'Invoca Creeper Cargado Jefe!', bannerColor: '#f59e0b', soundEffect: 'monster-roar' },
    },
    {
      id: 'rule-new-follow',
      name: 'Nuevo seguidor',
      enabled: true,
      priority: 5,
      icon: '⭐',
      matcher: { eventTypes: ['follow'] },
      action: { actionType: 'execute_command', command: 'effect give @p minecraft:speed 10 1' },
      viewerFeedback: { title: '⭐ ¡NUEVO SEGUIDOR!', description: 'Velocidad al Streamer', bannerColor: '#eab308', soundEffect: 'powerup-level' },
    },
    {
      id: 'rule-likes-streak',
      name: 'Racha de me gusta',
      enabled: true,
      priority: 5,
      icon: '❤️',
      matcher: { eventTypes: ['like'], minValue: 100 },
      action: { actionType: 'execute_command', command: 'execute at @p run particle heart ~ ~1 ~ 1 1 1 0.1 20' },
      viewerFeedback: { title: '❤️ 100+ LIKES!', description: 'Lluvia de Corazones', bannerColor: '#f43f5e', soundEffect: 'heart-pop' },
    },
  ]);

  // Goals state
  let goals = $state<GoalView[]>([
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

  let celebratingGoal = $state<GoalView | null>(null);
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

        let rewardText = r.viewerFeedback?.description || r.viewerFeedback?.title || r.action?.command || 'Evento en la partida';
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

  function triggerAlert(alert: AlertView) {
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

  function triggerCelebration(goal: GoalView) {
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
    } else if (packet.type === 'INITIAL_LEADERBOARD' || packet.type === 'LEADERBOARD_UPDATED') {
      // La clasificación la acumula el servidor: aquí solo se dibuja lo que
      // llega, para que recargar la fuente de OBS no borre a los mayores
      // contribuyentes.
      if (Array.isArray(packet.payload)) {
        leaderboard = packet.payload;
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

      const user: StreamUser = event.user || { id: 'anon', displayName: 'Anónimo' };
      let icon = '💬';
      let title = user.displayName;
      let subtitle = '';
      let accentColor = currentTheme.accent1;

      switch (event.type) {
        case 'gift': {
          icon = '🎁';
          accentColor = currentTheme.accent2;
          const giftName = event.metadata?.giftName || 'Regalo';
          const repeat = event.metadata?.repeatCount || 1;
          subtitle = `envió ${giftName} ${repeat > 1 ? `x${repeat}` : ''} (${event.value} 💎)`;

          triggerAlert({
            id: event.id,
            title: repeat > 1 ? `¡RACHA DE REGALOS x${repeat}!` : `🎁 ${giftName.toUpperCase()} ENVIADO!`,
            sender: user.displayName,
            giftName,
            value: event.value,
            icon: giftName === 'Lion' ? '🦁' : giftName === 'Rose' ? '🌹' : giftName === 'Money Gun' ? '💸' : '🍦',
            color: accentColor,
          });

          break;
        }
        case 'like': {
          icon = '❤️';
          accentColor = currentTheme.accent3;
          subtitle = `envió ${event.metadata?.likeCount || 1} me gusta`;
          if (overlaySettings.soundEnabled && Math.random() > 0.6) {
            playSound('heart-pop', 0.4);
          }
          break;
        }
        case 'follow': {
          icon = '⭐';
          accentColor = currentTheme.accent3;
          subtitle = 'empezó a seguir el directo';
          triggerAlert({
            id: event.id,
            title: '⭐ ¡NUEVO SEGUIDOR!',
            sender: user.displayName,
            value: event.value,
            icon: '⭐',
            color: accentColor,
            viewerFeedback: {
              title: '⭐ ¡NUEVO SEGUIDOR!',
              description: `¡Bienvenido, ${user.displayName}! El streamer gana velocidad.`,
              bannerColor: currentTheme.accent3,
              soundEffect: 'powerup-level',
            },
          });
          break;
        }
        case 'comment': {
          icon = '💬';
          accentColor = currentTheme.accent1;
          subtitle = event.metadata?.text || 'dijo hola';
          break;
        }
        case 'share': {
          icon = '🚀';
          accentColor = currentTheme.accent2;
          subtitle = 'compartió el directo';
          break;
        }
      }

      const item: FeedItem = {
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

  function toggleRewardsMode() {
    if (rewardsDisplayMode === 'both') rewardsDisplayMode = 'ticker';
    else if (rewardsDisplayMode === 'ticker') rewardsDisplayMode = 'menu';
    else if (rewardsDisplayMode === 'menu') rewardsDisplayMode = 'off';
    else rewardsDisplayMode = 'both';
    overlaySettings.rewardsMode = rewardsDisplayMode;
    void saveOverlaySettingsLive();
  }

  /**
   * Acumula una aportación simulada en la clasificación local.
   *
   * En directo la clasificación la lleva el servidor y este overlay solo la
   * dibuja. Pero la vista previa genera sus eventos aquí mismo, sin pasar por
   * el servidor, así que necesita alimentar la lista por su cuenta para que el
   * widget se pueda revisar sin estar transmitiendo.
   */
  function recordSimulatedContribution(name: string, addValue: number) {
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
    const testId = `mock-gift-${Date.now()}`;
    recordSimulatedContribution('HeroGamer', diamonds);
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

    // La reconexion la gestiona el cliente compartido con el panel.
    const socket: ChaosSocket = connectChaosSocket({
      clientType: 'overlay',
      onConnectionChange: (connected) => {
        isConnected = connected;
      },
      onPacket: handleIncomingPacket,
    });

    return () => {
      if (simInterval) clearInterval(simInterval);
      socket.close();
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
          <span>REGALOS Y EFECTOS</span>
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
          <span class="status-text">{isConnected ? 'EN DIRECTO' : 'CONECTANDO...'}</span>
        </div>

        <!-- Community Goal Progress Bar (Centered in header) -->
        {#if goals.length > 0 && overlaySettings.goalPosition === 'top'}
          <GoalBar goal={goals[0]} />
        {/if}


        <!-- Quick Live Customizer Button -->
        <button
          class="customizer-toggle-btn"
          onclick={() => (showStudioDrawer = !showStudioDrawer)}
          title="Abrir los ajustes rápidos del overlay"
        >
          🎨 Ajustes
        </button>

        <!-- Simulation Mode Toggle Button -->
        <button
          class="sim-mode-toggle-btn {isSimulation ? 'sim-on' : ''}"
          onclick={() => {
            isSimulation = !isSimulation;
            if (isSimulation && !isAutoSimulating) toggleAutoSimulation();
            else if (!isSimulation && isAutoSimulating) toggleAutoSimulation();
          }}
          title="Activar la simulación de un directo real"
        >
          🎬 {isSimulation ? 'Salir de la simulación' : 'Simular'}
        </button>

        <!-- Rewards View Toggle Pill for Streamer -->
        <button
          class="rewards-toggle-btn"
          onclick={toggleRewardsMode}
          title="Cambiar cómo se muestran las recompensas"
        >
          🎁 Recompensas: <span class="mode-val">{rewardsDisplayMode.toUpperCase()}</span>
        </button>

        <div class="stats-counter">
          <span class="counter-label">EVENTOS</span>
          <span class="counter-val">{totalEventsReceived}</span>
        </div>

        <button
          id="btn-goto-dashboard"
          class="dashboard-launcher-btn"
          onclick={() => {
            isDashboard = true;
            window.history.pushState({}, '', '/dashboard');
          }}
          title="Abrir el panel de control"
        >
          ⚙️ Panel
        </button>
      </header>
    {/if}

    <!-- Left / Feed Column -->
    {#if overlaySettings.feedPosition !== 'hidden'}
      <EventFeed {events} position={overlaySettings.feedPosition} {formatTime} />
    {/if}


    <!-- Center: Big Animated Alert Banner with Sound & Consequence Highlight -->
    {#if activeAlert}
      <AlertBanner alert={activeAlert} />
    {/if}


    <!-- Center Celebration Banner when a Community Goal is completed -->
    {#if celebratingGoal}
      <GoalCelebration goal={celebratingGoal} />
    {/if}


    <!-- Right Sidebar (Leaderboard + StreamToEarn Gift Rewards Menu Board) -->
    <aside class="right-sidebar-container sidebar-pos-{overlaySettings.leaderboardPosition}" id="overlay-right-sidebar">
      <!-- Top Supporters Leaderboard -->
      {#if overlaySettings.leaderboardPosition !== 'hidden'}
        <Leaderboard {leaderboard} secondaryGoal={goals.length > 1 ? goals[1] : undefined} />
      {/if}


      <!-- STREAMTOEARN GIFT REWARDS MENU BOARD -->
      {#if rewardsDisplayMode === 'both' || rewardsDisplayMode === 'menu'}
        <RewardsBoard rewards={activeRewards} />
      {/if}

    </aside>

    <!-- Bottom: StreamToEarn Animated Marquee Ticker -->
    <footer class="bottom-hud-row" id="overlay-bottom-hud">
      <MarqueeTicker
        rewards={activeRewards}
        {recentActions}
        showMarquee={rewardsDisplayMode === 'both' || rewardsDisplayMode === 'ticker'}
      />

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
          <label for="drawer-layout">Orientación del diseño</label>
          <select id="drawer-layout" bind:value={overlaySettings.layout} onchange={saveOverlaySettingsLive} class="styled-select">
            <option value="landscape">🖥️ Horizontal 16:9 (OBS Studio)</option>
            <option value="vertical">📱 Vertical 9:16 (TikTok Live Studio)</option>
            <option value="compact">🧩 Compacto</option>
          </select>
        </div>

        <div class="drawer-group">
          <label for="drawer-theme">Paleta de colores</label>
          <select id="drawer-theme" bind:value={overlaySettings.theme} onchange={saveOverlaySettingsLive} class="styled-select">
            {#each Object.entries(THEME_PALETTES) as [id, theme]}
              <option value={id}>{theme.name}</option>
            {/each}
          </select>
        </div>

        <div class="drawer-group">
          <label for="drawer-scale">Escala: <strong>{Math.round(overlaySettings.scale * 100)}%</strong></label>
          <input id="drawer-scale" type="range" min="0.7" max="1.4" step="0.05" bind:value={overlaySettings.scale} oninput={saveOverlaySettingsLive} class="styled-range" />
        </div>

        <div class="drawer-group">
          <label for="drawer-volume">Volumen: <strong>{Math.round(overlaySettings.masterVolume * 100)}%</strong></label>
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
          <label for="drawer-rewards">Menú de recompensas</label>
          <select id="drawer-rewards" bind:value={overlaySettings.rewardsMode} onchange={() => { rewardsDisplayMode = overlaySettings.rewardsMode; void saveOverlaySettingsLive(); }} class="styled-select">
            <option value="both">🎁 Panel y marquesina</option>
            <option value="ticker">⚡ Solo marquesina</option>
            <option value="menu">📋 Solo panel lateral</option>
            <option value="off">🚫 Ocultar recompensas</option>
          </select>
        </div>

        <div class="drawer-actions">
          <button class="drawer-btn sound-btn" onclick={() => playSound('chime-diamond')}>🔊 Probar campanita</button>
          <button class="drawer-btn sound-btn" onclick={() => playSound('victory-fanfare')}>🏆 Probar fanfarria</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Floating Test Controls Toggle -->
  <div class="preview-controls-toggle">
    <button
      class="toggle-btn"
      onclick={() => (showControls = !showControls)}
      title="Mostrar u ocultar los controles de prueba"
    >
      ⚙️
    </button>
  </div>

  {#if showControls}
    <div class="preview-controls-panel glass-panel" id="preview-controls">
      <h4>Pruebas del overlay</h4>
      <div class="control-buttons">
        <button onclick={() => testGift('Rose', 1, '🌹')}>🌹 Probar Rosa (1 💎)</button>
        <button onclick={() => testGift('Ice Cream', 30, '🍦')}>🍦 Probar Helado (30 💎)</button>
        <button onclick={() => testGift('Money Gun', 500, '💸')}>💸 Probar Money Gun (500 💎)</button>
        <button onclick={() => testGift('Lion', 29999, '🦁')}>🦁 Probar León (29.999 💎)</button>
        <button onclick={testLike}>❤️ Probar Me gusta</button>
        <button class="goal-test-btn" onclick={testCompleteGoal}>🏆 Completar meta</button>
        <button class="mode-test-btn" onclick={toggleRewardsMode}>
          🎁 Vista: {rewardsDisplayMode.toUpperCase()}
        </button>
      </div>
    </div>
  {/if}
</div>
{/if}

