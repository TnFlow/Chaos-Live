// @chaos-live/shared-protocol
// Single source of truth for cross-package domain schemas.

export { PROTOCOL_VERSION } from './protocol-version.js';

export type {
  Platform,
  EventType,
  StreamUser,
  GiftMetadata,
  LikeMetadata,
  CommentMetadata,
  ShareMetadata,
  FollowMetadata,
  SubscribeMetadata,
  ViewerCountMetadata,
  EventMetadataMap,
  ChaosEvent,
} from './chaos-event.js';

export type {
  ActionType,
  GameAction,
  ActionResult,
} from './game-action.js';

export {
  DEFAULT_OVERLAY_SETTINGS,
  type OverlaySettings,
  type OverlayLayout,
  type OverlayTheme,
  type RewardsDisplayMode,
  type WidgetPosition,
} from './overlay-settings.js';

export {
  TIKTOK_GIFTS,
  getGiftByName,
  getGiftCoins,
  type GiftCategory,
  type TikTokGiftPreset,
} from './tiktok-gifts.js';
