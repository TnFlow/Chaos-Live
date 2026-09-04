// @chaos-live/core
// Domain logic: event engine, rule evaluator, priority queue, goal engine.

// Domain models & port interfaces
export type {
  RuleDefinition,
  EventMatcher,
  ActionTemplate,
  ViewerFeedback,
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

// Session state
export {
  SessionLeaderboard,
  type LeaderboardEntry,
  type SessionLeaderboardOptions,
} from './session/session-leaderboard.js';

// Database
export {
  getPrismaClient,
  closePrismaClient,
  recordProcessedEvent,
} from './db/client.js';

// Multi-Tenant SaaS Foundation
export {
  type TenantConfig,
  type TenantContext,
} from './tenant/tenant-context.js';
export {
  TenantManager,
} from './tenant/tenant-manager.js';
export {
  PrismaTokenVault,
  type TokenVault,
  type OAuthTokenRecord,
} from './tenant/token-vault.js';


