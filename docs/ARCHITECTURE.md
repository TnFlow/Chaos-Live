# Architecture

> **Status:** Stub — will be fleshed out after Phase 3 validates the real contract.

See [chaos-live-arquitectura-preliminar.md](../chaos-live-arquitectura-preliminar.md) for the preliminary architecture design that informed this project's implementation.

## High-Level Pipeline

```
[Platform Adapter] → [Event Normalizer / Bus]
   → [Priority Queue] → [Rule Engine / Goals]
   → [Action Dispatcher] → [Game Adapter] + [Overlay]
```

## Hexagonal Architecture (Ports & Adapters)

The core domain (queue, rules, goals, dispatcher) is pure logic with zero dependencies on TikTok or Minecraft. Adapters implement port interfaces defined by the domain:

- `PlatformAdapter` — ingests events from a streaming platform
- `GameAdapter` — dispatches actions to a game
- `QueuePort` — manages event queuing and prioritization

## Component Details

*To be documented after MVP validation.*

## Concurrency Model

*To be documented after MVP validation.*

## Data Flow

*To be documented after MVP validation.*
