import type { ChaosEvent, GameAction, ActionResult } from '@chaos-live/shared-protocol';
import type { PlatformAdapter } from '../src/domain/ports/platform-adapter.js';
import type { GameAdapter } from '../src/domain/ports/game-adapter.js';
import type { RuleDefinition } from '../src/domain/rule-definition.js';
import type { PipelineLogEntry } from '../src/domain/pipeline-state.js';
import { RuleEvaluator } from '../src/engine/rule-evaluator.js';
import { InMemoryPriorityQueue } from '../src/queue/in-memory-priority-queue.js';
import { EventEngine } from '../src/engine/event-engine.js';

class MockPlatform implements PlatformAdapter {
  readonly name = 'MockPlatform';
  private eventCallback?: (event: ChaosEvent) => void;
  private errorCallback?: (error: Error) => void;
  private connected = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  onEvent(handler: (event: ChaosEvent) => void): void {
    this.eventCallback = handler;
  }

  onError(handler: (error: Error) => void): void {
    this.errorCallback = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  simulateEvent(event: ChaosEvent): void {
    this.eventCallback?.(event);
  }
}

class MockGame implements GameAdapter {
  readonly name = 'MockGame';
  private connected = false;
  public executed: GameAction[] = [];
  public shouldFail = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async executeAction(action: GameAction): Promise<ActionResult> {
    this.executed.push(action);
    if (this.shouldFail) {
      return {
        actionId: action.id,
        success: false,
        error: 'Simulated game failure',
        durationMs: 5,
      };
    }
    return {
      actionId: action.id,
      success: true,
      response: 'Command executed successfully',
      durationMs: 5,
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.connected;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

describe('EventEngine Orchestrator', () => {
  const rules: RuleDefinition[] = [
    {
      id: 'rule-gift-rose',
      name: 'Rose Gift Rule',
      enabled: true,
      priority: 50,
      cooldownMs: 0,
      matcher: {
        eventTypes: ['gift'],
        metadataMatch: { giftName: 'Rose' },
      },
      action: {
        actionType: 'execute_command',
        command: 'summon chicken ~ ~ ~',
      },
    },
  ];

  it('runs complete lifecycle from event ingestion to successful action completion', async () => {
    const platform = new MockPlatform();
    const game = new MockGame();
    const queue = new InMemoryPriorityQueue();
    const ruleEvaluator = new RuleEvaluator(rules);

    const logs: PipelineLogEntry[] = [];
    const engine = new EventEngine({
      queue,
      ruleEvaluator,
      gameAdapter: game,
      platformAdapters: [platform],
      onPipelineState: (entry) => logs.push(entry),
    });

    await engine.start();

    const giftEvent: ChaosEvent<'gift'> = {
      id: 'evt-rose-1',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u1', displayName: 'NiceViewer' },
      value: 1,
      metadata: {
        giftName: 'Rose',
        giftId: 1,
        repeatCount: 1,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    platform.simulateEvent(giftEvent);

    // Wait a brief tick for async processing
    await new Promise((r) => setTimeout(r, 50));

    expect(game.executed.length).toBe(1);
    expect(game.executed[0]?.id).toBe('evt-rose-1');
    expect(game.executed[0]?.command).toBe('summon chicken ~ ~ ~');

    const states = logs.map((l) => l.state);
    expect(states).toContain('EVENT_RECEIVED');
    expect(states).toContain('EVENT_VALIDATED');
    expect(states).toContain('RULE_MATCHED');
    expect(states).toContain('EVENT_QUEUED');
    expect(states).toContain('ACTION_DISPATCHED');
    expect(states).toContain('EVENT_COMPLETED');

    await engine.stop();
  });

  it('handles unmatched events without queuing or dispatching', async () => {
    const platform = new MockPlatform();
    const game = new MockGame();
    const queue = new InMemoryPriorityQueue();
    const ruleEvaluator = new RuleEvaluator(rules);

    const logs: PipelineLogEntry[] = [];
    const engine = new EventEngine({
      queue,
      ruleEvaluator,
      gameAdapter: game,
      platformAdapters: [platform],
      onPipelineState: (entry) => logs.push(entry),
    });

    await engine.start();

    const likeEvent: ChaosEvent<'like'> = {
      id: 'evt-like-unmatched',
      platform: 'tiktok',
      type: 'like',
      user: { id: 'u2', displayName: 'Liker' },
      value: 1,
      metadata: { likeCount: 1 },
      raw: {},
      timestamp: Date.now(),
    };

    platform.simulateEvent(likeEvent);

    await new Promise((r) => setTimeout(r, 30));

    expect(game.executed.length).toBe(0);
    expect(queue.size()).toBe(0);

    const states = logs.map((l) => l.state);
    expect(states).toContain('EVENT_RECEIVED');
    expect(states).toContain('EVENT_VALIDATED');
    expect(states).toContain('RULE_NOT_MATCHED');
    expect(states).not.toContain('RULE_MATCHED');

    await engine.stop();
  });

  it('captures game execution failures and transitions to EVENT_FAILED', async () => {
    const platform = new MockPlatform();
    const game = new MockGame();
    game.shouldFail = true;

    const queue = new InMemoryPriorityQueue();
    const ruleEvaluator = new RuleEvaluator(rules);

    const logs: PipelineLogEntry[] = [];
    const engine = new EventEngine({
      queue,
      ruleEvaluator,
      gameAdapter: game,
      platformAdapters: [platform],
      onPipelineState: (entry) => logs.push(entry),
    });

    await engine.start();

    const giftEvent: ChaosEvent<'gift'> = {
      id: 'evt-fail-test',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u3', displayName: 'Tester' },
      value: 1,
      metadata: {
        giftName: 'Rose',
        giftId: 1,
        repeatCount: 1,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    platform.simulateEvent(giftEvent);

    await new Promise((r) => setTimeout(r, 50));

    expect(game.executed.length).toBe(1);
    const failureLog = logs.find((l) => l.state === 'EVENT_FAILED');
    expect(failureLog).toBeDefined();
    expect(failureLog?.details?.error).toBe('Simulated game failure');

    await engine.stop();
  });

  it('processes events concurrently from multiple platform adapters with unified queueing', async () => {
    const tiktokPlatform = new MockPlatform();
    const twitchPlatform = new MockPlatform();
    const game = new MockGame();

    const multiPlatformRules: RuleDefinition[] = [
      {
        id: 'rule-tiktok-gift',
        name: 'TikTok Rose Rule',
        priority: 10,
        enabled: true,
        matcher: {
          platforms: ['tiktok'],
          eventTypes: ['gift'],
        },
        action: {
          actionType: 'execute_command',
          command: 'summon chicken ~ ~ ~',
        },
      },
      {
        id: 'rule-twitch-cheer',
        name: 'Twitch Bits Rule',
        priority: 20,
        enabled: true,
        matcher: {
          platforms: ['twitch'],
          eventTypes: ['gift'],
        },
        action: {
          actionType: 'execute_command',
          command: 'summon zombie ~ ~ ~',
        },
      },
      {
        id: 'rule-any-like',
        name: 'Cross-Platform Like Rule',
        priority: 5,
        enabled: true,
        matcher: {
          eventTypes: ['like'],
        },
        action: {
          actionType: 'execute_command',
          command: 'particle heart ~ ~ ~',
        },
      },
    ];

    const queue = new InMemoryPriorityQueue();
    const ruleEvaluator = new RuleEvaluator(multiPlatformRules);
    const engine = new EventEngine({
      queue,
      ruleEvaluator,
      gameAdapter: game,
      platformAdapters: [tiktokPlatform, twitchPlatform],
    });

    await engine.start();

    // Fire events from both platforms simultaneously
    tiktokPlatform.simulateEvent({
      id: 'tt-1',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'tt-u1', displayName: 'TikToker' },
      value: 10,
      metadata: { giftName: 'Rose', giftId: 1, repeatCount: 1, diamondCount: 1 },
      raw: {},
      timestamp: Date.now(),
    });

    twitchPlatform.simulateEvent({
      id: 'tw-1',
      platform: 'twitch',
      type: 'gift',
      user: { id: 'tw-u1', displayName: 'Twitcher' },
      value: 500,
      metadata: { giftName: 'Cheer 500 Bits', giftId: 500, repeatCount: 1, diamondCount: 500 },
      raw: {},
      timestamp: Date.now(),
    });

    twitchPlatform.simulateEvent({
      id: 'tw-like',
      platform: 'twitch',
      type: 'like',
      user: { id: 'tw-u2', displayName: 'Liker' },
      value: 1,
      metadata: { likeCount: 1 },
      raw: {},
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 60));

    // All 3 events dispatched across both platforms
    expect(game.executed.length).toBe(3);
    const commands = game.executed.map((a) => a.command);
    expect(commands).toContain('summon chicken ~ ~ ~');
    expect(commands).toContain('summon zombie ~ ~ ~');
    expect(commands).toContain('particle heart ~ ~ ~');

    await engine.stop();
  });
});
