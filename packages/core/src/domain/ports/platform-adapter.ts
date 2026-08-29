import type { ChaosEvent } from '@chaos-live/shared-protocol';

/**
 * PlatformAdapter — port interface for streaming platform connectors.
 *
 * Each streaming platform (TikTok, Twitch, YouTube) implements this interface.
 * The core engine depends on this abstraction, never on concrete platform libraries.
 *
 * Lifecycle: connect() → events flow via onEvent callback → disconnect()
 */
export interface PlatformAdapter {
  /** Human-readable name of this adapter (e.g., "TikTok LIVE", "Mock"). */
  readonly name: string;

  /**
   * Connect to the streaming platform and begin receiving events.
   * Should handle internal reconnection with exponential backoff.
   * @throws if the initial connection cannot be established.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnect from the streaming platform.
   * Should clean up all resources and stop event emission.
   */
  disconnect(): Promise<void>;

  /**
   * Register a callback to receive normalized ChaosEvents.
   * The adapter is responsible for normalizing raw platform events
   * into ChaosEvent before invoking this callback.
   *
   * @param handler - Called for each normalized event.
   */
  onEvent(handler: (event: ChaosEvent) => void): void;

  /**
   * Register a callback to receive adapter-level errors.
   * These are operational errors (connection drops, auth failures),
   * not per-event processing errors.
   *
   * @param handler - Called with the error.
   */
  onError(handler: (error: Error) => void): void;

  /** Whether the adapter is currently connected and receiving events. */
  isConnected(): boolean;
}
