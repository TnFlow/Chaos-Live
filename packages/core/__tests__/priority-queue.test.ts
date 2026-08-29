import type { GameAction } from '@chaos-live/shared-protocol';
import type { QueueItem } from '../src/domain/ports/queue-port.js';
import { InMemoryPriorityQueue } from '../src/queue/in-memory-priority-queue.js';

function createMockAction(id: string, priority: number, actionType = 'execute_command'): GameAction {
  return {
    id,
    actionType: actionType as any,
    command: `test command for ${id}`,
    payload: {},
    priority,
    timestamp: Date.now(),
  };
}

function createItem(id: string, priority: number, enqueuedAt: number, actionType = 'execute_command'): QueueItem {
  const action = createMockAction(id, priority, actionType);
  return {
    action,
    score: priority,
    enqueuedAt,
  };
}

describe('InMemoryPriorityQueue', () => {
  it('dequeues items in strict priority order when no aging has occurred', () => {
    const queue = new InMemoryPriorityQueue();
    const t0 = 1000;

    queue.enqueue(createItem('low', 10, t0));
    queue.enqueue(createItem('high', 100, t0));
    queue.enqueue(createItem('medium', 50, t0));

    expect(queue.size()).toBe(3);

    const first = queue.dequeue(t0);
    expect(first?.action.id).toBe('high');

    const second = queue.dequeue(t0);
    expect(second?.action.id).toBe('medium');

    const third = queue.dequeue(t0);
    expect(third?.action.id).toBe('low');

    expect(queue.dequeue(t0)).toBeUndefined();
    expect(queue.isEmpty()).toBe(true);
  });

  it('elevates older low-priority items over time via anti-starvation aging', () => {
    // aging factor: 10 points per second
    const queue = new InMemoryPriorityQueue({ agingFactor: 10 });

    // Item A enqueued at t = 0 with base priority 20
    queue.enqueue(createItem('item-A', 20, 0));

    // Item B enqueued at t = 5000 (5 seconds later) with base priority 50
    queue.enqueue(createItem('item-B', 50, 5000));

    // At t = 5000:
    // Item A score = 20 + (5000 - 0)/1000 * 10 = 20 + 50 = 70
    // Item B score = 50 + (5000 - 5000)/1000 * 10 = 50 + 0 = 50
    // Item A should be dequeued BEFORE Item B!
    const dequeued = queue.dequeue(5000);
    expect(dequeued?.action.id).toBe('item-A');

    const next = queue.dequeue(5000);
    expect(next?.action.id).toBe('item-B');
  });

  it('respects sliding window rate limits per actionType', () => {
    const queue = new InMemoryPriorityQueue({
      rateLimits: {
        spawn_mob: { maxActions: 2, windowMs: 1000 },
      },
    });

    const t = 1000;
    queue.enqueue(createItem('mob-1', 100, t, 'spawn_mob'));
    queue.enqueue(createItem('mob-2', 90, t, 'spawn_mob'));
    queue.enqueue(createItem('mob-3', 80, t, 'spawn_mob'));
    queue.enqueue(createItem('chat-1', 10, t, 'send_chat'));

    // First two mob spawns succeed at t = 1000
    expect(queue.dequeue(t)?.action.id).toBe('mob-1');
    expect(queue.dequeue(t)?.action.id).toBe('mob-2');

    // Third mob spawn is rate-limited at t = 1000 (limit is 2 per 1000ms)
    // The queue skips it and returns eligible chat-1 instead
    expect(queue.dequeue(t)?.action.id).toBe('chat-1');

    // No other items can be dequeued at t = 1000
    expect(queue.dequeue(t)).toBeUndefined();
    expect(queue.size()).toBe(1); // mob-3 remains in queue

    // At t = 2001 (past the 1000ms window), mob-3 is eligible again
    expect(queue.dequeue(2001)?.action.id).toBe('mob-3');
    expect(queue.isEmpty()).toBe(true);
  });

  it('respects global rate limits', () => {
    const queue = new InMemoryPriorityQueue({
      rateLimits: {
        '*': { maxActions: 1, windowMs: 500 },
      },
    });

    queue.enqueue(createItem('action-1', 50, 1000, 'type-a'));
    queue.enqueue(createItem('action-2', 40, 1000, 'type-b'));

    expect(queue.dequeue(1000)?.action.id).toBe('action-1');
    // Global limit reached for t = 1000
    expect(queue.dequeue(1000)).toBeUndefined();

    // At t = 1501, window has passed
    expect(queue.dequeue(1501)?.action.id).toBe('action-2');
  });

  it('handles peek, clear, and capacity', () => {
    const queue = new InMemoryPriorityQueue({ maxCapacity: 2 });

    queue.enqueue(createItem('low', 10, 1000), 1000);
    queue.enqueue(createItem('high', 100, 1000), 1000);

    expect(queue.size()).toBe(2);
    expect(queue.peek(1000)?.action.id).toBe('high');

    // Enqueueing an item with priority lower than lowest (10) fails
    const rejected = queue.enqueue(createItem('lower', 5, 1000), 1000);
    expect(rejected).toBe(false);
    expect(queue.size()).toBe(2);

    // Enqueueing an item with higher priority drops the lowest item
    const accepted = queue.enqueue(createItem('very-high', 200, 1000), 1000);
    expect(accepted).toBe(true);
    expect(queue.size()).toBe(2);
    expect(queue.dequeue(1000)?.action.id).toBe('very-high');
    expect(queue.dequeue(1000)?.action.id).toBe('high');
    expect(queue.isEmpty()).toBe(true);

    queue.enqueue(createItem('test', 1, 1000));
    queue.clear();
    expect(queue.isEmpty()).toBe(true);
  });
});
