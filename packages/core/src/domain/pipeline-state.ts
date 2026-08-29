/**
 * Pipeline state transitions for structured logging and observability.
 * Every event's journey through the pipeline is traced via these states,
 * each logged with the event's correlation ID.
 */
export type PipelineState =
  | 'EVENT_RECEIVED'
  | 'EVENT_VALIDATED'
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
}
