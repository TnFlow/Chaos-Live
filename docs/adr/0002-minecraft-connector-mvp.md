# ADR-0002: Minecraft Connector — RCON for MVP

**Status:** Accepted
**Date:** 2024-08-29

## Context

Chaos-Live needs to execute actions inside a Minecraft Java Edition server in response to streaming events. Three viable integration approaches were evaluated:

1. **RCON** — Minecraft's built-in remote command protocol.
2. **Custom Fabric mod with embedded WebSocket server** — A mod running inside the game that receives commands via WebSocket.
3. **Bukkit/Paper plugin** — A server-side plugin using the Bukkit API.

## Decision

**Use RCON for the MVP. Evolve to a custom Fabric mod (1.20.1) in Phase 6.**

### RCON (MVP — Phase 3)

- **Pros:**
  - Zero mod/plugin development required.
  - Works with vanilla, Paper, Fabric, and Forge servers.
  - Fastest path to validating the end-to-end pipeline.
  - Well-understood protocol with existing Node.js libraries.
- **Cons:**
  - Limited to vanilla commands (`/summon`, `/effect`, `/give`, `/particle`, `/title`).
  - One command at a time; moderate latency per command.
  - No return channel — cannot observe game state.
  - No custom entities, effects, or complex interactions.

### Fabric Mod (Phase 6)

- **Approach:** A custom Fabric mod for Minecraft 1.20.1 acting as a **WebSocket client** that connects outbound to the Chaos-Live middleware's WebSocket hub (`app/server.ts`).
- **Key design:** The mod dials OUT to the middleware — it does not expose its own server. This avoids firewall/NAT issues and lets the same WebSocket hub serve both the overlay and the mod.
- **Pros:**
  - Full access to the Minecraft API (custom entities, effects, world state).
  - Bidirectional: the mod can emit `GameEvent`s back (player death, objectives).
  - Richer, more engaging viewer interactions.
- **Cons:**
  - Requires maintenance per Minecraft version.
  - Mod development adds Java/Kotlin to the stack.
  - Fabric Language Kotlin adds a runtime dependency if Kotlin is chosen.

## Consequences

- The `GameAdapter` port interface is designed to abstract both RCON and WebSocket-based mod connections.
- Phase 3 implements `RconAdapter` implementing `GameAdapter`.
- Phase 6 implements `FabricModAdapter` implementing the same `GameAdapter` interface.
- The middleware's WebSocket hub (built in Phase 4 for the overlay) is designed generically from day one with `clientType: "overlay" | "mod"` to avoid rework.
