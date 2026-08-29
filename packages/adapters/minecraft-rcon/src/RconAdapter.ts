import { Rcon } from 'rcon-client';
import type { GameAdapter } from '@chaos-live/core';
import type { GameAction, ActionResult } from '@chaos-live/shared-protocol';
import { buildRconCommand, DEFAULT_ALLOWED_COMMANDS } from './command-builder.js';

export interface RconAdapterConfig {
  host: string;
  port: number;
  password?: string;
  /** Timeout in ms for connection and command responses. Default: 5,000ms. */
  timeoutMs?: number;
  /** Whitelist of root command names allowed. Default: DEFAULT_ALLOWED_COMMANDS. */
  allowedCommands?: Set<string>;
  /** Automatic reconnection settings. */
  retry?: {
    maxAttempts?: number;
    delayMs?: number;
  };
}

/**
 * RconAdapter
 * GameAdapter implementation for Minecraft Java Edition via RCON protocol.
 * Includes command whitelisting, sanitization, duration metrics, and reconnection.
 */
export class RconAdapter implements GameAdapter {
  public readonly name = 'Minecraft RCON';

  private readonly host: string;
  private readonly port: number;
  private readonly password?: string;
  private readonly timeoutMs: number;
  private readonly allowedCommands: Set<string>;
  private readonly retryConfig: { maxAttempts: number; delayMs: number };

  private rcon?: Rcon;
  private connected = false;

  constructor(config: RconAdapterConfig) {
    this.host = config.host;
    this.port = config.port;
    this.password = config.password;
    this.timeoutMs = config.timeoutMs ?? 5000;
    this.allowedCommands = config.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS;
    this.retryConfig = {
      maxAttempts: config.retry?.maxAttempts ?? 3,
      delayMs: config.retry?.delayMs ?? 1000,
    };
  }

  public isConnected(): boolean {
    return this.connected && (this.rcon?.authenticated ?? false);
  }

  public async connect(): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        await this.disconnect();

        this.rcon = new Rcon({
          host: this.host,
          port: this.port,
          password: this.password ?? '',
          timeout: this.timeoutMs,
        });

        this.rcon.on('end', () => {
          this.connected = false;
        });

        this.rcon.on('error', () => {
          this.connected = false;
        });

        await this.rcon.connect();
        this.connected = true;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.retryConfig.maxAttempts) {
          await new Promise((r) => setTimeout(r, this.retryConfig.delayMs));
        }
      }
    }

    this.connected = false;
    throw new Error(
      `RconAdapter: Failed to connect to Minecraft server at ${this.host}:${this.port} after ${this.retryConfig.maxAttempts} attempts. (${lastError?.message})`,
    );
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    if (this.rcon) {
      try {
        await this.rcon.end();
      } catch {
        // Ignore disconnect errors
      }
      this.rcon = undefined;
    }
  }

  public async executeAction(action: GameAction): Promise<ActionResult> {
    const startTime = Date.now();

    try {
      if (!this.isConnected()) {
        // Try auto-reconnecting
        await this.connect();
      }

      const command = buildRconCommand(action, this.allowedCommands);
      const response = await this.rcon!.send(command);

      return {
        actionId: action.id,
        success: true,
        response: response.trim(),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        actionId: action.id,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startTime,
      };
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      if (!this.isConnected()) {
        await this.connect();
      }
      const res = await this.rcon!.send('seed');
      return typeof res === 'string';
    } catch {
      return false;
    }
  }
}
