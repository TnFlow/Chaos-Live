# Roadmap

## MVP (Phases 0–3) ✅
- [x] Monorepo scaffolding, tooling, CI (`fad94b7`)
- [x] Domain contracts (`ChaosEvent`, `GameAction`, port interfaces) (`bbc23b9`)
- [x] Core engine (rule evaluator, priority queue, event orchestrator) (`34ee934`, `7541646`, `c4e8145`)
- [x] TikTok adapter + console validation milestone (`5eb48e9`, `9febdb3`)
- [x] Minecraft RCON adapter + end-to-end pipeline (`99bde0d`, `660d34b`)
- [x] SQLite + Prisma for persistence (`4be8dfb`, `3cc07ac`)
- [x] Docker Compose deployment (`fad94b7`)

## Alpha (Phases 4–5) ✅
- [x] WebSocket hub for overlay and Fabric mod communication (`ef9244e`)
- [x] Svelte OBS overlay (event feed, alerts, leaderboard) (`33b672d`)
- [x] Goals engine with persistence and overlay integration (`2bcc255`)
- [x] Progress bars and celebration animations (`68bd6e3`)

## Beta (Phases 6–7) ✅
- [x] Custom Fabric mod (1.20.1) — Outbound WebSocket client & tick command executor (`9ba19d2`, `470a5b0`, `b9d0568`)
- [x] Twitch EventSub WebSocket adapter — built and tested, **not wired into the app** (`da911c6`, see [ADR-0003](adr/0003-alcance-single-tenant.md))
- [x] `EventEngine` accepts multiple platform adapters (`36da346`) — the app currently composes exactly one (TikTok or mock)

## Production (Phases 8–10) ✅
- [x] Embedded REST Management API with hot-reloading rules (`0b18b1a`)
- [x] Streamer Web Dashboard (Svelte 5) — rule editor, live monitor, goal manager, simulator (`d2d8a1c`)
- [x] Production hardening — graceful shutdown hooks, error traps, timeout watchdog (`e89a06f`)
- [x] Security audit — command whitelisting, injection defenses, chaining prevention (`f377ff5`)
- [x] Production multi-stage Dockerfile with non-root user and healthcheck (`ce44bb6`)
- [x] GitHub Actions CI/CD workflows for monorepo and Fabric mod (`bbb7b67`)
- [x] SaaS foundation — `TenantManager`, isolated queues and OAuth `TokenVault` — built and tested, **not instantiated at runtime** (`phase 10`, see [ADR-0003](adr/0003-alcance-single-tenant.md))
- [x] Finalized licensing strategy in ADR-0001
