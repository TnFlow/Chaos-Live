import type { ChaosEvent, GameAction } from '@chaos-live/shared-protocol';
import type { PlatformAdapter } from '../domain/ports/platform-adapter.js';
import type { GameAdapter } from '../domain/ports/game-adapter.js';
import type { QueuePort, QueueItem } from '../domain/ports/queue-port.js';
import type { PipelineLogEntry } from '../domain/pipeline-state.js';
import type { GoalEngine } from '../goals/goal-engine.js';
import { RuleEvaluator } from './rule-evaluator.js';

export type PipelineListener = (entry: PipelineLogEntry) => void;

export interface EventEngineConfig {
  ruleEvaluator?: RuleEvaluator;
  queue: QueuePort;
  gameAdapter?: GameAdapter;
  platformAdapters?: PlatformAdapter[];
  /**
   * Motor de metas comunitarias. Si se proporciona, cada evento avanza las metas
   * antes de evaluarse contra las reglas, dentro del mismo pipeline. Sin esto,
   * las metas tendrían que engancharse aparte al adapter de plataforma y sus
   * acciones se encolarían sin pasar por la observabilidad del motor.
   */
  goalEngine?: GoalEngine;
  /** Dispatch check interval in milliseconds. Default: 50ms. */
  dispatchIntervalMs?: number;
  /** Pipeline state transition listener (e.g. for structured Pino logging). */
  onPipelineState?: PipelineListener;
}

/**
 * EventEngine
 * Orchestrates the full lifecycle:
 * Ingestion -> Normalization/Validation -> Rule Evaluation -> Queueing -> Dispatching -> Result
 */
export class EventEngine {
  private readonly ruleEvaluator: RuleEvaluator;
  private readonly queue: QueuePort;
  private readonly goalEngine?: GoalEngine;
  private gameAdapter?: GameAdapter;
  private readonly platformAdapters: Set<PlatformAdapter> = new Set();
  private readonly dispatchIntervalMs: number;
  private readonly listeners: Set<PipelineListener> = new Set();

  private isRunning = false;
  private isPausedState = false;
  private dispatchTimer?: ReturnType<typeof setInterval>;
  private isDispatching = false;

  constructor(config: EventEngineConfig) {
    this.ruleEvaluator = config.ruleEvaluator ?? new RuleEvaluator();
    this.queue = config.queue;
    this.goalEngine = config.goalEngine;
    this.gameAdapter = config.gameAdapter;
    this.dispatchIntervalMs = config.dispatchIntervalMs ?? 50;

    if (config.onPipelineState) {
      this.listeners.add(config.onPipelineState);
    }

    if (config.platformAdapters) {
      for (const adapter of config.platformAdapters) {
        this.registerPlatformAdapter(adapter);
      }
    }
  }

  public registerPlatformAdapter(adapter: PlatformAdapter): void {
    this.platformAdapters.add(adapter);
    adapter.onEvent((event) => {
      void this.handleEvent(event);
    });
    adapter.onError((error) => {
      this.emitState({
        correlationId: 'SYSTEM',
        state: 'EVENT_FAILED',
        timestamp: Date.now(),
        details: { adapter: adapter.name, error: error.message },
      });
    });
  }

  public setGameAdapter(adapter: GameAdapter): void {
    this.gameAdapter = adapter;
  }

  public pause(): void {
    this.isPausedState = true;
  }

  public resume(): void {
    this.isPausedState = false;
  }

  public isPaused(): boolean {
    return this.isPausedState;
  }

  public getPlatformAdapters(): PlatformAdapter[] {
    return Array.from(this.platformAdapters);
  }

  public getGameAdapter(): GameAdapter | undefined {
    return this.gameAdapter;
  }

  public getQueue(): QueuePort {
    return this.queue;
  }

  public getRuleEvaluator(): RuleEvaluator {
    return this.ruleEvaluator;
  }

  public addListener(listener: PipelineListener): void {
    this.listeners.add(listener);
  }

  public removeListener(listener: PipelineListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Starts the engine: connects adapters and starts the dispatch loop.
   */
  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    if (this.gameAdapter && !this.gameAdapter.isConnected()) {
      await this.gameAdapter.connect();
    }

    for (const adapter of this.platformAdapters) {
      if (!adapter.isConnected()) {
        await adapter.connect();
      }
    }

    this.dispatchTimer = setInterval(() => {
      void this.processQueue();
    }, this.dispatchIntervalMs);
  }

  /**
   * Stops the engine: cleans up timers and disconnects adapters.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.dispatchTimer) {
      clearInterval(this.dispatchTimer);
      this.dispatchTimer = undefined;
    }

    for (const adapter of this.platformAdapters) {
      if (adapter.isConnected()) {
        await adapter.disconnect();
      }
    }

    if (this.gameAdapter && this.gameAdapter.isConnected()) {
      await this.gameAdapter.disconnect();
    }
  }

  /**
   * Handles an incoming ChaosEvent through the validation, evaluation, and queueing stages.
   */
  public async handleEvent(event: ChaosEvent): Promise<void> {
    const now = Date.now();

    // 1. EVENT_RECEIVED
    this.emitState({
      correlationId: event.id,
      state: 'EVENT_RECEIVED',
      timestamp: now,
      event,
      details: {
        platform: event.platform,
        type: event.type,
        user: event.user.displayName,
        value: event.value,
      },
    });

    // 2. EVENT_VALIDATED
    if (!event.id || !event.type || !event.user) {
      this.emitState({
        correlationId: event.id || 'UNKNOWN',
        state: 'EVENT_FAILED',
        timestamp: now,
        details: { reason: 'INVALID_EVENT_PAYLOAD' },
      });
      return;
    }

    this.emitState({
      correlationId: event.id,
      state: 'EVENT_VALIDATED',
      timestamp: now,
    });

    // 3. COMMUNITY GOALS
    // Se procesan antes que las reglas: un mismo evento puede avanzar una meta
    // y además disparar su propia regla, y la recompensa de la meta debe
    // entrar en la cola con su prioridad elevada.
    await this.processGoals(event, now);

    // 4. RULE EVALUATION
    const evalResult = this.ruleEvaluator.evaluate(event, now);

    if (evalResult.status === 'NO_MATCH') {
      this.emitState({
        correlationId: event.id,
        state: 'RULE_NOT_MATCHED',
        timestamp: now,
      });
      return;
    }

    if (evalResult.status === 'COOLDOWN') {
      this.emitState({
        correlationId: event.id,
        state: 'RULE_COOLDOWN',
        timestamp: now,
        details: { ruleId: evalResult.matchedRule?.id, ruleName: evalResult.matchedRule?.name },
      });
      return;
    }

    if (evalResult.status === 'DISABLED' || !evalResult.action) {
      return;
    }

    // 5. RULE_MATCHED
    this.emitState({
      correlationId: event.id,
      state: 'RULE_MATCHED',
      timestamp: now,
      details: {
        ruleId: evalResult.matchedRule?.id,
        ruleName: evalResult.matchedRule?.name,
        actionType: evalResult.action.actionType,
      },
    });

    // 6. EVENT_QUEUED
    const queueItem: QueueItem = {
      action: evalResult.action,
      score: evalResult.action.priority,
      enqueuedAt: now,
    };

    const admitted = this.queue.enqueue(queueItem, now);
    if (!admitted) {
      this.emitState({
        correlationId: event.id,
        state: 'EVENT_FAILED',
        timestamp: now,
        details: { reason: 'QUEUE_CAPACITY_REJECTED' },
      });
      return;
    }

    this.emitState({
      correlationId: event.id,
      state: 'EVENT_QUEUED',
      timestamp: now,
      details: { queueSize: this.queue.size() },
    });

    // Trigger immediate dispatch attempt
    void this.processQueue();
  }

  /**
   * Avanza las metas comunitarias con el evento recibido y encola la recompensa
   * de las que se completen.
   *
   * Los errores del motor de metas no interrumpen el pipeline: una meta que
   * falla no debe impedir que la regla del mismo evento se dispare en directo.
   */
  private async processGoals(event: ChaosEvent, now: number): Promise<void> {
    if (!this.goalEngine) return;

    let updates;
    try {
      updates = await this.goalEngine.processEvent(event);
    } catch (err) {
      this.emitState({
        correlationId: event.id,
        state: 'EVENT_FAILED',
        timestamp: Date.now(),
        details: {
          stage: 'GOALS',
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return;
    }

    for (const update of updates) {
      this.emitState({
        correlationId: event.id,
        state: update.justCompleted ? 'GOAL_COMPLETED' : 'GOAL_PROGRESS',
        timestamp: now,
        details: update as unknown as Record<string, unknown>,
      });

      if (!update.triggeredAction) {
        continue;
      }

      const admitted = this.queue.enqueue(
        {
          action: update.triggeredAction,
          score: update.triggeredAction.priority,
          enqueuedAt: now,
        },
        now,
      );

      if (!admitted) {
        this.emitState({
          correlationId: update.triggeredAction.id,
          state: 'EVENT_FAILED',
          timestamp: now,
          action: update.triggeredAction,
          details: { reason: 'QUEUE_CAPACITY_REJECTED', goalId: update.goalId },
        });
      }
    }
  }

  /**
   * Processes available actions in the queue and dispatches them to the GameAdapter.
   */
  public async processQueue(): Promise<void> {
    if (this.isPausedState || this.isDispatching || !this.gameAdapter || !this.gameAdapter.isConnected()) {
      return;
    }

    this.isDispatching = true;

    try {
      while (true) {
        const item = this.queue.dequeue();
        if (!item) {
          break;
        }

        await this.dispatchAction(item.action);
      }
    } finally {
      this.isDispatching = false;
    }
  }

  /**
   * Dispatches a single action to the game adapter and tracks the result.
   */
  private async dispatchAction(action: GameAction): Promise<void> {
    if (!this.gameAdapter) return;

    const dispatchTime = Date.now();

    this.emitState({
      correlationId: action.id,
      state: 'ACTION_DISPATCHED',
      timestamp: dispatchTime,
      action,
      details: {
        actionType: action.actionType,
        command: action.command,
      },
    });

    try {
      const result = await this.gameAdapter.executeAction(action);

      if (result.success) {
        this.emitState({
          correlationId: action.id,
          state: 'EVENT_COMPLETED',
          timestamp: Date.now(),
          action,
          details: {
            durationMs: result.durationMs,
            response: result.response,
          },
        });
      } else {
        this.emitState({
          correlationId: action.id,
          state: 'EVENT_FAILED',
          timestamp: Date.now(),
          action,
          details: {
            durationMs: result.durationMs,
            error: result.error,
          },
        });
      }
    } catch (err) {
      this.emitState({
        correlationId: action.id,
        state: 'EVENT_FAILED',
        timestamp: Date.now(),
        action,
        details: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  private emitState(entry: PipelineLogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // Listener errors should not break the pipeline
      }
    }
  }
}
