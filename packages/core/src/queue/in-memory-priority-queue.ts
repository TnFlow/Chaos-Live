import type { QueuePort, QueueItem } from '../domain/ports/queue-port.js';

export interface RateLimitRule {
  /** Maximum number of actions allowed within windowMs. */
  readonly maxActions: number;
  /** Sliding window duration in milliseconds. */
  readonly windowMs: number;
}

export interface InMemoryQueueConfig {
  /**
   * Points added to priority score per second spent in queue.
   * Default: 1.0 (prevents low-priority items from starving).
   */
  readonly agingFactor?: number;

  /**
   * Rate limits mapped by actionType (e.g. "spawn_mob", "execute_command")
   * or "*" for global limit across all action types.
   */
  readonly rateLimits?: Record<string, RateLimitRule>;

  /**
   * Maximum number of items the queue can hold.
   * When exceeded, newly added items with lower priority than the minimum in queue are rejected.
   * Default: 10,000.
   */
  readonly maxCapacity?: number;
}

/**
 * In-memory Priority Queue with dynamic aging (anti-starvation)
 * and sliding-window rate limiting per ActionType.
 */
export class InMemoryPriorityQueue implements QueuePort {
  private items: QueueItem[] = [];
  private readonly agingFactor: number;
  private readonly rateLimits: Record<string, RateLimitRule>;
  private readonly maxCapacity: number;

  /** Sliding window timestamp history per actionType / key. */
  private dispatchHistory = new Map<string, number[]>();

  constructor(config: InMemoryQueueConfig = {}) {
    this.agingFactor = config.agingFactor ?? 1.0;
    this.rateLimits = config.rateLimits ?? {};
    this.maxCapacity = config.maxCapacity ?? 10_000;
  }

  /**
   * Enqueues an item. If capacity is reached, rejects if item priority is not higher
   * than the lowest item in the queue.
   */
  public enqueue(item: QueueItem, now = Date.now()): boolean {
    if (this.items.length >= this.maxCapacity) {
      this.recalculateScores(now);

      const elapsedSeconds = Math.max(0, (now - item.enqueuedAt) / 1000);
      item.score = item.action.priority + elapsedSeconds * this.agingFactor;

      const minScore = this.items[this.items.length - 1]?.score ?? 0;
      if (item.score <= minScore) {
        return false;
      }
      // Drop lowest item to make room for higher priority
      this.items.pop();
    }

    this.items.push(item);
    return true;
  }

  /**
   * Dequeues the highest-priority eligible item that does not violate rate limits.
   * Recalculates dynamic scores with aging before picking.
   */
  public dequeue(now = Date.now()): QueueItem | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    this.recalculateScores(now);

    // Items are sorted descending by score in recalculateScores
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]!;
      if (this.canDispatch(item.action.actionType, now)) {
        this.recordDispatch(item.action.actionType, now);
        this.items.splice(i, 1);
        return item;
      }
    }

    return undefined;
  }

  /**
   * Peeks at the highest-priority item without removing or rate-limit consuming it.
   */
  public peek(now = Date.now()): QueueItem | undefined {
    if (this.items.length === 0) {
      return undefined;
    }
    this.recalculateScores(now);
    return this.items[0];
  }

  public size(): number {
    return this.items.length;
  }

  public isEmpty(): boolean {
    return this.items.length === 0;
  }

  public clear(): void {
    this.items = [];
    this.dispatchHistory.clear();
  }

  /**
   * Check if an action type is currently allowed under configured rate limits.
   */
  public canDispatch(actionType: string, now = Date.now()): boolean {
    // Check global limit
    if (this.rateLimits['*']) {
      if (!this.checkLimit('*', this.rateLimits['*'], now)) {
        return false;
      }
    }

    // Check specific action limit
    const specificRule = this.rateLimits[actionType];
    if (specificRule) {
      if (!this.checkLimit(actionType, specificRule, now)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Internal sliding-window rate limit checker.
   */
  private checkLimit(key: string, rule: RateLimitRule, now: number): boolean {
    const history = this.dispatchHistory.get(key);
    if (!history || history.length === 0) {
      return true;
    }

    const windowStart = now - rule.windowMs;
    // Count timestamps within active window
    const recentCount = history.filter((ts) => ts > windowStart).length;
    return recentCount < rule.maxActions;
  }

  /**
   * Records a dispatch for rate limit tracking and prunes expired entries.
   */
  private recordDispatch(actionType: string, now: number): void {
    const keys = ['*'];
    if (this.rateLimits[actionType]) {
      keys.push(actionType);
    }

    for (const key of keys) {
      const rule = this.rateLimits[key];
      if (!rule) continue;

      let history = this.dispatchHistory.get(key);
      if (!history) {
        history = [];
        this.dispatchHistory.set(key, history);
      }

      const windowStart = now - rule.windowMs;
      history = history.filter((ts) => ts > windowStart);
      history.push(now);
      this.dispatchHistory.set(key, history);
    }
  }

  /**
   * Recalculates dynamic scores: basePriority + (waitingSeconds * agingFactor)
   * and sorts items descending by score.
   */
  private recalculateScores(now: number): void {
    for (const item of this.items) {
      const elapsedSeconds = Math.max(0, (now - item.enqueuedAt) / 1000);
      item.score = item.action.priority + elapsedSeconds * this.agingFactor;
    }

    this.items.sort((a, b) => b.score - a.score);
  }
}
