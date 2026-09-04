import type { ChaosEvent, GameAction } from '@chaos-live/shared-protocol';

/**
 * Pipeline state transitions for structured logging and observability.
 * Every event's journey through the pipeline is traced via these states,
 * each logged with the event's correlation ID.
 */
export type PipelineState =
  | 'EVENT_RECEIVED'
  | 'EVENT_VALIDATED'
  | 'GOAL_PROGRESS'
  | 'GOAL_COMPLETED'
  | 'RULE_MATCHED'
  | 'RULE_NOT_MATCHED'
  | 'RULE_COOLDOWN'
  | 'EVENT_QUEUED'
  | 'ACTION_DISPATCHED'
  | 'EVENT_COMPLETED'
  | 'EVENT_FAILED';

/**
 * Structured pipeline log entry.
 * Emitted at each state transition for end-to-end tracing.
 */
export interface PipelineLogEntry {
  /** Correlation ID (= ChaosEvent.id). */
  readonly correlationId: string;
  /** The pipeline state this entry represents. */
  readonly state: PipelineState;
  /** Unix timestamp (ms) of this state transition. */
  readonly timestamp: number;
  /** Optional details (rule name, error message, etc.). */
  readonly details?: Record<string, unknown>;
  /**
   * The originating event, present from `EVENT_RECEIVED` onwards.
   *
   * Lets listeners broadcast and persist the event without subscribing to the
   * platform adapter separately — which would create a second, unordered
   * consumer of the same stream.
   */
  readonly event?: ChaosEvent;
  /**
   * The action this entry refers to, when the state involves one
   * (`ACTION_DISPATCHED`, `EVENT_COMPLETED`, `EVENT_FAILED` after dispatch).
   *
   * Listeners need the whole action — not just a flattened copy inside
   * `details` — to persist the audit trail and to render overlay alerts.
   */
  readonly action?: GameAction;
}
