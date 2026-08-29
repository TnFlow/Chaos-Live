/**
 * Supported streaming platforms.
 * Extensible — add new platforms here as adapters are implemented.
 */
export type Platform = 'tiktok' | 'twitch' | 'youtube' | 'mock';

/**
 * Normalized event types from any streaming platform.
 */
export type EventType = 'gift' | 'like' | 'follow' | 'comment' | 'share' | 'subscribe' | 'viewer_count';

/**
 * Minimal user identity from a streaming platform.
 * Only display-safe fields — no PII beyond what the platform publicly shows.
 */
export interface StreamUser {
  /** Platform-specific user identifier (anonymized where possible). */
  readonly id: string;
  /** Public display name as shown on the platform. */
  readonly displayName: string;
}

/**
 * Event-type-specific metadata.
 * Each event type carries its own shape of additional data.
 */
export interface GiftMetadata {
  readonly giftName: string;
  readonly giftId: number;
  /** Number of times the gift was repeated in a streak/combo. */
  readonly repeatCount: number;
  /** Diamond value of the gift (TikTok's virtual currency unit). */
  readonly diamondCount: number;
}

export interface LikeMetadata {
  /** Number of likes in this batch (platforms often batch likes). */
  readonly likeCount: number;
}

export interface CommentMetadata {
  /** Sanitized comment text. */
  readonly text: string;
}

export interface ShareMetadata {
  // Currently empty — reserved for future platform-specific share data.
}

export interface FollowMetadata {
  // Currently empty — reserved for future platform-specific follow data.
}

export interface SubscribeMetadata {
  /** Subscription tier or level, if applicable. */
  readonly tier?: number;
}

export interface ViewerCountMetadata {
  /** Current viewer count at the time of the event. */
  readonly viewerCount: number;
}

/**
 * Maps each EventType to its corresponding metadata shape.
 */
export interface EventMetadataMap {
  gift: GiftMetadata;
  like: LikeMetadata;
  follow: FollowMetadata;
  comment: CommentMetadata;
  share: ShareMetadata;
  subscribe: SubscribeMetadata;
  viewer_count: ViewerCountMetadata;
}

/**
 * ChaosEvent — the universal normalized event schema.
 *
 * Every streaming platform adapter normalizes its raw events into this shape.
 * The core engine, queue, and rule evaluator operate exclusively on ChaosEvent.
 * No downstream component should ever import platform-specific types.
 *
 * Generic parameter `T` is the event type, enabling discriminated-union-style
 * access to the correct metadata shape:
 *
 * ```ts
 * function handleGift(event: ChaosEvent<'gift'>) {
 *   console.log(event.metadata.giftName); // type-safe
 * }
 * ```
 */
export interface ChaosEvent<T extends EventType = EventType> {
  /** Unique event ID (UUID v4). Used as correlation ID across the full pipeline. */
  readonly id: string;

  /** Source streaming platform. */
  readonly platform: Platform;

  /** Normalized event type. */
  readonly type: T;

  /** The user who triggered the event. */
  readonly user: StreamUser;

  /**
   * Normalized economic/weight value of the event.
   * - Gifts: diamond count × repeat count
   * - Likes: like count
   * - Follow/Subscribe: configurable base weight
   * - Comments: 1 (or configurable)
   * Used by the priority queue's scoring function.
   */
  readonly value: number;

  /** Type-specific metadata, strongly typed per event type. */
  readonly metadata: EventMetadataMap[T];

  /**
   * Original raw payload from the platform adapter.
   * For debugging only — never used in business logic.
   * Logged at `debug` level, stripped in production if needed.
   */
  readonly raw: unknown;

  /** Unix timestamp in milliseconds when the event was received by the adapter. */
  readonly timestamp: number;
}
