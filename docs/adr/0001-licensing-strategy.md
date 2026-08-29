# ADR-0001: Licensing Strategy

**Status:** Pending Decision
**Date:** 2024-08-29
**Decision Makers:** Project owner

## Context

Chaos-Live depends on `tiktok-live-connector` for TikTok LIVE event ingestion. As of v2.4.1, this library moved from MIT to **AGPL-3.0**.

AGPL-3.0 has network copyleft implications: if Chaos-Live is offered as a hosted SaaS service, the AGPL requires exposing the source code of the combined work to users interacting with it over the network.

The project's long-term vision includes a hosted SaaS platform for streamers, which makes the licensing choice a business-critical decision.

## Options Considered

### Option 1: Open-source everything under AGPL-3.0

- **Approach:** Set `AGPL-3.0-only` as the root LICENSE. The entire codebase is copyleft.
- **Monetization:** Via hosting, premium support, managed infrastructure, or add-on features (the GitLab / n8n model).
- **Pros:** Simplest to implement; no isolation boundaries needed; community-friendly.
- **Cons:** Any SaaS deployment must offer the full source. Competitors can self-host freely.

### Option 2: Isolate the AGPL boundary

- **Approach:** Keep `adapters/tiktok/` as a structurally separate, AGPL-licensed package with its own `LICENSE` file. The rest of the codebase uses a different license (proprietary, MIT, or BSL).
- **Monetization:** Full commercial flexibility for the core/SaaS platform.
- **Implementation cost:** The TikTok adapter must communicate with the core via a well-defined network boundary (separate process, IPC) — not just a code-level import — to satisfy AGPL isolation requirements.
- **Alternative:** Replace `tiktok-live-connector` with a commercially licensed managed provider (e.g., Euler Stream direct API, Tik.Tools) before launching SaaS.
- **Pros:** Preserves commercial SaaS option.
- **Cons:** More complex architecture; must validate AGPL isolation with legal counsel.

## Decision

**Pending.** For the MVP (personal use, not sold), either option works with zero practical impact. The decision must be finalized before:

1. Phase 2 builds `adapters/tiktok` as a permanent structural component.
2. Phase 10 (SaaS infrastructure) begins.

## Consequences

- Until decided, the root `LICENSE` file is a placeholder.
- `packages/adapters/tiktok/package.json` already declares `AGPL-3.0-only` to reflect its dependency's license.
- If Option 2 is chosen, Phase 2 should build the TikTok adapter as a separately deployable process from day one.
