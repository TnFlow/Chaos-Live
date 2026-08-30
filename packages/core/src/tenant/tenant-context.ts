import type { RuleDefinition } from '../domain/rule-definition.js';
import type { GoalConfig } from '../goals/goal-engine.js';
import type { RuleEvaluator } from '../engine/rule-evaluator.js';
import type { GoalEngine } from '../goals/goal-engine.js';
import type { QueuePort } from '../domain/ports/queue-port.js';
import type { GameAdapter } from '../domain/ports/game-adapter.js';

export interface TenantConfig {
  tenantId: string;
  slug: string;
  name: string;
  plan?: 'free' | 'creator' | 'pro';
  rules?: RuleDefinition[];
  goals?: GoalConfig[];
  gameAdapter?: GameAdapter;
}

export interface TenantContext {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly plan: string;
  readonly ruleEvaluator: RuleEvaluator;
  readonly goalEngine: GoalEngine;
  readonly queue: QueuePort;
  gameAdapter?: GameAdapter;
  createdAt: number;
}
