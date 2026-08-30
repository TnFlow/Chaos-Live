import type { GameAdapter } from '@chaos-live/core';
import type { GameAction, ActionResult } from '@chaos-live/shared-protocol';
import { isCommandSafe } from '@chaos-live/adapter-minecraft-rcon';
import type { WebSocketHub, ModActionResult } from '../server.js';
import { logger } from '../logger.js';

export interface HybridGameAdapterOptions {
  wsHub: WebSocketHub;
  rconAdapter?: GameAdapter;
  fallbackAdapter: GameAdapter;
  modTimeoutMs?: number;
}

/**
 * HybridGameAdapter
 * Intelligent game adapter implementing the Phase 6 Minecraft architecture:
 * 1. Prioritizes the connected Fabric mod client via outbound WebSocket channel.
 * 2. Gracefully falls back to RCON if the mod is offline.
 * 3. Gracefully falls back to ConsoleGameAdapter if neither Minecraft service is reachable.
 */
export class HybridGameAdapter implements GameAdapter {
  public readonly name = 'Hybrid Minecraft Adapter (Fabric Mod / RCON / Fallback)';

  private readonly wsHub: WebSocketHub;
  private readonly rconAdapter?: GameAdapter;
  private readonly fallbackAdapter: GameAdapter;
  private readonly modTimeoutMs: number;

  private pendingAcks = new Map<
    string,
    {
      resolve: (result: ActionResult) => void;
      timer: NodeJS.Timeout;
    }
  >();

  constructor(options: HybridGameAdapterOptions) {
    this.wsHub = options.wsHub;
    this.rconAdapter = options.rconAdapter;
    this.fallbackAdapter = options.fallbackAdapter;
    this.modTimeoutMs = options.modTimeoutMs ?? 5000;
  }

  public handleModActionResult(result: ModActionResult): void {
    const pending = this.pendingAcks.get(result.correlationId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingAcks.delete(result.correlationId);

      pending.resolve({
        actionId: result.correlationId,
        success: result.success,
        durationMs: result.durationMs,
        response: result.response,
        error: result.error,
      });
    }
  }

  public async connect(): Promise<void> {
    if (this.rconAdapter) {
      try {
        await this.rconAdapter.connect();
      } catch (err) {
        logger.warn({ err }, 'RCON fallback connection failed during hybrid init');
      }
    }
    await this.fallbackAdapter.connect();
  }

  public async disconnect(): Promise<void> {
    for (const pending of this.pendingAcks.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingAcks.clear();

    if (this.rconAdapter) {
      await this.rconAdapter.disconnect();
    }
    await this.fallbackAdapter.disconnect();
  }

  public isConnected(): boolean {
    return (
      this.wsHub.isModConnected() ||
      (this.rconAdapter?.isConnected() ?? false) ||
      this.fallbackAdapter.isConnected()
    );
  }

  public async healthCheck(): Promise<boolean> {
    if (this.wsHub.isModConnected()) {
      return true;
    }
    if (this.rconAdapter) {
      return this.rconAdapter.healthCheck();
    }
    return this.fallbackAdapter.healthCheck();
  }

  public async executeAction(action: GameAction): Promise<ActionResult> {
    // 0. Enforce security whitelist & injection validation across all dispatch paths
    if (!isCommandSafe(action.command)) {
      logger.warn(
        { actionId: action.id, command: action.command },
        'Action rejected: disallowed or dangerous command',
      );
      return {
        actionId: action.id,
        success: false,
        durationMs: 0,
        error: `Security violation: command "${action.command}" is disallowed or dangerous`,
      };
    }

    // 1. Prioritize Fabric Mod if connected
    if (this.wsHub.isModConnected()) {
      return this.executeViaMod(action);
    }

    // 2. Fall back to RCON if available
    if (this.rconAdapter && this.rconAdapter.isConnected()) {
      logger.debug({ actionId: action.id }, 'Dispatching via RCON fallback');
      return this.rconAdapter.executeAction(action);
    }

    // 3. Fall back to Console
    logger.debug({ actionId: action.id }, 'Dispatching via Console fallback');
    return this.fallbackAdapter.executeAction(action);
  }

  private executeViaMod(action: GameAction): Promise<ActionResult> {
    return new Promise<ActionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(action.id);
        logger.warn(
          { actionId: action.id, timeoutMs: this.modTimeoutMs },
          'Fabric mod execution timed out, falling back to secondary adapter',
        );

        // On timeout, fall back to RCON or Console
        if (this.rconAdapter && this.rconAdapter.isConnected()) {
          this.rconAdapter.executeAction(action).then(resolve);
        } else {
          this.fallbackAdapter.executeAction(action).then(resolve);
        }
      }, this.modTimeoutMs);

      this.pendingAcks.set(action.id, { resolve, timer });

      const sent = this.wsHub.sendActionToMod(action);
      if (!sent) {
        clearTimeout(timer);
        this.pendingAcks.delete(action.id);
        if (this.rconAdapter && this.rconAdapter.isConnected()) {
          this.rconAdapter.executeAction(action).then(resolve);
        } else {
          this.fallbackAdapter.executeAction(action).then(resolve);
        }
      }
    });
  }
}
