# Security

> **Status:** Stub — will be expanded as attack surfaces are implemented.

## Threat Model

### RCON Exposure
- RCON must **never** be exposed to the public internet.
- The middleware and Minecraft server must run on the same local network or behind a secure tunnel.
- RCON password stored in `.env`, never committed to version control.

### Command Injection
- All TikTok-sourced text (usernames, comments) is sanitized before inclusion in Minecraft commands.
- A command whitelist restricts which command patterns can be generated per event type.

### TikTok Data
- Viewer privacy: only display names and anonymized user IDs are processed.
- Raw event payloads are logged at `debug` level only, never in production.

### Secrets Management
- All credentials stored in `.env` (not versioned).
- Docker Compose reads from `.env` file.
- Future: consider a secrets manager for SaaS deployment.

## Rate Limiting
- Per-action-type rate limits prevent game server overload.
- Configurable via `rules.json`.

## Dependencies
- `tiktok-live-connector` is reverse-engineered; TikTok may change the protocol without notice.
- Euler Stream token signing service is an external dependency to monitor.
