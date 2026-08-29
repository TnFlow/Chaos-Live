import type { GameAction, ActionResult } from '@chaos-live/shared-protocol';

/**
 * GameAdapter — port interface for game target connectors.
 *
 * Each game target (Minecraft RCON, Fabric mod, future games) implements this.
 * The core engine dispatches GameActions through this abstraction.
 *
 * Lifecycle: connect() → executeAction() calls → disconnect()
 */
export interface GameAdapter {
  /** Human-readable name of this adapter (e.g., "Minecraft RCON", "Fabric Mod"). */
  readonly name: string;

  /**
   * Connect to the game server.
   * Should handle connection setup and authentication.
   * @throws if the connection cannot be established.
   */
  connect(): Promise<void>;

  /**
   * Gracefully disconnect from the game server.
   * Should clean up all resources.
   */
  disconnect(): Promise<void>;

  /**
   * Execute a game action.
   * The adapter translates the GameAction into game-specific commands.
   *
   * @param action - The action to execute.
   * @returns Result of the action execution.
   */
  executeAction(action: GameAction): Promise<ActionResult>;

  /**
   * Check if the game server is reachable and responsive.
   * Used by the circuit breaker to determine adapter health.
   *
   * @returns true if the server is healthy.
   */
  healthCheck(): Promise<boolean>;

  /** Whether the adapter is currently connected. */
  isConnected(): boolean;
}
