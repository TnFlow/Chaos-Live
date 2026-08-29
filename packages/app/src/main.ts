import type { GameAdapter } from '@chaos-live/core';
import { EventEngine, InMemoryPriorityQueue, RuleEvaluator } from '@chaos-live/core';
import { TikTokAdapter } from '@chaos-live/adapter-tiktok';
import { MockAdapter } from '@chaos-live/adapter-mock';
import type { GameAction, ActionResult } from '@chaos-live/shared-protocol';
import { loadConfig } from './config/config.js';
import { logger } from './logger.js';

/**
 * ConsoleGameAdapter
 * Logs dispatched actions to the console for Phase 2 validation milestone
 * before Minecraft RCON is wired in Phase 3.
 */
class ConsoleGameAdapter implements GameAdapter {
  public readonly name = 'Console Game Adapter (Validation)';
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

  const gameAdapter = new ConsoleGameAdapter();

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

  const engine = new EventEngine({
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
            `⚡ [${state}] Action dispatched to game adapter`,
          );
          break;
        case 'EVENT_COMPLETED':
          logger.info(
            { correlationId, ...details },
            `✅ [${state}] Completed in ${details?.['durationMs']}ms`,
          );
          break;
        case 'EVENT_FAILED':
          logger.error({ correlationId, ...details }, `❌ [${state}] Event processing failed`);
          break;
      }
    },
  });

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down Chaos-Live engine...');
    await engine.stop();
    logger.info('Chaos-Live terminated cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await engine.start();
    logger.info('Chaos-Live pipeline is ACTIVE and processing events.');
  } catch (err) {
    logger.error({ err }, 'Failed to start Chaos-Live pipeline');
    process.exit(1);
  }
}

void bootstrap();
