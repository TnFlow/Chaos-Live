/**
 * Action types that can be dispatched to a game adapter.
 * Extensible — add new action types as game capabilities grow.
 *
 * MVP (RCON): primarily uses 'execute_command'.
 * Phase 6 (Fabric mod): uses richer types like 'spawn_mob', 'apply_effect'.
 */
export type ActionType =
  | 'execute_command'   // Raw command string (RCON MVP)
  | 'spawn_mob'         // Spawn an entity at a location
  | 'apply_effect'      // Apply a potion/particle effect
  | 'send_title'        // Display a title/subtitle on screen
  | 'send_chat'         // Send a chat message
  | 'run_function'      // Run a datapack function
  | 'custom';           // Catch-all for mod-specific actions

/**
 * GameAction — the command dispatched to a game adapter.
 *
 * Produced by the RuleEvaluator when a ChaosEvent matches a rule.
 * The GameAdapter translates this into platform-specific commands
 * (e.g., RCON command strings, or mod WebSocket messages).
 *
 * The `id` field matches the originating ChaosEvent.id for
 * end-to-end correlation and tracing through the full pipeline.
 */
export interface GameAction {
  /** Correlation ID — matches the originating ChaosEvent.id. */
  readonly id: string;

  /** The type of action to perform. */
  readonly actionType: ActionType;

  /**
   * The raw command string to execute.
   * Used directly by RCON adapter (MVP).
   * For mod-based adapters, this may be empty if `payload` is used instead.
   */
  readonly command: string;

  /**
   * Structured payload for richer game adapters (Phase 6 mod).
   * The mod interprets this based on `actionType`.
   *
   * Examples:
   * - spawn_mob: { entityType: "minecraft:zombie", x: 0, y: 64, z: 0 }
   * - apply_effect: { effect: "minecraft:speed", duration: 200, amplifier: 1 }
   */
  readonly payload: Record<string, unknown>;

  /**
   * Priority score (higher = more important).
   * Inherited from the rule that produced this action,
   * potentially modified by the queue's scoring function.
   */
  readonly priority: number;

  /** Unix timestamp in milliseconds when this action was created. */
  readonly timestamp: number;
}

/**
 * Result of attempting to execute a GameAction.
 */
export interface ActionResult {
  /** The action that was executed. */
  readonly actionId: string;

  /** Whether the action was successfully executed. */
  readonly success: boolean;

  /** Response from the game server (e.g., RCON response text). */
  readonly response?: string;

  /** Error message if the action failed. */
  readonly error?: string;

  /** Execution duration in milliseconds. */
  readonly durationMs: number;
}
