import type { GameAdapter } from '@chaos-live/core';
import {
  EventEngine,
  InMemoryPriorityQueue,
  RuleEvaluator,
  GoalEngine,
  SessionLeaderboard,
  recordProcessedEvent,
  closePrismaClient,
} from '@chaos-live/core';
import { TikTokAdapter } from '@chaos-live/adapter-tiktok';
import { MockAdapter } from '@chaos-live/adapter-mock';
import { RconAdapter } from '@chaos-live/adapter-minecraft-rcon';
import type {
  GameAction,
  ActionResult,
  ChaosEvent,
  OverlaySettings,
} from '@chaos-live/shared-protocol';
import { loadConfig } from './config/config.js';
import { loadOverlaySettings, saveOverlaySettings } from './config/overlay-settings.js';
import { WebSocketHub } from './server.js';
import { handleApiRequest } from './api/router.js';
import type { OverlaySettingsStore } from './api/router.js';
import { HybridGameAdapter } from './adapters/hybrid-game-adapter.js';
import { logger } from './logger.js';

/**
 * ConsoleGameAdapter
 * Logs dispatched actions to the console for testing or fallback
 * when Minecraft server is offline.
 */
class ConsoleGameAdapter implements GameAdapter {
  public readonly name = 'Console Game Adapter (Fallback)';
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
    logger.info('Console Game Adapter connected (ready to receive actions).');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    logger.info('Console Game Adapter disconnected.');
  }

  async executeAction(action: GameAction): Promise<ActionResult> {
    const start = Date.now();
    logger.info(
      {
        actionId: action.id,
        actionType: action.actionType,
        command: action.command,
        priority: action.priority,
      },
      `🎮 [GAME ACTION] Executing: "${action.command}"`,
    );

    return {
      actionId: action.id,
      success: true,
      response: `Simulated success for [${action.command}]`,
      durationMs: Date.now() - start,
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  logger.info('====================================================');
  logger.info('  Chaos-Live — Real-Time Streaming Game Middleware  ');
  logger.info('====================================================');

  const ruleEvaluator = new RuleEvaluator(config.rules);
  const queue = new InMemoryPriorityQueue({
    agingFactor: 1.5,
    rateLimits: {
      '*': { maxActions: 20, windowMs: 1000 },
      spawn_mob: { maxActions: 5, windowMs: 1000 },
    },
  });

  // Initialize community goals engine
  const goalEngine = new GoalEngine([
    {
      id: 'goal-roses-50',
      name: '🌹 50 Roses ➜ Summon Warden',
      eventType: 'gift',
      giftName: 'Rose',
      targetValue: 50,
      actionCommand: 'summon warden ~ ~ ~ {CustomName:\'"COMMUNITY BOSS: WARDEN"\'}',
      repeatable: true,
    },
    {
      id: 'goal-likes-150',
      name: '❤️ 150 Likes ➜ Diamond Party',
      eventType: 'like',
      targetValue: 150,
      actionCommand: 'give @a minecraft:diamond 5',
      repeatable: true,
    },
  ]);

  // Load persistent goals from SQLite
  await goalEngine.initFromDatabase();

  // Cache recent events in-memory to pair with action results for database persistence
  const recentEvents = new Map<string, ChaosEvent>();

  // Clasificación de la sesión. Vive aquí y no en el overlay para que recargar
  // la fuente de OBS no borre a los mayores contribuyentes.
  const sessionLeaderboard = new SessionLeaderboard();

  // Ajustes del overlay: se cargan de disco al arrancar y se reescriben en cada
  // cambio, para que lo que el streamer configure sobreviva a un reinicio.
  let overlaySettingsState: OverlaySettings = loadOverlaySettings();
  const overlaySettings: OverlaySettingsStore = {
    get: () => overlaySettingsState,
    update: (patch) => {
      overlaySettingsState = { ...overlaySettingsState, ...patch };
      try {
        saveOverlaySettings(overlaySettingsState);
      } catch {
        // Ya se registró el error; no romper el directo por no poder escribir en disco.
      }
      return overlaySettingsState;
    },
  };

  // Declare hybrid game adapter and engine references
  let hybridAdapter: HybridGameAdapter;
  let engine: EventEngine;

  /**
   * Estado inicial que recibe un overlay al conectarse.
   *
   * Lo mandan los dos hubs, asi que vive aqui: un widget servido desde la
   * superficie publica tiene que arrancar con las mismas metas, reglas,
   * ajustes y clasificacion que uno servido desde la de gestion.
   */
  const sendOverlayHandshake = (socket: import('ws').WebSocket): void => {
    socket.send(JSON.stringify({ type: 'INITIAL_GOALS', payload: goalEngine.getGoals() }));
    socket.send(JSON.stringify({ type: 'INITIAL_RULES', payload: ruleEvaluator.getRules() }));
    socket.send(
      JSON.stringify({ type: 'INITIAL_OVERLAY_SETTINGS', payload: overlaySettings.get() }),
    );
    // Reenviar la clasificacion acumulada: un overlay que se reconecta a mitad
    // del directo debe recuperar a los mayores contribuyentes.
    socket.send(
      JSON.stringify({ type: 'INITIAL_LEADERBOARD', payload: sessionLeaderboard.getTop() }),
    );
  };

  // Initialize WebSocket Hub for OBS Overlay, Fabric Mod, and REST API
  const wsHub = new WebSocketHub({
    port: config.wsPort,
    host: config.wsHost,
    onHttpRequest: (req, res) => {
      return handleApiRequest(req, res, {
        engine,
        ruleEvaluator,
        goalEngine,
        wsHub,
        queue,
        overlaySettings,
        overlayBaseUrl: `http://${config.overlayHost === '0.0.0.0' ? '127.0.0.1' : config.overlayHost}:${config.overlayPort}`,
        onInjectEvent: (event) => {
          void engine.handleEvent(event);
        },
      });
    },
    onClientConnected: (socket, client) => {
      if (client.clientType === 'overlay') {
        sendOverlayHandshake(socket);
      }
    },
    onModActionResult: (result) => {
      hybridAdapter?.handleModActionResult(result);
    },
  });

  /**
   * Superficie publica: solo el overlay.
   *
   * Es la unica que puede salir del PC (TikTok LIVE Studio necesita alcanzarla
   * para cargar cada widget como fuente Link). Sirve los estaticos, solo las
   * rutas de PUBLIC_READONLY_ROUTES y un WebSocket que unicamente emite. La API
   * de gestion y el canal del mod se quedan en `wsHub`, atado a localhost.
   */
  const overlayHub = new WebSocketHub({
    port: config.overlayPort,
    host: config.overlayHost,
    readOnly: true,
    onHttpRequest: (req, res) => {
      return handleApiRequest(req, res, {
        engine,
        ruleEvaluator,
        goalEngine,
        wsHub: overlayHub,
        queue,
        overlaySettings,
        publicOnly: true,
      });
    },
    onClientConnected: (socket) => {
      sendOverlayHandshake(socket);
    },
  });

  /**
   * Emite a los overlays de las dos superficies.
   *
   * Sustituye a los `wsHub.broadcastToOverlay` sueltos: si un evento se mandara
   * solo por el hub de gestion, los widgets que TikTok LIVE Studio carga desde
   * el puerto publico se quedarian congelados.
   */
  const broadcastToOverlays = (type: string, payload: unknown): void => {
    wsHub.broadcastToOverlay(type, payload);
    overlayHub.broadcastToOverlay(type, payload);
  };

  // Setup game adapters: Fabric Mod (primary via WS) -> Minecraft RCON (secondary) -> Console (fallback)
  let rcon: GameAdapter | undefined;
  if (config.rconEnabled && config.rconPassword) {
    rcon = new RconAdapter({
      host: config.rconHost,
      port: config.rconPort,
      password: config.rconPassword,
      timeoutMs: 5000,
      retry: { maxAttempts: 2, delayMs: 1000 },
    });
    try {
      await rcon.connect();
      logger.info('✅ Connected to Minecraft RCON server as secondary fallback.');
    } catch {
      logger.warn('⚠️  Minecraft RCON server is offline. Standby mode active.');
    }
  }

  const consoleFallback = new ConsoleGameAdapter();
  hybridAdapter = new HybridGameAdapter({
    wsHub,
    rconAdapter: rcon,
    fallbackAdapter: consoleFallback,
  });
  const gameAdapter: GameAdapter = hybridAdapter;

  let platformAdapter: TikTokAdapter | MockAdapter;
  if (config.useMock) {
    logger.info(
      { intervalMs: config.mockIntervalMs },
      '🚀 Mode: MOCK (synthetic event stream generator active)',
    );
    platformAdapter = new MockAdapter({
      autoStreamIntervalMs: config.mockIntervalMs,
    });
  } else {
    logger.info(
      { username: config.tiktokUsername },
      `🔴 Mode: LIVE TIKTOK (connecting to @${config.tiktokUsername})`,
    );
    platformAdapter = new TikTokAdapter({
      uniqueId: config.tiktokUsername,
      reconnect: { enabled: true, maxAttempts: 10 },
      circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
    });
  }

  engine = new EventEngine({
    ruleEvaluator,
    queue,
    goalEngine,
    gameAdapter,
    platformAdapters: [platformAdapter],
    // Único consumidor del stream de eventos: el motor emite cada transición y
    // aquí solo se traduce a logs y a mensajes para el overlay.
    onPipelineState: (entry) => {
      const { correlationId, state, details, action, event } = entry;
      switch (state) {
        case 'EVENT_RECEIVED':
          logger.info({ correlationId, ...details }, `📥 [${state}] New event received`);
          if (event) {
            recentEvents.set(event.id, event);
            broadcastToOverlays('CHAOS_EVENT', event);

            if (sessionLeaderboard.record(event)) {
              broadcastToOverlays('LEADERBOARD_UPDATED', sessionLeaderboard.getTop());
            }

            // Mantener la caché acotada
            if (recentEvents.size > 500) {
              const oldestKey = recentEvents.keys().next().value;
              if (oldestKey) recentEvents.delete(oldestKey);
            }
          }
          break;
        case 'GOAL_PROGRESS':
          broadcastToOverlays('GOAL_PROGRESS', details);
          break;
        case 'GOAL_COMPLETED':
          logger.info(
            { correlationId, goalName: details?.['name'], command: action?.command },
            `🎉 [${state}] Meta completada: "${details?.['name']}"`,
          );
          broadcastToOverlays('GOAL_PROGRESS', details);
          broadcastToOverlays('GOAL_COMPLETED', details);
          break;
        case 'EVENT_VALIDATED':
          logger.debug({ correlationId }, `✔️  [${state}] Payload validated`);
          break;
        case 'RULE_MATCHED':
          logger.info(
            { correlationId, ...details },
            `🎯 [${state}] Matched rule "${details?.['ruleName']}"`,
          );
          break;
        case 'RULE_NOT_MATCHED':
          logger.debug({ correlationId }, `⚪ [${state}] No matching rule found`);
          break;
        case 'RULE_COOLDOWN':
          logger.warn(
            { correlationId, ...details },
            `⏳ [${state}] Rule in cooldown "${details?.['ruleName']}"`,
          );
          break;
        case 'EVENT_QUEUED':
          logger.info(
            { correlationId, ...details },
            `📦 [${state}] Action added to priority queue (size: ${details?.['queueSize']})`,
          );
          break;
        case 'ACTION_DISPATCHED':
          logger.info(
            { correlationId, ...details },
            `⚡ [${state}] Action dispatched to ${gameAdapter.name}`,
          );
          broadcastToOverlays('ACTION_DISPATCHED', {
            correlationId,
            actionType: action?.actionType,
            command: action?.command,
            icon: action?.icon,
            imageUrl: action?.imageUrl,
            viewerFeedback: action?.viewerFeedback,
          });
          break;
        case 'EVENT_COMPLETED': {
          logger.info(
            { correlationId, ...details },
            `✅ [${state}] Completed in ${details?.['durationMs']}ms`,
          );
          const event = recentEvents.get(correlationId);
          if (event) {
            void recordProcessedEvent(event, action, {
              actionId: correlationId,
              success: true,
              durationMs: Number(details?.['durationMs'] ?? 0),
              response: String(details?.['response'] ?? ''),
            });
          }
          break;
        }
        case 'EVENT_FAILED': {
          logger.error({ correlationId, ...details }, `❌ [${state}] Event processing failed`);
          const event = recentEvents.get(correlationId);
          if (event) {
            void recordProcessedEvent(event, action, {
              actionId: correlationId,
              success: false,
              durationMs: Number(details?.['durationMs'] ?? 0),
              error: String(details?.['error'] ?? 'Unknown error'),
            });
          }
          break;
        }
      }
    },
  });

  // Graceful shutdown handlers with queue drain and timeout watchdog
  let isShuttingDown = false;

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Shutting down Chaos-Live engine...');

    // Force exit watchdog timer to prevent process hang
    const forceExitTimer = setTimeout(() => {
      logger.error('Shutdown timed out after 5000ms. Forcing exit.');
      process.exit(exitCode || 1);
    }, 5000);
    forceExitTimer.unref();

    try {
      // 1. Drain pending queue items if any (up to 2000ms)
      if (!queue.isEmpty()) {
        logger.info({ queueSize: queue.size() }, 'Draining remaining queue items before exit...');
        const drainDeadline = Date.now() + 2000;
        while (!queue.isEmpty() && Date.now() < drainDeadline) {
          await engine.processQueue();
          await new Promise((r) => setTimeout(r, 50));
        }
      }

      // 2. Stop event engine (disconnects game and platform adapters)
      await engine.stop();

      // 3. Stop WebSocket hub and HTTP server
      await wsHub.stop();
      await overlayHub.stop();

      // 4. Close database connections
      await closePrismaClient();

      logger.info('Chaos-Live terminated cleanly.');
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));

  // Process error traps
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({ err, stack: err.stack }, '🚨 Uncaught Exception detected in Chaos-Live process');
    void shutdown('uncaughtException', 1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, '⚠️ Unhandled Promise Rejection detected');
  });

  try {
    await wsHub.start();
    await overlayHub.start();
    await engine.start();
    logger.info('Chaos-Live pipeline is ACTIVE and processing events.');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start Chaos-Live pipeline');
    void shutdown('startup_failure', 1);
  }
}

bootstrap().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
