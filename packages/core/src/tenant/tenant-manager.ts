import type { ChaosEvent, GameAction } from '@chaos-live/shared-protocol';
import { RuleEvaluator } from '../engine/rule-evaluator.js';
import { GoalEngine } from '../goals/goal-engine.js';
import { InMemoryPriorityQueue } from '../queue/in-memory-priority-queue.js';
import type { TenantConfig, TenantContext } from './tenant-context.js';

export class TenantManager {
  private readonly tenants = new Map<string, TenantContext>();
  private readonly defaultTenantId: string;

  constructor(defaultTenantId = 'default') {
    this.defaultTenantId = defaultTenantId;
    // Bootstrap default tenant context
    this.registerTenant({
      tenantId: this.defaultTenantId,
      slug: this.defaultTenantId,
      name: 'Default Streamer',
      plan: 'pro',
    });
  }

  public registerTenant(config: TenantConfig): TenantContext {
    const queue = new InMemoryPriorityQueue({
      agingFactor: 1.5,
      rateLimits: {
        '*': { maxActions: 25, windowMs: 1000 },
      },
    });

    const ruleEvaluator = new RuleEvaluator(config.rules || []);
    const goalEngine = new GoalEngine(config.goals || []);

    const context: TenantContext = {
      tenantId: config.tenantId,
      slug: config.slug,
      name: config.name,
      plan: config.plan || 'free',
      ruleEvaluator,
      goalEngine,
      queue,
      gameAdapter: config.gameAdapter,
      createdAt: Date.now(),
    };

    this.tenants.set(config.tenantId, context);
    return context;
  }

  public getTenant(tenantId?: string): TenantContext | undefined {
    const targetId = tenantId || this.defaultTenantId;
    return this.tenants.get(targetId);
  }

  public getOrCreateTenant(tenantId?: string, fallbackConfig?: Partial<TenantConfig>): TenantContext {
    const targetId = tenantId || this.defaultTenantId;
    const existing = this.tenants.get(targetId);
    if (existing) return existing;

    return this.registerTenant({
      tenantId: targetId,
      slug: fallbackConfig?.slug || targetId,
      name: fallbackConfig?.name || `Streamer ${targetId}`,
      plan: fallbackConfig?.plan || 'free',
      rules: fallbackConfig?.rules,
      goals: fallbackConfig?.goals,
    });
  }

  public removeTenant(tenantId: string): boolean {
    if (tenantId === this.defaultTenantId) {
      return false; // Prevent removing default tenant
    }
    return this.tenants.delete(tenantId);
  }

  public listTenants(): TenantContext[] {
    return Array.from(this.tenants.values());
  }

  /**
   * Routes an incoming ChaosEvent to the appropriate tenant's rule evaluator & queue.
   */
  public async routeEvent(event: ChaosEvent): Promise<{
    tenant: TenantContext;
    action?: GameAction;
  }> {
    const tenant = this.getOrCreateTenant(event.tenantId);

    // 1. Process goals for this tenant
    const goalUpdates = await tenant.goalEngine.processEvent(event);
    for (const update of goalUpdates) {
      if (update.triggeredAction) {
        tenant.queue.enqueue({
          action: update.triggeredAction,
          score: 200,
          enqueuedAt: Date.now(),
        });
      }
    }

    // 2. Evaluate rule matching for this tenant
    const evaluation = tenant.ruleEvaluator.evaluate(event);
    if (evaluation.action) {
      tenant.queue.enqueue({
        action: evaluation.action,
        score: evaluation.action.priority,
        enqueuedAt: Date.now(),
      });
    }

    return {
      tenant,
      action: evaluation.action,
    };
  }
}
