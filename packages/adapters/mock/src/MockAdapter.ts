import { randomUUID } from 'node:crypto';
import type { PlatformAdapter } from '@chaos-live/core';
import type { ChaosEvent, EventType } from '@chaos-live/shared-protocol';

export interface MockAdapterConfig {
  /** Interval in ms between automatically generated events. If 0 or undefined, manual only. */
  autoStreamIntervalMs?: number;
  /** List of donor / chatter usernames to simulate. */
  simulatedUsers?: Array<{ id: string; displayName: string }>;
}

const DEFAULT_USERS = [
  { id: 'user_alex', displayName: 'AlexGamer' },
  { id: 'user_bella', displayName: 'BellaLive' },
  { id: 'user_carlos', displayName: 'CarlosCraft' },
  { id: 'user_diana', displayName: 'Diana_MC' },
  { id: 'user_whale', displayName: 'WhaleSupporter' },
];

const POPULAR_GIFTS = [
  { name: 'Rose', giftId: 5655, diamonds: 1 },
  { name: 'Ice Cream', giftId: 5827, diamonds: 1 },
  { name: 'Doughnut', giftId: 5269, diamonds: 30 },
  { name: 'Lion', giftId: 6054, diamonds: 29999 },
];

/**
 * MockAdapter
 * Synthetic streaming platform adapter for local development, load testing,
 * and offline pipeline verification.
 */
export class MockAdapter implements PlatformAdapter {
  public readonly name = 'Mock Platform';

  private connected = false;
  private readonly autoStreamIntervalMs?: number;
  private readonly simulatedUsers: Array<{ id: string; displayName: string }>;

  private timer?: ReturnType<typeof setInterval>;
  private eventHandlers: Set<(event: ChaosEvent) => void> = new Set();
  private errorHandlers: Set<(error: Error) => void> = new Set();

  constructor(config: MockAdapterConfig = {}) {
    this.autoStreamIntervalMs = config.autoStreamIntervalMs;
    this.simulatedUsers = config.simulatedUsers ?? DEFAULT_USERS;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public onEvent(handler: (event: ChaosEvent) => void): void {
    this.eventHandlers.add(handler);
  }

  public onError(handler: (error: Error) => void): void {
    this.errorHandlers.add(handler);
  }

  public async connect(): Promise<void> {
    this.connected = true;
    if (this.autoStreamIntervalMs && this.autoStreamIntervalMs > 0) {
      this.startAutoStream(this.autoStreamIntervalMs);
    }
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.stopAutoStream();
  }

  public startAutoStream(intervalMs: number): void {
    this.stopAutoStream();
    this.timer = setInterval(() => {
      if (this.connected) {
        this.emitRandomEvent();
      }
    }, intervalMs);
  }

  public stopAutoStream(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Manually emit a specific ChaosEvent through the adapter.
   */
  public emitEvent(event: ChaosEvent): void {
    if (!this.connected) {
      return;
    }
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        this.notifyError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  /**
   * Emits a simulated burst of events (e.g. during a raid or gift train).
   */
  public triggerBurst(count: number, preferredType?: EventType): ChaosEvent[] {
    const events: ChaosEvent[] = [];
    for (let i = 0; i < count; i++) {
      const event = this.generateRandomEvent(preferredType);
      this.emitEvent(event);
      events.push(event);
    }
    return events;
  }

  /**
   * Generates and emits a single random event.
   */
  public emitRandomEvent(): ChaosEvent {
    const event = this.generateRandomEvent();
    this.emitEvent(event);
    return event;
  }

  /**
   * Generates a realistic synthetic ChaosEvent.
   */
  public generateRandomEvent(specificType?: EventType): ChaosEvent {
    const user = this.simulatedUsers[Math.floor(Math.random() * this.simulatedUsers.length)]!;
    const type = specificType ?? this.pickRandomType();
    const id = randomUUID();
    const timestamp = Date.now();

    switch (type) {
      case 'gift': {
        const gift = POPULAR_GIFTS[Math.floor(Math.random() * POPULAR_GIFTS.length)]!;
        const repeatCount = Math.floor(Math.random() * 5) + 1;
        const value = gift.diamonds * repeatCount;

        return {
          id,
          platform: 'mock',
          type: 'gift',
          user,
          value,
          metadata: {
            giftName: gift.name,
            giftId: gift.giftId,
            repeatCount,
            diamondCount: gift.diamonds,
          },
          raw: { mock: true },
          timestamp,
        };
      }

      case 'like': {
        const likeCount = Math.floor(Math.random() * 20) + 1;
        return {
          id,
          platform: 'mock',
          type: 'like',
          user,
          value: likeCount,
          metadata: { likeCount },
          raw: { mock: true },
          timestamp,
        };
      }

      case 'comment': {
        const comments = [
          'Hello from chat!',
          'Let’s goooo!',
          'Watch out behind you!',
          'Spawn something big!',
          'GG streamer',
        ];
        const text = comments[Math.floor(Math.random() * comments.length)]!;

        return {
          id,
          platform: 'mock',
          type: 'comment',
          user,
          value: 1,
          metadata: { text },
          raw: { mock: true },
          timestamp,
        };
      }

      case 'follow': {
        return {
          id,
          platform: 'mock',
          type: 'follow',
          user,
          value: 5,
          metadata: {},
          raw: { mock: true },
          timestamp,
        };
      }

      case 'share': {
        return {
          id,
          platform: 'mock',
          type: 'share',
          user,
          value: 10,
          metadata: {},
          raw: { mock: true },
          timestamp,
        };
      }

      case 'subscribe': {
        return {
          id,
          platform: 'mock',
          type: 'subscribe',
          user,
          value: 50,
          metadata: { tier: 1 },
          raw: { mock: true },
          timestamp,
        };
      }

      case 'viewer_count': {
        return {
          id,
          platform: 'mock',
          type: 'viewer_count',
          user: { id: 'system', displayName: 'System' },
          value: 150,
          metadata: { viewerCount: 150 },
          raw: { mock: true },
          timestamp,
        };
      }
    }
  }

  private pickRandomType(): EventType {
    const roll = Math.random();
    if (roll < 0.40) return 'like';
    if (roll < 0.70) return 'comment';
    if (roll < 0.90) return 'gift';
    if (roll < 0.97) return 'follow';
    return 'share';
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
