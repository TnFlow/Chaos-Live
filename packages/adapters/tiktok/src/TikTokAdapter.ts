import { WebcastPushConnection } from 'tiktok-live-connector/legacy';
import type { PlatformAdapter } from '@chaos-live/core';
import type { ChaosEvent } from '@chaos-live/shared-protocol';
import {
  normalizeGift,
  normalizeLike,
  normalizeComment,
  normalizeFollow,
  normalizeShare,
  normalizeSubscribe,
  normalizeViewerCount,
} from './normalizer.js';

export interface CircuitBreakerConfig {
  /** Number of consecutive connection failures before opening the circuit. Default: 5. */
  failureThreshold?: number;
  /** Cooldown time in ms before attempting to reset from open circuit. Default: 30,000ms. */
  resetTimeoutMs?: number;
}

export interface ReconnectConfig {
  /** Whether automatic reconnection is enabled. Default: true. */
  enabled?: boolean;
  /** Maximum reconnection attempts before stopping. Default: 10. */
  maxAttempts?: number;
  /** Initial delay before first retry in ms. Default: 1,000ms. */
  initialDelayMs?: number;
  /** Maximum backoff delay in ms. Default: 30,000ms. */
  maxDelayMs?: number;
}

export interface TikTokAdapterConfig {
  /** The TikTok username (uniqueId) without @ */
  uniqueId: string;
  /** Custom client options passed to TikTokLiveConnection. */
  clientOptions?: Record<string, unknown>;
  /** Reconnection settings. */
  reconnect?: ReconnectConfig;
  /** Circuit breaker settings. */
  circuitBreaker?: CircuitBreakerConfig;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * TikTokAdapter
 * Platform adapter connecting to TikTok LIVE streams via tiktok-live-connector.
 * Implements PlatformAdapter with circuit breaker resilience and exponential backoff.
 */
export class TikTokAdapter implements PlatformAdapter {
  public readonly name = 'TikTok LIVE';

  private readonly uniqueId: string;
  private readonly clientOptions: Record<string, unknown>;
  private readonly reconnectConfig: Required<ReconnectConfig>;
  private readonly circuitConfig: Required<CircuitBreakerConfig>;

  private connection?: WebcastPushConnection;
  private isExplicitlyDisconnected = false;
  private eventHandlers: Set<(event: ChaosEvent) => void> = new Set();
  private errorHandlers: Set<(error: Error) => void> = new Set();

  // Circuit breaker state
  private circuitState: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(config: TikTokAdapterConfig) {
    this.uniqueId = config.uniqueId;
    this.clientOptions = config.clientOptions ?? {};

    this.reconnectConfig = {
      enabled: config.reconnect?.enabled ?? true,
      maxAttempts: config.reconnect?.maxAttempts ?? 10,
      initialDelayMs: config.reconnect?.initialDelayMs ?? 1000,
      maxDelayMs: config.reconnect?.maxDelayMs ?? 30000,
    };

    this.circuitConfig = {
      failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? 30000,
    };
  }

  public isConnected(): boolean {
    return !!this.connection?.isConnected;
  }

  public getCircuitState(): CircuitState {
    return this.circuitState;
  }

  public onEvent(handler: (event: ChaosEvent) => void): void {
    this.eventHandlers.add(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  public async connect(): Promise<void> {
    this.isExplicitlyDisconnected = false;

    // Check circuit breaker
    if (this.circuitState === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.circuitConfig.resetTimeoutMs) {
        this.circuitState = 'HALF_OPEN';
      } else {
        const error = new Error('TikTokAdapter: Circuit breaker is OPEN. Connection attempts suspended.');
        this.notifyError(error);
        throw error;
      }
    }

    try {
      this.teardownConnection();

      this.connection = new WebcastPushConnection(this.uniqueId, this.clientOptions as any);
      this.attachListeners(this.connection);

      await this.connection.connect();

      // Successful connection: reset circuit and retry counters
      this.circuitState = 'CLOSED';
      this.failureCount = 0;
      this.reconnectAttempts = 0;
    } catch (err) {
      this.handleConnectionFailure(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    this.isExplicitlyDisconnected = true;
    this.clearReconnectTimer();
    this.teardownConnection();
  }

  private teardownConnection(): void {
    if (this.connection) {
      try {
        this.connection.removeAllListeners();
        if (this.connection.isConnected) {
          void this.connection.disconnect();
        }
      } catch {
        // Ignore teardown errors
      }
      this.connection = undefined;
    }
  }

  private attachListeners(conn: WebcastPushConnection): void {
    conn.on('gift', (data: any) => {
      this.emitEvent(normalizeGift(data));
    });

    conn.on('like', (data: any) => {
      this.emitEvent(normalizeLike(data));
    });

    conn.on('chat', (data: any) => {
      this.emitEvent(normalizeComment(data));
    });

    conn.on('follow', (data: any) => {
      this.emitEvent(normalizeFollow(data));
    });

    conn.on('share', (data: any) => {
      this.emitEvent(normalizeShare(data));
    });

    conn.on('subscribe', (data: any) => {
      this.emitEvent(normalizeSubscribe(data));
    });

    conn.on('roomUser', (data: any) => {
      this.emitEvent(normalizeViewerCount(data));
    });

    conn.on('error', (err: any) => {
      this.notifyError(err instanceof Error ? err : new Error(String(err)));
    });

    conn.on('disconnected', () => {
      if (!this.isExplicitlyDisconnected) {
        this.scheduleReconnect();
      }
    });

    conn.on('streamEnd', () => {
      this.notifyError(new Error(`TikTok LIVE stream for ${this.uniqueId} has ended.`));
    });
  }

  private handleConnectionFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.circuitConfig.failureThreshold) {
      this.circuitState = 'OPEN';
    }

    this.notifyError(error);

    if (!this.isExplicitlyDisconnected && this.reconnectConfig.enabled) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyDisconnected || !this.reconnectConfig.enabled) {
      return;
    }

    if (this.reconnectAttempts >= this.reconnectConfig.maxAttempts) {
      this.notifyError(
        new Error(`TikTokAdapter: Reached maximum reconnect attempts (${this.reconnectConfig.maxAttempts}).`),
      );
      return;
    }

    this.clearReconnectTimer();

    // Exponential backoff with jitter
    const delay = Math.min(
      this.reconnectConfig.initialDelayMs * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 500,
      this.reconnectConfig.maxDelayMs,
    );

    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => {
        // Errors handled in connect()
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private emitEvent(event: ChaosEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        this.notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private notifyError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore handler error
      }
    }
  }
}
