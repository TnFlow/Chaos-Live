// @chaos-live/core
// Domain logic: event engine, rule evaluator, priority queue, goal engine.

// Domain models & port interfaces
export type {
  RuleDefinition,
  EventMatcher,
  ActionTemplate,
  PipelineState,
  PipelineLogEntry,
  PlatformAdapter,
  GameAdapter,
  QueuePort,
  QueueItem,
} from './domain/index.js';

// Engine
export {
  RuleEvaluator,
  interpolateString,
  interpolatePayload,
  type EvaluationResult,
} from './engine/rule-evaluator.js';

