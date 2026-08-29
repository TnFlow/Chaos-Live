import { randomUUID } from 'node:crypto';
import type { ChaosEvent } from '@chaos-live/shared-protocol';

/**
 * Normalizes a Twitch channel.cheer event to a ChaosEvent<'gift'>.
 */
export function normalizeTwitchCheer(raw: Record<string, unknown>): ChaosEvent<'gift'> {
  const isAnon = Boolean(raw['is_anonymous']);
  const userId = isAnon ? 'anonymous' : String(raw['user_id'] || 'unknown');
  const userName = isAnon ? 'Anonymous' : String(raw['user_name'] || 'Anonymous');
  const bits = Number(raw['bits'] || 1);

  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'gift',
    user: {
      id: userId,
      displayName: userName,
    },
    value: bits,
    metadata: {
      giftName: `Cheer ${bits} Bits`,
      giftId: bits,
      repeatCount: 1,
      diamondCount: bits,
    },
    raw,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a Twitch channel.follow event to a ChaosEvent<'follow'>.
 */
export function normalizeTwitchFollow(raw: Record<string, unknown>): ChaosEvent<'follow'> {
  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'follow',
    user: {
      id: String(raw['user_id'] || 'unknown'),
      displayName: String(raw['user_name'] || 'Anonymous'),
    },
    value: 5,
    metadata: {},
    raw,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a Twitch channel.subscribe or subscription.message event to a ChaosEvent<'subscribe'>.
 */
export function normalizeTwitchSubscribe(raw: Record<string, unknown>): ChaosEvent<'subscribe'> {
  const rawTier = String(raw['tier'] || '1000');
  const tierNum = rawTier === '3000' ? 3 : rawTier === '2000' ? 2 : 1;
  const value = tierNum === 3 ? 25 : tierNum === 2 ? 10 : 5;

  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'subscribe',
    user: {
      id: String(raw['user_id'] || 'unknown'),
      displayName: String(raw['user_name'] || 'Anonymous'),
    },
    value,
    metadata: {
      tier: tierNum,
    },
    raw,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a Twitch channel points redemption to a ChaosEvent<'gift'> so it maps cleanly to gift rules.
 */
export function normalizeTwitchReward(raw: Record<string, unknown>): ChaosEvent<'gift'> {
  const reward = (raw['reward'] as Record<string, unknown>) || {};
  const cost = Number(reward['cost'] || 100);
  const title = String(reward['title'] || 'Custom Reward');

  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'gift',
    user: {
      id: String(raw['user_id'] || 'unknown'),
      displayName: String(raw['user_name'] || 'Anonymous'),
    },
    value: cost,
    metadata: {
      giftName: title,
      giftId: cost,
      repeatCount: 1,
      diamondCount: cost,
    },
    raw,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a Twitch channel.chat.message event to a ChaosEvent<'comment'>.
 */
export function normalizeTwitchChat(raw: Record<string, unknown>): ChaosEvent<'comment'> {
  const message = (raw['message'] as Record<string, unknown>) || {};
  const text = String(message['text'] || '');

  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'comment',
    user: {
      id: String(raw['chatter_user_id'] || 'unknown'),
      displayName: String(raw['chatter_user_name'] || 'Anonymous'),
    },
    value: 1,
    metadata: {
      text,
    },
    raw,
    timestamp: Date.now(),
  };
}

/**
 * Normalizes a Twitch channel.raid event to a ChaosEvent<'share'>.
 */
export function normalizeTwitchRaid(raw: Record<string, unknown>): ChaosEvent<'share'> {
  const viewers = Number(raw['viewers'] || 1);

  return {
    id: randomUUID(),
    platform: 'twitch',
    type: 'share',
    user: {
      id: String(raw['from_broadcaster_user_id'] || 'unknown'),
      displayName: String(raw['from_broadcaster_user_name'] || 'Raid Leader'),
    },
    value: viewers,
    metadata: {},
    raw,
    timestamp: Date.now(),
  };
}
