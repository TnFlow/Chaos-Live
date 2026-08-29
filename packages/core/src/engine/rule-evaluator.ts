import type { ChaosEvent, GameAction } from '@chaos-live/shared-protocol';
import type { RuleDefinition } from '../domain/rule-definition.js';

export interface EvaluationResult {
  /** The generated action if a rule matched and passed cooldown/enablement checks. */
  action?: GameAction;
  /** The rule that matched the event, if any. */
  matchedRule?: RuleDefinition;
  /** Reason when no action is generated. */
  status: 'MATCHED' | 'NO_MATCH' | 'COOLDOWN' | 'DISABLED';
}

/**
 * Interpolates `${path.to.property}` expressions within a template string.
 * Supports:
 *   - ${user.id}
 *   - ${user.displayName}
 *   - ${event.id}
 *   - ${event.type}
 *   - ${event.platform}
 *   - ${event.value}
 *   - ${metadata.<key>}
 */
export function interpolateString(template: string, event: ChaosEvent): string {
  return template.replace(/\$\{([^}]+)\}/g, (_match, path: string) => {
    const segments = path.trim().split('.');
    let current: unknown = {
      user: event.user,
      event: {
        id: event.id,
        type: event.type,
        platform: event.platform,
        value: event.value,
        timestamp: event.timestamp,
      },
      metadata: event.metadata,
    };

    for (const segment of segments) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return '';
      }
      current = (current as Record<string, unknown>)[segment];
    }

    if (current === null || current === undefined) {
      return '';
    }

    return String(current);
  });
}

/**
 * Recursively interpolates string values inside an object/record template.
 */
export function interpolatePayload(
  payload: Record<string, unknown>,
  event: ChaosEvent,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string') {
      result[key] = interpolateString(value, event);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string'
          ? interpolateString(item, event)
          : item && typeof item === 'object'
            ? interpolatePayload(item as Record<string, unknown>, event)
            : item,
      );
    } else if (value && typeof value === 'object') {
      result[key] = interpolatePayload(value as Record<string, unknown>, event);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * RuleEvaluator
 * Evaluates incoming ChaosEvents against configured RuleDefinitions.
 * Rules are sorted by priority (highest first) and evaluated in order.
 * First matching rule wins.
 */
export class RuleEvaluator {
  private rules: RuleDefinition[] = [];
  private lastTriggeredTimes = new Map<string, number>();

  constructor(rules: RuleDefinition[] = []) {
    this.setRules(rules);
  }

  /**
   * Sets rules, sorting them by priority descending.
   */
  public setRules(rules: RuleDefinition[]): void {
    this.rules = [...rules].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Returns current active rules in priority order.
   */
  public getRules(): readonly RuleDefinition[] {
    return this.rules;
  }

  /**
   * Clear cooldown history for all or specific rules.
   */
  public resetCooldowns(ruleId?: string): void {
    if (ruleId) {
      this.lastTriggeredTimes.delete(ruleId);
    } else {
      this.lastTriggeredTimes.clear();
    }
  }

  /**
   * Evaluates an incoming ChaosEvent against registered rules.
   */
  public evaluate(event: ChaosEvent, now = Date.now()): EvaluationResult {
    for (const rule of this.rules) {
      if (!this.matches(rule, event)) {
        continue;
      }

      if (!rule.enabled) {
        return {
          matchedRule: rule,
          status: 'DISABLED',
        };
      }

      // Check cooldown
      const lastTriggered = this.lastTriggeredTimes.get(rule.id);
      if (lastTriggered !== undefined && rule.cooldownMs > 0 && now - lastTriggered < rule.cooldownMs) {
        return {
          matchedRule: rule,
          status: 'COOLDOWN',
        };
      }

      // Rule matched and eligible: record trigger time
      this.lastTriggeredTimes.set(rule.id, now);

      const command = interpolateString(rule.action.command, event);
      const payload = rule.action.payload ? interpolatePayload(rule.action.payload, event) : {};

      const action: GameAction = {
        id: event.id,
        actionType: rule.action.actionType,
        command,
        payload,
        priority: rule.priority,
        timestamp: now,
      };

      return {
        action,
        matchedRule: rule,
        status: 'MATCHED',
      };
    }

    return {
      status: 'NO_MATCH',
    };
  }

  /**
   * Checks whether an event satisfies a rule's matcher criteria.
   */
  private matches(rule: RuleDefinition, event: ChaosEvent): boolean {
    const { matcher } = rule;

    // Event type matching
    if (matcher.eventTypes && matcher.eventTypes.length > 0) {
      if (!matcher.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Platform matching
    if (matcher.platforms && matcher.platforms.length > 0) {
      if (!matcher.platforms.includes(event.platform)) {
        return false;
      }
    }

    // Min value threshold
    if (matcher.minValue !== undefined) {
      if (event.value < matcher.minValue) {
        return false;
      }
    }

    // Max value threshold
    if (matcher.maxValue !== undefined) {
      if (event.value > matcher.maxValue) {
        return false;
      }
    }

    // Specific metadata matching
    if (matcher.metadataMatch) {
      const metadata = (event.metadata ?? {}) as Record<string, unknown>;
      for (const [key, expectedValue] of Object.entries(matcher.metadataMatch)) {
        if (metadata[key] !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }
}
