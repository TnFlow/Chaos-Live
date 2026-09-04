# Security Architecture & Threat Model

**Status:** Active & Implemented  
**Last Updated:** Phase 9 (Production Hardening & Security Audit)

---

## 1. Threat Model & Ingestion Boundaries

Chaos-Live receives untrusted real-time inputs from public social media live streams (TikTok LIVE, Twitch EventSub) and translates them into in-game executions on a Minecraft client or server.

```
[Public Internet]              [Chaos-Live Middleware]              [Game Environment]
Uncontrolled Platform ──HTTP/WS──➜ [Input Sanitizer]       ──WS Out──➜ [Fabric Mod (In-Memory)]
Data (Usernames, Chat, Gifts)   ──➜ [Command Whitelist]     ──RCON───➜ [Minecraft Server]
                                ──➜ [Anti-Spam Queue]
```

### Threat Vectors Mitigated
1. **Remote Code Execution / Privilege Escalation via Minecraft Commands:** An attacker crafting a username or comment designed to break out of quotes and execute server administration commands (e.g. `/op attacker`, `/stop`, `/ban`).
2. **Command Chaining & Delimiter Injections:** Exploiting command separators (`;`, `\n`, `\r\n`, `\x00`) to append malicious secondary commands.
3. **Nested Command Exploitation (`/execute`):** Bypassing top-level command checks using nested subcommands (e.g. `/execute as @a run op attacker`).
4. **Denial of Service (DoS) & Spam Bursts:** High-velocity gift attacks overloading the Minecraft tick loop or causing memory starvation.
5. **RCON Exposure:** Eavesdropping or brute-forcing Minecraft server RCON credentials.
6. **Container Compromise:** Running processes as root in containerized environments.

---

## 2. In-Depth Defense Layers

### 2.1 Command Safety Whitelist
All commands dispatched through `RconAdapter`, `HybridGameAdapter`, and the Fabric mod are validated against a strict command whitelist:

```typescript
export const DEFAULT_ALLOWED_COMMANDS = new Set([
  'summon',
  'effect',
  'give',
  'particle',
  'title',
  'tellraw',
  'playsound',
  'weather',
  'time',
  'gamemode',
  'difficulty',
  'say',
]);
```

- **Disallowed commands:** `op`, `deop`, `ban`, `ban-ip`, `pardon`, `pardon-ip`, `kick`, `stop`, `restart`, `save-all`, `save-off`, `whitelist`, `kill`.
- **Enforcement:** If a command root is not in `DEFAULT_ALLOWED_COMMANDS`, the adapter immediately rejects the action with a `Security violation` result and logs a security warning.

### 2.2 Command Chaining & Delimiter Defense
`isCommandSafe` rejects any command containing:
- Semicolons (`;`)
- Carriage returns (`\r`) or newlines (`\n`)
- Null bytes (`\x00`)

### 2.3 Nested Command Execution Guard
The `/execute` command is permitted for relative positioning (e.g. `/execute at @p run summon zombie ~ ~ ~`), but dangerous subcommands are strictly blocked using regex pattern matching:
```typescript
if (rootCommand === 'execute') {
  const lower = normalized.toLowerCase();
  const dangerousSubcommands = ['op', 'deop', 'ban', 'ban-ip', 'kick', 'stop', 'restart', 'whitelist', 'kill'];
  for (const danger of dangerousSubcommands) {
    if (new RegExp(`\\brun\\s+${danger}\\b`, 'i').test(lower)) {
      return false;
    }
  }
}
```

### 2.4 External Input Cleansing (`sanitizeInput`)
Text fields sourced from streaming viewers (display names, chat comments, gift names) are sanitized before interpolation:
- **Control characters stripped:** All ASCII non-printable characters (`\x00-\x1F\x7F`) are replaced with spaces.
- **Double quote escaping:** `"` becomes `\"` to prevent JSON component breakout in `/tellraw` and `/title`.
- **Single quote escaping:** `'` becomes `\'` to preserve NBT string encapsulation in `/summon`.
- **Length limitation:** User-controlled strings are capped at 100 characters to prevent buffer and memory exhaustion.

### 2.5 Outbound Mod Connection Topology (Zero Open Ports)
In Phase 6, Chaos-Live introduced the **Fabric Mod Outbound Architecture**:
- The Fabric mod runs on the Minecraft machine and **dials outbound** to the middleware hub over WebSocket (`ws://localhost:8080/?clientType=mod`).
- **The game machine never opens an inbound networking port.** This eliminates the attack surface of port scanning or external exploit attempts targeting the Minecraft game instance.

### 2.6 Rate Limiting & Queue Anti-Starvation
- **Sliding-Window Rate Limiting:** Configured per action type (e.g. max 5 `spawn_mob` per second, max 20 global actions per second).
- **Anti-Starvation Aging:** Lower-priority events (e.g. likes) accumulate priority over time so high-roller gifts cannot permanently starve chat interactions.
- **Bounded In-Memory Cache:** Recent event maps are hard-capped at 500 items with LRU eviction to prevent memory leaks.

### 2.7 Network Exposure
- The HTTP/WebSocket server binds to `127.0.0.1` by default (`HOST` environment variable).
- **The REST management API has no authentication.** This is acceptable only because the deployment model is a single machine running Chaos-Live, Minecraft and OBS together (see [ADR-0003](adr/0003-alcance-single-tenant.md)). Setting `HOST=0.0.0.0` exposes rule editing and action injection to the whole local network, and the server logs a warning when it does.
- Commands are validated with `isCommandSafe` **at write time** (`POST`/`PUT /api/rules` and `/api/goals`) as well as at dispatch time, so a rejected command fails loudly at the panel instead of silently never firing.

### 2.8 Multi-Tenant SaaS Isolation — NOT ACTIVE
> `TenantManager`, `PrismaTokenVault` and the `tenantId` columns in the Prisma schema exist and are tested, but **nothing instantiates them at runtime**. The application runs as a single implicit tenant. Do not rely on per-tenant isolation as a security control until this is wired up — see [ADR-0003](adr/0003-alcance-single-tenant.md).

### 2.9 Container & Runtime Security
- **Non-Root Execution:** The multi-stage production Dockerfile switches to `USER node:node` (UID/GID 1000).
- **Secrets Isolation:** No passwords, usernames, or tokens are committed to source control. Everything is injected via environment variables (`.env`).
- **Error Trapping:** Process-level error traps for `uncaughtException` and `unhandledRejection` prevent ungraceful crashes and log structured diagnostics.
- **Watchdog Timer:** A 5000ms unref'd watchdog timer guarantees that shutdown never hangs indefinitely.

---

## 3. Automated Security Verification

The test suite includes dedicated adversarial security tests in `packages/adapters/minecraft-rcon/__tests__/security-sanitization.test.ts` and `packages/app/__tests__/hybrid-game-adapter.test.ts`, verifying:
- Command injection blocking (`/op`, `/ban`, `/stop`).
- Chaining prevention via semicolons and newlines.
- Nested `/execute run <danger>` neutralization.
- Double/single quote escaping.
- Non-printable character removal.
- Length truncation limits.
- Pre-dispatch rejection in `HybridGameAdapter`.
