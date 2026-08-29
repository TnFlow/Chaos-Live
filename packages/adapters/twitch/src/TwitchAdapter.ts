import { WebSocket } from 'ws';
import type { PlatformAdapter } from '@chaos-live/core';
import type { ChaosEvent, Platform } from '@chaos-live/shared-protocol';
import {
  normalizeTwitchCheer,
  normalizeTwitchFollow,
  normalizeTwitchSubscribe,
  normalizeTwitchReward,
  normalizeTwitchChat,
  normalizeTwitchRaid,
} from './normalizer.js';

export interface TwitchAdapterOptions {
  wsUrl?: string;
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    delayMs?: number;
  };
  circuitBreaker?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
  };
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * TwitchAdapter
 * Platform adapter connecting to Twitch EventSub via WebSocket to ingest
 * Bits cheers, follows, subscriptions, channel points redemptions, chat, and raids.
 */
export class TwitchAdapter implements PlatformAdapter {
  public readonly name = 'Twitch EventSub';
  public readonly platform: Platform = 'twitch';

  private wsUrl: string;
  private ws?: WebSocket;
  private eventHandlers: Array<(event: ChaosEvent) => void> = [];
  private errorHandlers: Array<(error: Error) => void> = [];
  private isShuttingDown = false;

  // Reconnection options
  private reconnectEnabled: boolean;
  private maxReconnectAttempts: number;
  private reconnectDelayMs: number;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  // Circuit breaker
  private circuitState: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private circuitTimer?: NodeJS.Timeout;

  constructor(options: TwitchAdapterOptions = {}) {
    this.wsUrl = options.wsUrl || 'wss://eventsub.wss.twitch.tv/ws';
    this.reconnectEnabled = options.reconnect?.enabled ?? true;
    this.maxReconnectAttempts = options.reconnect?.maxAttempts ?? 10;
    this.reconnectDelayMs = options.reconnect?.delayMs ?? 2000;
    this.failureThreshold = options.circuitBreaker?.failureThreshold ?? 5;
    this.resetTimeoutMs = options.circuitBreaker?.resetTimeoutMs ?? 30000;
  }

  public async connect(): Promise<void> {
    if (this.circuitState === 'OPEN') {
      throw new Error('TwitchAdapter: Circuit breaker is OPEN. Connection rejected.');
    }

    this.isShuttingDown = false;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.reconnectAttempts = 0;
          this.recordSuccess();
          isResolved = true;
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
          this.ws = undefined;
          if (!this.isShuttingDown) {
            this.handleDisconnect();
          }
        });

        this.ws.on('error', (err) => {
          this.recordFailure();
          this.emitError(err);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          }
        });
      } catch (err) {
        this.recordFailure();
        const error = err instanceof Error ? err : new Error(String(err));
        this.emitError(error);
        reject(error);
      }
    });
  }

  public async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.circuitTimer) {
      clearTimeout(this.circuitTimer);
      this.circuitTimer = undefined;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = undefined;
    }
  }

  public isConnected(): boolean {
    return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
  }

  public onEvent(handler: (event: ChaosEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  public getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitState;
  }

  /**
   * Directly emits a ChaosEvent to registered listeners (for testing/simulations).
   */
  public emitEvent(event: ChaosEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler error
      }
    }
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch {
        // Ignore error in handler
      }
    }
  }

  private handleMessage(payload: string): void {
    try {
      const msg = JSON.parse(payload);
      const msgType = msg?.metadata?.message_type;

      if (msgType === 'notification') {
        const subType = msg?.metadata?.subscription_type;
        const eventData = msg?.payload?.event;

        if (!eventData) return;

        let normalized: ChaosEvent | undefined;

        switch (subType) {
          case 'channel.cheer':
            normalized = normalizeTwitchCheer(eventData);
            break;
          case 'channel.follow':
            normalized = normalizeTwitchFollow(eventData);
            break;
          case 'channel.subscribe':
          case 'channel.subscription.message':
            normalized = normalizeTwitchSubscribe(eventData);
            break;
          case 'channel.channel_points_custom_reward_redemption.add':
            normalized = normalizeTwitchReward(eventData);
            break;
          case 'channel.chat.message':
            normalized = normalizeTwitchChat(eventData);
            break;
          case 'channel.raid':
            normalized = normalizeTwitchRaid(eventData);
            break;
        }

        if (normalized) {
          this.emitEvent(normalized);
        }
      } else if (msgType === 'session_reconnect') {
        const reconnectUrl = msg?.payload?.session?.reconnect_url;
        if (reconnectUrl) {
          this.wsUrl = reconnectUrl;
          void this.reconnect();
        }
      }
    } catch {
      // Ignore malformed message
    }
  }

  private handleDisconnect(): void {
    if (!this.reconnectEnabled || this.isShuttingDown) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(this.reconnectDelayMs * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch(() => {});
    }, delay);
  }

  private async reconnect(): Promise<void> {
    await this.disconnect();
    this.isShuttingDown = false;
    await this.connect();
  }

  private recordSuccess(): void {
    this.failureCount = 0;
    this.circuitState = 'CLOSED';
  }

  private recordFailure(): void {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.circuitState = 'OPEN';
      this.circuitTimer = setTimeout(() => {
        this.circuitState = 'HALF_OPEN';
      }, this.resetTimeoutMs);
    }
  }
}
