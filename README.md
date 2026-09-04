# Chaos-Live

> Modular, real-time event middleware connecting TikTok LIVE audience interactions to Minecraft Java Edition.

Chaos-Live transforms live-stream events (gifts, likes, follows, comments, shares) into executable game actions (mob spawns, particle effects, player buffs) with configurable rules, priority queuing, and OBS overlay support.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  TikTok LIVE    │     │   Chaos-Live     │     │   Minecraft      │
│  (Platform      │────▶│   Middleware      │────▶│   Java Edition   │
│   Adapter)      │     │                  │     │   (RCON / Mod)   │
└─────────────────┘     │  ┌────────────┐  │     └──────────────────┘
                        │  │ Normalizer │  │
                        │  │ Rule Engine│  │     ┌──────────────────┐
                        │  │ Queue      │  │────▶│  OBS Overlay     │
                        │  │ Goals      │  │     │  (Browser Source) │
                        │  │ Dispatcher │  │     └──────────────────┘
                        │  └────────────┘  │
                        └──────────────────┘
```

**Design principle:** Every streaming platform and game target is an interchangeable adapter behind a stable interface. The core engine knows nothing about TikTok or Minecraft directly.

## Monorepo Structure

| Package | Description |
|---|---|
| `@chaos-live/shared-protocol` | Domain schemas (`ChaosEvent`, `GameAction`) — single source of truth |
| `@chaos-live/core` | Event engine, rule evaluator, priority queue, goal engine, session leaderboard.<br>Also contains a multi-tenant `TenantManager` that is ⚠️ **not instantiated at runtime** ([ADR-0003](docs/adr/0003-alcance-single-tenant.md)) |
| `@chaos-live/adapter-tiktok` | TikTok LIVE platform adapter (AGPL-3.0 boundary) |
| `@chaos-live/adapter-twitch` | Twitch EventSub adapter — ⚠️ built and tested, **not wired into the app** ([ADR-0003](docs/adr/0003-alcance-single-tenant.md)) |
| `@chaos-live/adapter-mock` | Synthetic event generator for development |
| `@chaos-live/adapter-minecraft-rcon` | Minecraft RCON game adapter (fallback when the Fabric mod is offline) |
| `@chaos-live/overlay` | Svelte OBS overlay (Browser Source) |
| `@chaos-live/app` | Composition root, CLI entry point, WebSocket hub |

## Prerequisites

- **Node.js** ≥ 22.0.0
- **npm** ≥ 10.0.0
- **Docker & Docker Compose** (for containerized deployment)
- **Minecraft Java Edition** server with RCON enabled (for game integration)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-username/chaos-live.git
cd chaos-live
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your TikTok username and Minecraft RCON credentials
```

### 3. Run in development

```bash
npm run dev
```

### 4. Run with Docker

```bash
docker-compose up --build
```

## Minecraft Server Setup

Enable RCON in your Minecraft server's `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=your_secure_password
broadcast-rcon-to-ops=true
```

## Configuration

Event-to-action mappings are defined in `packages/app/config/rules.json`, and are editable live from the dashboard (`http://localhost:8080/dashboard`) — commands are validated on save, so a rule the engine would refuse is rejected with an explanation instead of silently never firing.

Overlay appearance is stored in `packages/app/config/overlay-settings.json` and survives restarts.

Key environment variables (see `.env.example` for the full list):

| Variable | Default | Notes |
|---|---|---|
| `HOST` | `127.0.0.1` | Listening interface. **The management API has no authentication** — `0.0.0.0` exposes rule editing to your local network. |
| `WS_PORT` | `8080` | Serves the overlay, dashboard, REST API and the Fabric mod connection. |
| `LOG_TO_FILE` | `true` | Writes `logs/chaos-live-YYYY-MM-DD.log` so failures can be diagnosed after a stream. |
| `LOG_DIR` | `./logs` | Where those logs go. |
| `USE_MOCK` | auto | Defaults to mock mode when `TIKTOK_USERNAME` is unset. |

See `docs/PROTOCOL.md` for the full schema reference, and [ADR-0003](docs/adr/0003-alcance-single-tenant.md) for the current operational scope (single streamer, single machine, TikTok only).

## Development

```bash
# Run all tests
npm test

# Lint
npm run lint

# Format
npm run format

# Type-check the overlay's TypeScript modules
npm run typecheck

# Build all packages
npm run build
```

## Documentation

| Document | Status |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Stub — fleshed out after MVP validation |
| [Protocol](docs/PROTOCOL.md) | Stub — fleshed out after MVP validation |
| [Security](docs/SECURITY.md) | ✅ Active |
| [Roadmap](docs/ROADMAP.md) | ✅ Active |
| [ADR-0001: Licensing Strategy](docs/adr/0001-licensing-strategy.md) | ✅ Active |
| [ADR-0002: Minecraft Connector MVP](docs/adr/0002-minecraft-connector-mvp.md) | ✅ Active |
| [ADR-0003: Single-tenant scope](docs/adr/0003-alcance-single-tenant.md) | ✅ Active |
| [User Guide](docs/USER_GUIDE.md) | ✅ Active |

## License

See [LICENSE](LICENSE) — pending finalization per [ADR-0001](docs/adr/0001-licensing-strategy.md).

The TikTok adapter (`packages/adapters/tiktok/`) is licensed under AGPL-3.0 due to its dependency on `tiktok-live-connector`.
