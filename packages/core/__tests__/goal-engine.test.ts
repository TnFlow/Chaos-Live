import type { ChaosEvent } from '@chaos-live/shared-protocol';
import { GoalEngine } from '../src/goals/goal-engine.js';

describe('GoalEngine', () => {
  const sampleRoseGoal = {
    id: 'goal-roses-50',
    name: '50 Roses -> Summon Warden',
    eventType: 'gift' as const,
    giftName: 'Rose',
    targetValue: 50,
    actionCommand: 'summon warden ~ ~ ~ {CustomName:\'"SUMMONED BY COMMUNITY!"\'}',
  };

  it('increments progress on matching gift events', async () => {
    const engine = new GoalEngine([sampleRoseGoal]);

    const event: ChaosEvent<'gift'> = {
      id: 'e1',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u1', displayName: 'Donor' },
      value: 5,
      metadata: {
        giftName: 'Rose',
        giftId: 5655,
        repeatCount: 5,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    const updates = await engine.processEvent(event);
    expect(updates.length).toBe(1);
    expect(updates[0]?.currentValue).toBe(5);
    expect(updates[0]?.percent).toBe(10); // 5/50 = 10%
    expect(updates[0]?.justCompleted).toBe(false);
    expect(updates[0]?.triggeredAction).toBeUndefined();
  });

  it('ignores events for other gifts', async () => {
    const engine = new GoalEngine([sampleRoseGoal]);

    const event: ChaosEvent<'gift'> = {
      id: 'e2',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u2', displayName: 'Donor' },
      value: 1,
      metadata: {
        giftName: 'Ice Cream',
        giftId: 100,
        repeatCount: 1,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    const updates = await engine.processEvent(event);
    expect(updates.length).toBe(0);
    expect(engine.getGoal('goal-roses-50')?.currentValue).toBe(0);
  });

  it('triggers GameAction when target value is achieved', async () => {
    const engine = new GoalEngine([
      {
        ...sampleRoseGoal,
        targetValue: 10,
      },
    ]);

    const event: ChaosEvent<'gift'> = {
      id: 'e3',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u3', displayName: 'BigGifter' },
      value: 10,
      metadata: {
        giftName: 'Rose',
        giftId: 5655,
        repeatCount: 10,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    const updates = await engine.processEvent(event);
    expect(updates.length).toBe(1);
    expect(updates[0]?.completed).toBe(true);
    expect(updates[0]?.justCompleted).toBe(true);
    expect(updates[0]?.percent).toBe(100);

    const action = updates[0]?.triggeredAction;
    expect(action).toBeDefined();
    expect(action?.command).toBe('summon warden ~ ~ ~ {CustomName:\'"SUMMONED BY COMMUNITY!"\'}');
    expect(action?.priority).toBe(200);
  });

  it('resets progress for repeatable goals', async () => {
    const engine = new GoalEngine([
      {
        ...sampleRoseGoal,
        targetValue: 5,
        repeatable: true,
      },
    ]);

    const event: ChaosEvent<'gift'> = {
      id: 'e4',
      platform: 'tiktok',
      type: 'gift',
      user: { id: 'u4', displayName: 'Donor' },
      value: 5,
      metadata: {
        giftName: 'Rose',
        giftId: 5655,
        repeatCount: 5,
        diamondCount: 1,
      },
      raw: {},
      timestamp: Date.now(),
    };

    const updates = await engine.processEvent(event);
    expect(updates[0]?.justCompleted).toBe(true);
    expect(updates[0]?.triggeredAction).toBeDefined();

    // In-memory goal is reset for the next cycle
    const goal = engine.getGoal('goal-roses-50');
    expect(goal?.currentValue).toBe(0);
    expect(goal?.completed).toBe(false);
  });

  it('allows manual goal reset', async () => {
    const engine = new GoalEngine([{ ...sampleRoseGoal, currentValue: 25 }]);
    expect(engine.getGoal('goal-roses-50')?.currentValue).toBe(25);

    await engine.resetGoal('goal-roses-50');
    expect(engine.getGoal('goal-roses-50')?.currentValue).toBe(0);
  });
});
