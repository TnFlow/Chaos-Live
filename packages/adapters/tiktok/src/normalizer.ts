import { randomUUID } from 'node:crypto';
import { getGiftCoins } from '@chaos-live/shared-protocol';
import type {
  ChaosEvent,
  StreamUser,
  GiftMetadata,
  LikeMetadata,
  CommentMetadata,
  FollowMetadata,
  ShareMetadata,
  SubscribeMetadata,
  ViewerCountMetadata,
} from '@chaos-live/shared-protocol';

function extractUser(data: Record<string, unknown>): StreamUser {
  const id = String(data['userId'] ?? data['uniqueId'] ?? 'unknown_user');
  const displayName = String(data['nickname'] ?? data['uniqueId'] ?? 'Anonymous');
  return { id, displayName };
}

/**
 * Decide si un evento `gift` debe emitirse al motor.
 *
 * TikTok emite el evento varias veces mientras dura una racha: con
 * `repeatEnd: false` en cada pulsación y una última vez con `repeatEnd: true` y
 * el `repeatCount` definitivo. Esto solo ocurre con los regalos que admiten
 * racha (`giftType === 1`), que son los baratos y más frecuentes.
 *
 * Si no se filtran las emisiones intermedias, una racha de 10 rosas dispara ~10
 * acciones en el juego y suma de más en metas y clasificación.
 *
 * Los regalos que no admiten racha (`giftType !== 1`) llegan una sola vez y se
 * emiten siempre.
 */
export function shouldEmitGift(data: Record<string, unknown>): boolean {
  const giftType = Number(data['giftType'] ?? 0);
  if (giftType !== 1) {
    return true;
  }
  return data['repeatEnd'] === true || data['repeatEnd'] === 1;
}

export function normalizeGift(data: Record<string, unknown>): ChaosEvent<'gift'> {
  const user = extractUser(data);
  const giftName = String(data['giftName'] ?? 'Unknown Gift');
  const giftId = Number(data['giftId'] ?? 0);
  const repeatCount = Number(data['repeatCount'] ?? 1);
  // Si TikTok no manda `diamondCount`, deducirlo del catálogo antes de caer al
  // valor 1, que infravaloraría los regalos caros.
  const rawDiamondCount = Number(data['diamondCount'] ?? 0);
  const diamondCount = rawDiamondCount > 0 ? rawDiamondCount : (getGiftCoins(giftName) ?? 1);

  // Economic value is diamond count * streak count
  const value = Math.max(1, diamondCount * Math.max(1, repeatCount));

  const metadata: GiftMetadata = {
    giftName,
    giftId,
    repeatCount,
    diamondCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'gift',
    user,
    value,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeLike(data: Record<string, unknown>): ChaosEvent<'like'> {
  const user = extractUser(data);
  const likeCount = Number(data['likeCount'] ?? 1);

  const metadata: LikeMetadata = {
    likeCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'like',
    user,
    value: likeCount,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeComment(data: Record<string, unknown>): ChaosEvent<'comment'> {
  const user = extractUser(data);
  const text = String(data['comment'] ?? '').trim();

  const metadata: CommentMetadata = {
    text,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'comment',
    user,
    value: 1,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeFollow(data: Record<string, unknown>): ChaosEvent<'follow'> {
  const user = extractUser(data);
  const metadata: FollowMetadata = {};

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'follow',
    user,
    value: 5, // Baseline weight for follows
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeShare(data: Record<string, unknown>): ChaosEvent<'share'> {
  const user = extractUser(data);
  const metadata: ShareMetadata = {};

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'share',
    user,
    value: 10, // Baseline weight for shares
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeSubscribe(data: Record<string, unknown>): ChaosEvent<'subscribe'> {
  const user = extractUser(data);
  const tier = typeof data['subMonth'] === 'number' ? Number(data['subMonth']) : undefined;

  const metadata: SubscribeMetadata = {
    tier,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'subscribe',
    user,
    value: 50, // Baseline weight for subscriptions
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}

export function normalizeViewerCount(data: Record<string, unknown>): ChaosEvent<'viewer_count'> {
  const viewerCount = Number(data['viewerCount'] ?? 0);
  const metadata: ViewerCountMetadata = {
    viewerCount,
  };

  return {
    id: randomUUID(),
    platform: 'tiktok',
    type: 'viewer_count',
    user: { id: 'system', displayName: 'System' },
    value: viewerCount,
    metadata,
    raw: data,
    timestamp: Date.now(),
  };
}
