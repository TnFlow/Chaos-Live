# ADR-0001: Licensing Strategy & AGPL Isolation

**Status:** Accepted
**Date:** 2024-08-29 (Updated: 2026-08-30 for Phase 10 SaaS Foundation)
**Decision Makers:** Project Owner & Antigravity Core Team

## Context

Chaos-Live depends on `tiktok-live-connector` for TikTok LIVE event ingestion. As of v2.4.1, this upstream library transitioned its license from MIT to **AGPL-3.0**.

AGPL-3.0 contains a network copyleft clause: if a service is provided over a network (e.g. hosted multi-tenant SaaS), the source code of the entire combined work must be made available to network users under the AGPL-3.0.

The project encompasses two distinct deployment targets:
1. **Self-Hosted / Personal Streamer Use:** Open personal deployment run directly by streamers locally.
2. **Commercial Hosted SaaS:** Multi-tenant cloud service offering streaming interaction infrastructure.

## Decision

We adopt a **Dual-Mode Architectural Isolation Strategy**:

### 1. Personal & Self-Hosted Standpoint (Default)
For personal streamer usage, community self-hosting, and development:
- The project operates under **AGPL-3.0** for all packages interacting with `tiktok-live-connector`.
- In-process direct module imports are permitted and standard.
- The repository provides full open-source access.

### 2. Commercial Multi-Tenant SaaS Standpoint (Phase 10 Foundation)
Prior to offering Chaos-Live as a proprietary or closed-source hosted commercial SaaS:
- **Process Isolation (Sidecar Pattern):** The TikTok adapter (`@chaos-live/adapter-tiktok`) must run as an autonomous external microservice/sidecar container communicating with `@chaos-live/core` strictly over standard network protocols (gRPC / HTTP JSON / WebSocket).
- **Domain Independence:** The core domain (`@chaos-live/core`, `@chaos-live/shared-protocol`) maintains zero direct compile-time or runtime code dependencies on `tiktok-live-connector`.
- **Alternative Ingestion:** For commercial enterprise tiers, the sidecar can be swapped for official TikTok / Twitch developer OAuth webhooks or commercial enterprise providers (e.g., Euler Stream direct API).

## Consequences

1. `packages/shared-protocol` and `packages/core` remain completely agnostic of underlying platform scraper libraries.
2. `packages/adapters/tiktok` explicitly declares `AGPL-3.0-only` in its `package.json`.
3. Multi-tenant SaaS deployments can deploy the TikTok adapter as a standalone network pod or opt for direct OAuth EventSub providers (Twitch/YouTube) without AGPL license viral contagion across proprietary SaaS orchestration code.
