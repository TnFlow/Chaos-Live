# Chaos-Live — Implementation Plan (Revised)

## Overview

**Chaos-Live** is a modular, real-time event middleware that transforms TikTok LIVE audience interactions (gifts, likes, follows, comments, shares) into executable actions inside Minecraft Java Edition, with OBS overlay support. The long-term vision is a hosted SaaS platform for streamers; the MVP is a single-user, locally-hosted system.

This revision corrects two issues found in the previous draft (mod↔middleware connection direction, and an under-examined licensing default) and folds in decisions and rationale from the full architecture discussion that weren't yet reflected in the decisions table.

> **Changes from the previous draft are marked with 🔧.**

---

## Finalized Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Runtime** | Node.js 22 LTS + TypeScript | Mature real-time ecosystem, best `tiktok-live-connector` support |
| **Module System** | ES Modules (`import`/`export`) | Modern standard, native Node.js 22 support |
| **TypeScript Strictness** | Strict on core domain types, moderate elsewhere | Balance between safety and dev speed |
| **TikTok Connector** | `tiktok-live-connector` | No dev account needed, community standard, but reverse-engineered — isolate behind `PlatformAdapter` |
| **License** | 🔧 **Pending confirmation — see [Licensing Strategy](#licensing-strategy)** | AGPL-3.0 is one valid path, not a forced default — needs an explicit business decision before it's finalized |
| **Minecraft Connector (MVP)** | RCON | Zero mods, validates full pipeline fast |
| **Minecraft Connector (Phase 6)** | 🔧 Custom Fabric mod acting as a **WebSocket client** dialing out to the middleware | See [Mod ↔ Middleware Communication](#mod--middleware-communication-phase-6) — the mod must not expose its own server |
| **Event Queue (MVP)** | In-memory with priority support | Simplest, no external dependencies, no persistence needed for live events |
| **Event Queue (Future)** | BullMQ + Redis | Only if multi-tenant, cross-process, or historical-audit needs appear |
| **Database** | SQLite + Prisma ORM | Goals persistence, lightweight deployment |
| **Logging** | Pino (JSON structured) | Fast, structured, supports correlation IDs |
| **Testing** | Jest | Most popular, good ecosystem |
| **Linting** | ESLint + Prettier | Industry standard |
| **OBS Overlay** | Svelte | Lightweight, reactive, minimal footprint for a Browser Source |
| **Admin Panel** | Deferred (post-MVP) | CLI + JSON config for MVP; build only once hand-editing the config causes real friction |
| **Rule Config (MVP)** | JSON file (`config/rules.json`) | Simple, hand-editable |
| **Rule Config (Future)** | Web dashboard editor | Visual rule builder |
| **Deployment** | Docker Compose | Local, alongside OBS + Minecraft server |
| **Repo Structure** | Monorepo, npm workspaces for TS packages + separate Gradle project for the mod | Shared protocol evolves jointly during MVP; build tooling stays fully separate |
| **Documentation Language** | English for everything | Code, docs, comments, README |

---

## Licensing Strategy

🔧 This needs to be resolved as a conscious decision, not inherited by default from a dependency.

`tiktok-live-connector` moved from MIT to **AGPL-3.0** as of v2.4.1. AGPL has network copyleft: if Chaos-Live is offered as a hosted SaaS, the AGPL can require exposing the source of the combined work to users interacting with it over the network. Two viable paths:

1. **Open-source the whole project under AGPL-3.0.** Monetize later via hosting, support, or premium add-ons (the GitLab/n8n model). Simplest to implement — this is what the previous draft defaulted to.
2. **Keep the closed-source SaaS option open.** Isolate `adapters/tiktok` as its own package/process with a well-defined network boundary to the rest of the (differently-licensed) codebase, and/or plan to replace it with a commercially-licensed managed provider (e.g. Euler Stream, Tik.Tools) before the first paying SaaS customer.

**Action required:** confirm which path before setting `LICENSE` at the repo root. If path 2 is chosen, `adapters/tiktok/` keeps its own `LICENSE` (AGPL) while the root license stays proprietary/unlicensed, and Phase 2 should build against `TikTokAdapter` as a strictly separate deployable unit from day one — not just a folder.

For the MVP itself (personal use, not sold to anyone), either path works without any practical impact — this only matters before commercializing.

---

## Repository Structure

```
chaos-live/
├── packages/
│   ├── core/                     # Domain models, event engine, queue, rules — zero external deps
│   │   ├── src/
│   │   │   ├── domain/           # ChaosEvent, GameAction, port interfaces
│   │   │   ├── engine/           # EventEngine, RuleEvaluator
│   │   │   ├── queue/            # InMemoryQueue (MVP), BullMQ adapter (future)
│   │   │   ├── goals/            # GoalEngine, GoalState
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── shared-protocol/          # 🔧 NEW — single source of truth for ChaosEvent/GameAction schemas
│   │   ├── src/
│   │   │   ├── chaos-event.ts
│   │   │   ├── game-action.ts
│   │   │   └── protocol-version.ts
│   │   └── package.json
│   │
│   ├── adapters/
│   │   ├── tiktok/                # TikTok LIVE platform adapter — AGPL boundary, see Licensing Strategy
│   │   │   ├── src/
│   │   │   │   ├── TikTokAdapter.ts
│   │   │   │   ├── normalizer.ts
│   │   │   │   └── index.ts
│   │   │   ├── __tests__/
│   │   │   └── package.json      # own LICENSE file if isolation path is chosen
│   │   │
│   │   ├── mock/                  # Synthetic platform adapter for dev/testing
│   │   │
│   │   └── minecraft-rcon/        # Minecraft RCON game adapter (MVP)
│   │       ├── src/
│   │       │   ├── RconAdapter.ts
│   │       │   ├── command-builder.ts
│   │       │   └── index.ts
│   │       ├── __tests__/
│   │       └── package.json
│   │
│   ├── overlay/                   # Svelte OBS overlay
│   │   ├── src/
│   │   ├── public/
│   │   └── package.json
│   │
│   └── app/                       # Composition root / orchestrator
│       ├── src/
│       │   ├── config/            # Config loader, rules.json schema
│       │   ├── logger.ts          # Pino setup
│       │   ├── server.ts          # WebSocket hub — serves overlay AND (Phase 6) the mod client
│       │   └── main.ts            # CLI entry point
│       ├── config/
│       │   └── rules.json
│       └── package.json
│
├── mc-mod/                        # 🔧 Fabric mod — separate Gradle/Fabric Loom build, own repo cadence
│   └── src/main/java|kotlin/...   # Connects OUT to app/server.ts as a WS client — never listens
│
├── docs/
│   ├── README.md                  # Kept lightweight and current from day one
│   ├── ARCHITECTURE.md            # 🔧 Completed AFTER Phase 3 validates the real contract, not before
│   ├── PROTOCOL.md                # 🔧 Human-readable mirror of shared-protocol, for the mod author
│   ├── SECURITY.md
│   ├── ROADMAP.md
│   └── adr/                       # Architecture Decision Records, one per major call (see below)
│
├── .github/workflows/             # 🔧 Path-filtered CI: mc-mod/** and packages/** run independently
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
├── tsconfig.base.json
├── package.json
├── README.md
└── LICENSE                        # Set per Licensing Strategy decision above
```

---

## Mod ↔ Middleware Communication (Phase 6)

🔧 Corrected from the previous draft, which had the mod exposing its own embedded WebSocket server. That inverts the intended topology.

**The mod is a client. The middleware is the hub.** The same WebSocket server already built for the overlay (`app/server.ts`) also accepts the mod's connection — no second port, no firewall/NAT concerns on the game machine, and the mod inherits the same reconnect/backoff logic as the overlay.

Key points to implement in Phase 6:

- **Transport:** WebSocket, JSON payloads (volume is low; no need for a binary protocol).
- **Schema** (from `shared-protocol`), symmetric to `ChaosEvent`:
  ```ts
  interface GameAction {
    id: string;               // = ChaosEvent.id, for correlation/tracing
    actionType: string;        // e.g. "spawn_mob", "apply_effect", "run_function"
    payload: Record<string, unknown>;
    timestamp: number;
  }
  ```
- **Return channel (recommended):** the mod emits `GameEvent`s back over the same socket (player death, objective completed) — this is the main reason to eventually move past RCON, so it should be used once available.
- **Auth:** shared-secret token in the handshake, even on localhost.
- **Protocol versioning:** include a `protocolVersion` field in the handshake; the mod and middleware evolve on different cadences (one tied to Minecraft versions, one not).
- **Threading (Minecraft-specific, easy to miss):** the WS client runs on its own thread inside the mod. Never touch world state directly from the socket callback — dispatch to the main thread via `server.execute(() -> { ... })` (Fabric/Forge). Most of Minecraft's internal state is not thread-safe.
- **Suggested libraries:** `Java-WebSocket` (TooTallNate) for a Java-based mod, or Ktor client if using Kotlin (Fabric Language Kotlin).

---

## Implementation Phases

### Phase 0 — Minimal Scaffolding & Living Docs

🔧 Slimmed down from the previous draft. Full architecture/API documentation before any domain code risks staleness the moment the contract changes in Phase 1–3.

#### Step 0.1 — Repository Initialization
- npm workspace monorepo, `tsconfig.base.json` (ESM, strict on core, path aliases)
- ESLint + Prettier, Jest with TS support
- `.gitignore`, `.env.example`, placeholder `LICENSE` (finalize per Licensing Strategy)
- `docker-compose.yml` (app + SQLite volume)
- Path-filtered GitHub Actions workflows (`packages/**` vs `mc-mod/**`)
- **Commit:** `chore(init): initialize monorepo structure and base configuration`

#### Step 0.2 — Lightweight Docs
- `README.md` — project overview, getting started, environment requirements
- `docs/adr/0001-licensing-strategy.md` — record whichever path is chosen above, with rationale
- `docs/adr/0002-minecraft-connector-mvp.md` — RCON now, Fabric mod later, why
- **Defer** `ARCHITECTURE.md`, `PROTOCOL.md`, and `API.md` full write-ups until Phase 3's milestone validates the real contract — write stubs only for now
- **Commit:** `docs(init): add README and initial ADRs`

---

### Phase 1 — Domain Contracts & Core Engine

**Goal:** Pure domain layer, zero external dependencies, fully testable.

#### Step 1.1 — Shared Protocol & Domain Models
- `packages/shared-protocol`: `ChaosEvent`, `GameAction`, `protocolVersion` — single source of truth consumed by every TS package (and mirrored manually in `docs/PROTOCOL.md` for the future mod author)
- `RuleDefinition` interface (event matcher → action template, priority, cooldown)
- Port interfaces: `PlatformAdapter`, `GameAdapter`, `QueuePort`
- **Commit:** `feat(core): define shared protocol, domain models and port interfaces`

#### Step 1.2 — Rule Evaluator
- Load rules from `config/rules.json`
- Match `ChaosEvent` against rules (event type, platform, value thresholds), wildcard/conditional matching
- Produce `GameAction` from matched rule template
- Unit tests with fixture events
- **Commit:** `feat(engine): implement rule evaluator with JSON config loader`

#### Step 1.3 — In-Memory Priority Queue
- Priority scoring: `priority = f(event_value, user_tier, time_in_queue)`
- Anti-starvation aging factor
- Rate limiting per action type (configurable max actions per N seconds)
- Unit tests: ordering, aging, rate limiting
- **Commit:** `feat(queue): implement in-memory priority queue with rate limiting`

#### Step 1.4 — Event Engine (Orchestrator)
- Wires: ingestion → normalization → rule evaluation → queue → dispatch
- Pino structured logging, correlation ID per event across the full pipeline
- State transitions: `EVENT_RECEIVED → EVENT_VALIDATED → RULE_MATCHED → EVENT_QUEUED → ACTION_DISPATCHED → EVENT_COMPLETED/EVENT_FAILED`
- Unit tests with mock adapters
- **Commit:** `feat(engine): implement event engine orchestrator with pipeline logging`

---

### Phase 2 — TikTok Adapter & Console Validation

**Goal:** Connect to a real TikTok LIVE stream and validate normalization (no Minecraft yet).

#### Step 2.1 — TikTok Platform Adapter
- Wrap `tiktok-live-connector` behind `PlatformAdapter` — keep this package structurally isolated regardless of the final licensing decision
- Normalize gift/like/follow/comment/share into `ChaosEvent`
- Reconnection with exponential backoff, circuit breaker on repeated failures
- Graceful degradation mode (log + alert on connection drop)
- **Commit:** `feat(tiktok): implement tiktok platform adapter with reconnection logic`

#### Step 2.2 — Mock Platform Adapter
- Synthetic `ChaosEvent` streams: configurable types, rates, burst patterns
- **Commit:** `feat(mock): implement mock platform adapter for development`

#### Step 2.3 — Console Validation Milestone (first runnable milestone)
- CLI connects to TikTok (or mock), logs normalized events to console
- Validates connection stability, normalization correctness, structured logging
- **Commit:** `feat(app): add CLI entry point for tiktok-to-console pipeline validation`

---

### Phase 3 — Minecraft RCON Adapter & End-to-End MVP

**Goal:** Complete TikTok → Engine → Minecraft.

#### Step 3.1 — RCON Game Adapter
- Implement `GameAdapter` via RCON
- Command builder: `GameAction` → Minecraft commands (`/summon`, `/effect`, `/give`, `/particle`, `/title`)
- Retry + circuit breaker on connection lifecycle
- **Security:** command whitelist (only pre-approved patterns), input sanitization on any TikTok-sourced text (usernames, comments) before it reaches a command string
- Integration tests against a local Minecraft server — flag as manual for now; consider a scripted/Testcontainers-based local server for CI later, not required for MVP
- **Commit:** `feat(minecraft): implement rcon game adapter with command builder`

#### Step 3.2 — Default Rules Configuration
- `config/rules.json`: gift tiers → mob spawns, like batches → particles, follow → welcome title, comments → sanitized in-game chat relay
- **Commit:** `feat(config): add default event-to-action rule mappings`

#### Step 3.3 — SQLite + Prisma Setup
- Schema for goals state, event history, session stats; migrations
- **Commit:** `feat(db): add prisma schema and sqlite database setup`

#### Step 3.4 — End-to-End MVP Milestone
- Full pipeline runs: TikTok (or mock) → EventEngine → RuleEvaluator → Queue → RCON → Minecraft
- Structured logs show full state transitions; `docker-compose up` runs the stack
- **Now** flesh out `ARCHITECTURE.md` and `PROTOCOL.md` against the contract as actually implemented
- **Commit:** `feat(app): complete end-to-end MVP pipeline`

---

### Phase 4 — OBS Overlay

#### Step 4.1 — WebSocket Server (Hub)
- Embedded in the main app process; this same server will later also accept the Fabric mod's client connection (Phase 6) — design the connection-handling code generically (`clientType: "overlay" | "mod"`) rather than overlay-specific, to avoid rework
- Broadcasts filtered events; JSON messages with event type, payload, overlay directives
- **Commit:** `feat(ws): add websocket hub for overlay (and future mod) communication`

#### Step 4.2 — Svelte Overlay Application
- OBS Browser Source compatible (transparent background, fixed dimensions)
- Real-time event feed, alert animations (CSS/GSAP) scaled by event priority, top-gifter history
- **Commit:** `feat(overlay): implement svelte obs overlay with event feed and alerts`

---

### Phase 5 — Goals System & Alpha Polish

#### Step 5.1 — Goal Engine
- Accumulated state module, independent of the per-event queue
- Configurable thresholds (e.g., "100 roses triggers TNT rain"), persisted via Prisma
- Emits `GoalTriggeredEvent` into the same dispatcher pipeline
- Progress data exposed via the WS hub for the overlay
- **Commit:** `feat(goals): implement goal engine with persistence and overlay integration`

#### Step 5.2 — Overlay Goal Progress
- Progress bars, celebration animations on goal completion
- **Commit:** `feat(overlay): add goal progress bars and celebration animations`

---

### Future Phases (Post-Alpha)

- **Phase 6:** Fabric mod (WS client per the corrected topology above), richer game interactions
- **Phase 7:** Admin dashboard (Svelte, to match the overlay stack — visual rule editor, live queue monitor)
- **Phase 8:** BullMQ + Redis migration — only once multi-process, persistence, or audit needs are real
- **Phase 9:** Multi-platform support (Twitch, YouTube) — new `PlatformAdapter` implementations
- **Phase 10:** SaaS infrastructure (multi-tenant, hosted) — **cannot start until the Licensing Strategy decision above is finalized**

---

## Verification Plan

### Automated Tests
- `npm test` — Jest across all packages
- Core engine tests with mock adapters (no network)
- Rule evaluator tests with fixture events
- Priority queue tests (ordering, aging, rate limiting)
- TikTok normalizer tests with recorded payloads (fixtures, not live streams)
- RCON adapter integration tests (manual against a local Minecraft server for MVP)

### Manual Verification
- **Phase 2 milestone:** CLI connects to a TikTok LIVE stream (or mock), normalized events visible in console logs
- **Phase 3 milestone:** send a gift on TikTok LIVE → observe the corresponding action in Minecraft
- **Phase 4 milestone:** add the overlay as an OBS Browser Source → verify real-time display
- **Phase 6 milestone:** confirm the mod connects outbound to the hub with no inbound port opened on the game machine
- **Docker:** `docker-compose up` runs the full stack without manual setup

### Performance Targets
- End-to-end latency (event → Minecraft action): < 500ms at p95
- Event throughput: sustain gift-bombing bursts (100+ events/second) without dropping the queue's priority ordering
- Memory footprint: < 200MB for the middleware process

---

## Open Questions

> [!IMPORTANT]
> **Licensing Strategy:** must be resolved before Phase 2 starts building against `adapters/tiktok` as a permanent structure — see [Licensing Strategy](#licensing-strategy). This blocks Phase 10 entirely if left unresolved.

> [!IMPORTANT]
> **Euler Stream dependency:** `tiktok-live-connector` relies on Euler Stream for token signing. Confirm the service is operational and supports your region before Phase 2.

> [!NOTE]
> **Fabric mod language (Phase 6):** Java vs. Kotlin — can be deferred until Phase 6 starts.

> [!NOTE]
> **Minecraft version target (Phase 6):** confirm 1.20.1 is intentional (e.g. mod ecosystem compatibility) rather than a placeholder, before scaffolding the Gradle project.

> [!NOTE]
> **Admin panel framework (Phase 7):** Svelte, to match the overlay stack and avoid a third UI framework in the project.
