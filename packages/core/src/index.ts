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

export {
  EventEngine,
  type EventEngineConfig,
  type PipelineListener,
} from './engine/event-engine.js';

// Queue
export {
  InMemoryPriorityQueue,
  type InMemoryQueueConfig,
  type RateLimitRule,
} from './queue/in-memory-priority-queue.js';

// Goals
export {
  GoalEngine,
  type GoalConfig,
  type GoalState,
  type GoalProgressUpdate,
} from './goals/goal-engine.js';

// Database
export {
  getPrismaClient,
  closePrismaClient,
  recordProcessedEvent,
} from './db/client.js';


