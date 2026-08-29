# Chaos-Live — Protocol Specification

**Package:** `@chaos-live/shared-protocol`  
**Current Version:** `0.1.0`

This document defines the data schemas, wire formats, and contract interfaces governing communication between streaming platform adapters, the core event engine, game targets, and overlay clients.

---

## 1. Domain Event Contract: `ChaosEvent<T>`

The universal normalized event envelope emitted by all `PlatformAdapter`s.

```typescript
export interface ChaosEvent<T extends EventType = EventType> {
  /** Unique UUIDv4 identifier. Serves as correlationId across the full system. */
  readonly id: string;

  /** Platform source: 'tiktok' | 'twitch' | 'youtube' | 'mock'. */
  readonly platform: Platform;

  /** Discriminated event type. */
  readonly type: T;

  /** The stream user who triggered the event. */
  readonly user: StreamUser;

  /**
   * Computed economic/engagement weight.
   * - Gift: diamondCount * repeatCount
   * - Like: likeCount
   * - Follow: 5
   * - Share: 10
   * - Subscribe: 50
   * - Comment: 1
   */
  readonly value: number;

  /** Type-specific metadata payload. */
  readonly metadata: EventMetadataMap[T];

  /** Original raw platform payload (debug only). */
  readonly raw: unknown;

  /** Timestamp in ms (Unix epoch). */
  readonly timestamp: number;
}

export interface StreamUser {
  readonly id: string;
  readonly displayName: string;
}
```

### Event Metadata Types

```typescript
export interface GiftMetadata {
  readonly giftName: string;
  readonly giftId: number;
  readonly repeatCount: number;
  readonly diamondCount: number;
}

export interface LikeMetadata {
  readonly likeCount: number;
}

export interface CommentMetadata {
  readonly text: string;
}

export interface FollowMetadata {}

export interface ShareMetadata {}

export interface SubscribeMetadata {
  readonly tier?: number;
}

export interface ViewerCountMetadata {
  readonly viewerCount: number;
}
```

---

## 2. Game Action Contract: `GameAction`

The executable command produced by the `RuleEvaluator` and dispatched to `GameAdapter` implementations.

```typescript
export type ActionType =
  | 'execute_command'   // Minecraft console command (RCON MVP)
  | 'spawn_mob'         // Entity spawn instruction
  | 'apply_effect'      // Status/potion effect
  | 'send_title'        // Screen HUD title/subtitle
  | 'send_chat'         // In-game tellraw chat relay
  | 'run_function'      // Datapack function execution
  | 'custom';           // Mod-specific extension

export interface GameAction {
  /** Originating ChaosEvent.id for end-to-end tracing. */
  readonly id: string;

  /** High-level action category. */
  readonly actionType: ActionType;

  /** Executable console command string (without leading slash). */
  readonly command: string;

  /** Structured payload for rich clients (e.g. Fabric Mod). */
  readonly payload: Record<string, unknown>;

  /** Action priority score (inherited from matched rule). */
  readonly priority: number;

  /** Unix timestamp in ms when the action was generated. */
  readonly timestamp: number;
}

export interface ActionResult {
  readonly actionId: string;
  readonly success: boolean;
  readonly response?: string;
  readonly error?: string;
  readonly durationMs: number;
}
```

---

## 3. Rule Definition Contract: `RuleDefinition`

Stored in `packages/app/config/rules.json` and evaluated by `RuleEvaluator`.

```typescript
export interface RuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly matcher: EventMatcher;
  readonly action: ActionTemplate;
  readonly priority: number;
  readonly cooldownMs: number;
}

export interface EventMatcher {
  readonly eventTypes?: readonly EventType[];
  readonly platforms?: readonly Platform[];
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly metadataMatch?: Record<string, unknown>;
}

export interface ActionTemplate {
  readonly actionType: ActionType;
  readonly command: string;
  readonly payload?: Record<string, unknown>;
}
```

### Template Variable Interpolation
Strings within `ActionTemplate.command` and `ActionTemplate.payload` dynamically replace `${...}` tokens:
- `${user.displayName}`: User's display name
- `${user.id}`: User's platform ID
- `${event.value}`: Total computed value/diamonds
- `${event.type}`: Event type
- `${event.id}`: Correlation UUID
- `${metadata.<key>}`: Any metadata field (e.g. `${metadata.giftName}`, `${metadata.text}`)

---

## 4. WebSocket Hub Wire Protocol (Phase 4 & Phase 6)

The WebSocket server in `packages/app/src/server.ts` serves as the centralized hub for:
1. **OBS Overlay (Client):** Consumes broadcast event feeds and goal animations.
2. **Fabric Mod (Client):** Receives structured `GameAction`s and sends back game state telemetry.

### Handshake Header
Connecting clients supply:
```json
{
  "clientType": "overlay" | "mod",
  "protocolVersion": "0.1.0",
  "secretToken": "optional_auth_token"
}
```

### Server-to-Client Broadcast Packet
```json
{
  "type": "CHAOS_EVENT" | "GAME_ACTION" | "GOAL_PROGRESS",
  "payload": { ... },
  "timestamp": 1724900000000
}
```
