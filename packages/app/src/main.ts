import type { GameAdapter } from '@chaos-live/core';
import {
  EventEngine,
  InMemoryPriorityQueue,
  RuleEvaluator,
  GoalEngine,
  recordProcessedEvent,
  closePrismaClient,
} from '@chaos-live/core';
import { TikTokAdapter } from '@chaos-live/adapter-tiktok';
import { MockAdapter } from '@chaos-live/adapter-mock';
import { RconAdapter } from '@chaos-live/adapter-minecraft-rcon';
import type { GameAction, ActionResult, ChaosEvent } from '@chaos-live/shared-protocol';
import { loadConfig } from './config/config.js';
import { WebSocketHub } from './server.js';
import { handleApiRequest } from './api/router.js';
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

  // Declare hybrid game adapter and engine references
  let hybridAdapter: HybridGameAdapter;
  let engine: EventEngine;

  // Initialize WebSocket Hub for OBS Overlay, Fabric Mod, and REST API
  const wsHub = new WebSocketHub({
    port: config.wsPort,
    onHttpRequest: (req, res) => {
      return handleApiRequest(req, res, {
        engine,
        ruleEvaluator,
        goalEngine,
        wsHub,
        queue,
        onInjectEvent: (event) => {
          void engine.handleEvent(event);
        },
      });
    },
    onClientConnected: (socket, client) => {
      if (client.clientType === 'overlay') {
        socket.send(
          JSON.stringify({
            type: 'INITIAL_GOALS',
            payload: goalEngine.getGoals(),
          }),
        );
      }
    },
    onModActionResult: (result) => {
      hybridAdapter?.handleModActionResult(result);
    },
  });

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

  platformAdapter.onEvent((event) => {
    recentEvents.set(event.id, event);
    // Broadcast raw stream event to overlay
    wsHub.broadcastEvent(event);

    // Evaluate community goals
    void (async () => {
      const updates = await goalEngine.processEvent(event);
      for (const update of updates) {
        wsHub.broadcastToOverlay('GOAL_PROGRESS', update);
        if (update.triggeredAction) {
          logger.info(
            { goalName: update.name, command: update.triggeredAction.command },
            `🎉 [GOAL COMPLETED] Triggering reward: "${update.triggeredAction.command}"`,
          );
          wsHub.broadcastToOverlay('GOAL_COMPLETED', update);
          // Enqueue with elevated priority so the community reward executes promptly
          queue.enqueue({
            action: update.triggeredAction,
            score: 200,
            enqueuedAt: Date.now(),
          });
        }
      }
    })();

    // Keep cache bounded
    if (recentEvents.size > 500) {
      const oldestKey = recentEvents.keys().next().value;
      if (oldestKey) recentEvents.delete(oldestKey);
    }
  });

  engine = new EventEngine({
    ruleEvaluator,
    queue,
    gameAdapter,
    platformAdapters: [platformAdapter],
    onPipelineState: (entry) => {
      const { correlationId, state, timestamp, details } = entry;
      switch (state) {
        case 'EVENT_RECEIVED':
          logger.info({ correlationId, ...details }, `📥 [${state}] New event received`);
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
          wsHub.broadcastToOverlay('ACTION_DISPATCHED', {
            correlationId,
            actionType: details?.['actionType'],
            command: details?.['command'],
          });
          break;
        case 'EVENT_COMPLETED': {
          logger.info(
            { correlationId, ...details },
            `✅ [${state}] Completed in ${details?.['durationMs']}ms`,
          );
          const event = recentEvents.get(correlationId);
          if (event) {
            void recordProcessedEvent(event, undefined, {
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
            void recordProcessedEvent(event, undefined, {
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
