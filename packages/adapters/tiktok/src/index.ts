// @chaos-live/adapter-tiktok
// TikTok LIVE platform adapter wrapping tiktok-live-connector.

export {
  TikTokAdapter,
  type TikTokAdapterConfig,
  type ReconnectConfig,
  type CircuitBreakerConfig,
} from './TikTokAdapter.js';

export {
  normalizeGift,
  shouldEmitGift,
  normalizeLike,
  normalizeComment,
  normalizeFollow,
  normalizeShare,
  normalizeSubscribe,
  normalizeViewerCount,
} from './normalizer.js';
