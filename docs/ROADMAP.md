# Roadmap

## MVP (Phases 0–3)
- [x] Monorepo scaffolding, tooling, CI
- [ ] Domain contracts (`ChaosEvent`, `GameAction`, port interfaces)
- [ ] Core engine (rule evaluator, priority queue, event orchestrator)
- [ ] TikTok adapter + console validation milestone
- [ ] Minecraft RCON adapter + end-to-end pipeline
- [ ] SQLite + Prisma for persistence
- [ ] Docker Compose deployment

## Alpha (Phases 4–5)
- [ ] WebSocket hub for overlay (and future mod) communication
- [ ] Svelte OBS overlay (event feed, alerts, leaderboard)
- [ ] Goals engine with persistence and overlay integration
- [ ] Progress bars and celebration animations

## Beta (Phase 6–7)
- [ ] Custom Fabric mod (1.20.1) — WebSocket client connecting to middleware hub
- [ ] Bidirectional game events (player death, objectives)
- [ ] Admin dashboard (Svelte) — visual rule editor, live queue monitor

## Production (Phase 8–10)
- [ ] BullMQ + Redis migration (if multi-tenant/audit needs arise)
- [ ] Multi-platform support (Twitch, YouTube adapters)
- [ ] SaaS infrastructure (multi-tenant, hosted deployment)
- [ ] Finalize licensing strategy before SaaS launch
