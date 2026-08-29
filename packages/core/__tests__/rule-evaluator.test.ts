import type { ChaosEvent } from '@chaos-live/shared-protocol';
import type { RuleDefinition } from '../src/domain/rule-definition.js';
import { RuleEvaluator, interpolateString, interpolatePayload } from '../src/engine/rule-evaluator.js';

describe('interpolateString & interpolatePayload', () => {
  const sampleEvent: ChaosEvent<'gift'> = {
    id: 'evt-12345',
    platform: 'tiktok',
    type: 'gift',
    user: {
      id: 'usr-999',
      displayName: 'CoolStreamer',
    },
    value: 10,
    metadata: {
      giftName: 'Rose',
      giftId: 5655,
      repeatCount: 1,
      diamondCount: 1,
    },
    raw: {},
    timestamp: 1724900000000,
  };

  it('interpolates user, event, and metadata fields in string', () => {
    const template = 'summon zombie ~ ~ ~ {CustomName:\'"${user.displayName} sent a ${metadata.giftName} (val: ${event.value})!"\'}';
    const result = interpolateString(template, sampleEvent);
    expect(result).toBe(
      'summon zombie ~ ~ ~ {CustomName:\'"CoolStreamer sent a Rose (val: 10)!"\'}',
    );
  });

  it('handles non-existent fields gracefully with empty string', () => {
    const template = 'say Hello ${user.nonExistent}';
    const result = interpolateString(template, sampleEvent);
    expect(result).toBe('say Hello ');
  });

  it('interpolates payload structures recursively', () => {
    const payloadTemplate = {
      entity: 'minecraft:${metadata.giftName}',
      count: 1,
      sender: '${user.displayName}',
      nested: {
        id: '${event.id}',
      },
      list: ['item-${metadata.giftId}'],
    };

    const result = interpolatePayload(payloadTemplate, sampleEvent);
    expect(result).toEqual({
      entity: 'minecraft:Rose',
      count: 1,
      sender: 'CoolStreamer',
      nested: {
        id: 'evt-12345',
      },
      list: ['item-5655'],
    });
  });
});

describe('RuleEvaluator', () => {
  const sampleGiftEvent: ChaosEvent<'gift'> = {
    id: 'evt-gift-1',
    platform: 'tiktok',
    type: 'gift',
    user: { id: 'u1', displayName: 'Gifter1' },
    value: 50,
    metadata: {
      giftName: 'Ice Cream',
      giftId: 100,
      repeatCount: 1,
      diamondCount: 50,
    },
    raw: {},
    timestamp: 1000,
  };

  const sampleLikeEvent: ChaosEvent<'like'> = {
    id: 'evt-like-1',
    platform: 'tiktok',
    type: 'like',
    user: { id: 'u2', displayName: 'Liker2' },
    value: 10,
    metadata: {
      likeCount: 10,
    },
    raw: {},
    timestamp: 1000,
  };

  const rules: RuleDefinition[] = [
    {
      id: 'rule-gift-high',
      name: 'High value gift',
      enabled: true,
      priority: 100,
      cooldownMs: 0,
      matcher: {
        eventTypes: ['gift'],
        minValue: 100,
      },
      action: {
        actionType: 'execute_command',
        command: 'summon creeper ~ ~ ~',
      },
    },
    {
      id: 'rule-gift-icecream',
      name: 'Ice cream gift',
      enabled: true,
      priority: 50,
      cooldownMs: 5000,
      matcher: {
        eventTypes: ['gift'],
        metadataMatch: {
          giftName: 'Ice Cream',
        },
      },
      action: {
        actionType: 'execute_command',
        command: 'summon zombie ~ ~ ~',
      },
    },
    {
      id: 'rule-likes',
      name: 'Batch of likes',
      enabled: true,
      priority: 10,
      cooldownMs: 0,
      matcher: {
        eventTypes: ['like'],
      },
      action: {
        actionType: 'execute_command',
        command: 'particle heart ~ ~1 ~',
      },
    },
    {
      id: 'rule-disabled',
      name: 'Disabled rule',
      enabled: false,
      priority: 200,
      cooldownMs: 0,
      matcher: {
        eventTypes: ['follow'],
      },
      action: {
        actionType: 'send_title',
        command: 'title @a title "Welcome"',
      },
    },
  ];

  it('evaluates highest priority matching rule', () => {
    const evaluator = new RuleEvaluator(rules);
    const result = evaluator.evaluate(sampleGiftEvent);

    expect(result.status).toBe('MATCHED');
    expect(result.matchedRule?.id).toBe('rule-gift-icecream');
    expect(result.action).toBeDefined();
    expect(result.action?.command).toBe('summon zombie ~ ~ ~');
    expect(result.action?.id).toBe('evt-gift-1');
  });

  it('matches higher priority rule when criteria met', () => {
    const evaluator = new RuleEvaluator(rules);
    const highValueGift: ChaosEvent<'gift'> = {
      ...sampleGiftEvent,
      id: 'evt-gift-2',
      value: 200,
    };

    const result = evaluator.evaluate(highValueGift);
    expect(result.status).toBe('MATCHED');
    expect(result.matchedRule?.id).toBe('rule-gift-high');
    expect(result.action?.command).toBe('summon creeper ~ ~ ~');
  });

  it('returns NO_MATCH when no rule criteria match', () => {
    const evaluator = new RuleEvaluator(rules);
    const commentEvent: ChaosEvent<'comment'> = {
      id: 'evt-comment-1',
      platform: 'tiktok',
      type: 'comment',
      user: { id: 'u3', displayName: 'Chatter' },
      value: 1,
      metadata: { text: 'Hello!' },
      raw: {},
      timestamp: 1000,
    };

    const result = evaluator.evaluate(commentEvent);
    expect(result.status).toBe('NO_MATCH');
    expect(result.action).toBeUndefined();
  });

  it('enforces cooldowns', () => {
    const evaluator = new RuleEvaluator(rules);

    // First execution at t = 1000
    const firstResult = evaluator.evaluate(sampleGiftEvent, 1000);
    expect(firstResult.status).toBe('MATCHED');

    // Second execution within 5000ms cooldown (t = 2000)
    const secondResult = evaluator.evaluate(sampleGiftEvent, 2000);
    expect(secondResult.status).toBe('COOLDOWN');
    expect(secondResult.matchedRule?.id).toBe('rule-gift-icecream');
    expect(secondResult.action).toBeUndefined();

    // Third execution after cooldown expired (t = 6500)
    const thirdResult = evaluator.evaluate(sampleGiftEvent, 6500);
    expect(thirdResult.status).toBe('MATCHED');
  });

  it('recognizes disabled rules', () => {
    const evaluator = new RuleEvaluator(rules);
    const followEvent: ChaosEvent<'follow'> = {
      id: 'evt-follow-1',
      platform: 'tiktok',
      type: 'follow',
      user: { id: 'u4', displayName: 'Follower' },
      value: 5,
      metadata: {},
      raw: {},
      timestamp: 1000,
    };

    const result = evaluator.evaluate(followEvent);
    expect(result.status).toBe('DISABLED');
    expect(result.matchedRule?.id).toBe('rule-disabled');
    expect(result.action).toBeUndefined();
  });
});
