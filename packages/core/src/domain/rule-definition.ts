import type { EventType, Platform, ActionType } from '@chaos-live/shared-protocol';

/**
 * Conditions that a ChaosEvent must satisfy for a rule to match.
 */
export interface EventMatcher {
  /** Match events of these types. Empty array or undefined = match all types. */
  readonly eventTypes?: readonly EventType[];

  /** Match events from these platforms. Empty array or undefined = match all. */
  readonly platforms?: readonly Platform[];

  /**
   * Minimum event value to trigger this rule.
   * e.g., only trigger on gifts worth ≥ 100 diamonds.
   */
  readonly minValue?: number;

  /**
   * Maximum event value for this rule.
   * Used to create value-range tiers (e.g., 1–99 = small, 100–499 = medium).
   */
  readonly maxValue?: number;

  /**
   * Optional: match only specific metadata fields.
   * e.g., { giftName: "Rose" } to match only Rose gifts.
   * Keys are matched against ChaosEvent.metadata using shallow equality.
   */
  readonly metadataMatch?: Record<string, unknown>;
}

/**
 * Template for generating a GameAction when a rule matches.
 * String fields support variable interpolation:
 *   ${user.displayName}, ${event.value}, ${metadata.giftName}, etc.
 */
export interface ActionTemplate {
  /** The type of action to produce. */
  readonly actionType: ActionType;

  /**
   * Command template for RCON (MVP).
   * Supports variable interpolation:
   *   "/summon minecraft:zombie ~ ~ ~"
   *   "/title @a title {\"text\":\"${user.displayName} sent a ${metadata.giftName}!\"}"
   */
  readonly command: string;

  /**
   * Structured payload template for rich game adapters (Phase 6 mod).
   */
  readonly payload?: Record<string, unknown>;
}

/**
 * RuleDefinition — maps ChaosEvents to GameActions.
 *
 * Rules are loaded from config/rules.json and evaluated by the RuleEvaluator.
 * When a ChaosEvent satisfies a rule's matcher, the rule's action template
 * is used to produce a GameAction.
 *
 * Rules are evaluated in priority order (highest first).
 * First match wins — only one rule fires per event.
 */
export interface RuleDefinition {
  /** Unique rule identifier. */
  readonly id: string;

  /** Human-readable name for logging and admin display. */
  readonly name: string;

  /** Whether this rule is active. Disabled rules are skipped. */
  readonly enabled: boolean;

  /** Conditions the event must satisfy. */
  readonly matcher: EventMatcher;

  /** Template for the action to produce when matched. */
  readonly action: ActionTemplate;

  /**
   * Base priority for actions produced by this rule.
   * Higher = more important = dequeued sooner.
   * The queue's scoring function may further adjust this.
   */
  readonly priority: number;

  /**
   * Minimum time (ms) between triggers of this rule.
   * Prevents spam from rapid-fire events of the same type.
   * 0 = no cooldown.
   */
  readonly cooldownMs: number;
}
