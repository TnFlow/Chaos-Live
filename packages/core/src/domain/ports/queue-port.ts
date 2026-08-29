import type { GameAction } from '@chaos-live/shared-protocol';

/**
 * An item in the priority queue, wrapping a GameAction
 * with queue-specific metadata for priority scoring.
 */
export interface QueueItem {
  /** The action to dispatch. */
  readonly action: GameAction;

  /**
   * Computed priority score (higher = dequeued sooner).
   * Calculated by the queue's scoring function:
   *   score = f(event_value, user_tier, time_in_queue)
   */
  score: number;

  /** Unix timestamp (ms) when this item was enqueued. Used for aging. */
  readonly enqueuedAt: number;
}

/**
 * QueuePort — port interface for the event/action queue.
 *
 * MVP: in-memory priority queue with aging and rate limiting.
 * Future: BullMQ + Redis adapter implementing the same interface.
 */
export interface QueuePort {
  /**
   * Add an action to the queue with an initial priority score.
   * @param item - The queue item to enqueue.
   * @param now - Optional timestamp for deterministic scoring/testing.
   * @returns boolean indicating whether the item was admitted.
   */
  enqueue(item: QueueItem, now?: number): boolean;

  /**
   * Remove and return the highest-priority item from the queue.
   * Returns undefined if the queue is empty.
   *
   * Before returning, the queue should recalculate scores to
   * account for aging (anti-starvation).
   */
  dequeue(): QueueItem | undefined;

  /**
   * View the highest-priority item without removing it.
   */
  peek(): QueueItem | undefined;

  /** Current number of items in the queue. */
  size(): number;

  /** Remove all items from the queue. */
  clear(): void;

  /** Whether the queue has any items. */
  isEmpty(): boolean;
}
