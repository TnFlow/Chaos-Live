# ⚡ Chaos-Live — Complete User Guide & Future Roadmap

Welcome to **Chaos-Live**! This guide covers everything you need to know to run, customize, stream with, and extend Chaos-Live, as well as recommended next steps for evolving the platform.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Prerequisites & Quick Start](#2-prerequisites--quick-start)
3. [Game Connector Setup (Minecraft)](#3-game-connector-setup-minecraft)
   - [Method A: Custom Fabric Mod (Recommended)](#method-a-custom-fabric-mod-recommended)
   - [Method B: Minecraft Server RCON (Fallback)](#method-b-minecraft-server-rcon-fallback)
4. [Streaming Platform Ingestion](#4-streaming-platform-ingestion)
   - [TikTok LIVE](#tiktok-live)
   - [Twitch EventSub](#twitch-eventsub)
   - [Mock Mode (Offline Simulation)](#mock-mode-offline-simulation)
5. [OBS Studio Integration](#5-obs-studio-integration)
6. [Streamer Control Center (`/dashboard`)](#6-streamer-control-center-dashboard)
   - [Live Monitor & Queue](#live-monitor--queue)
   - [Rule Editor & Hot Reloading](#rule-editor--hot-reloading)
   - [Community Goal Management](#community-goal-management)
   - [Emergency Controls](#emergency-controls)
   - [Testing with the Simulator](#testing-with-the-simulator)
7. [Configuration & Rules Reference](#7-configuration--rules-reference)
8. [What Should Come Next (Future Directions)](#8-what-should-come-next-future-directions)

---

## 1. System Architecture Overview

Chaos-Live sits between your live streaming platform and your game:

```
[TikTok LIVE] ──┐
                 ├──➜ [Chaos-Live Middleware] ──➜ [Fabric Mod (Primary WS)] ──➜ [Minecraft]
[Twitch Stream] ──┘    │  (Rules • Queue • Goals)   └──➜ [RCON (Fallback)]
                       │
                       └──➜ [OBS Browser Source HUD] & [Web Dashboard]
```

- **Core Middleware (`@chaos-live/app`):** Runs on port `8080`. Manages the priority queue with anti-starvation aging, evaluates rules, tracks community goals in SQLite, and serves the web HUD and REST API.
- **Game Dispatcher:** Tiers execution intelligently: sends commands via WebSocket to the connected **Fabric Mod** first, falls back to **RCON** if the mod is offline, and logs to console if neither is reachable.
- **Overlay & Dashboard (`@chaos-live/overlay`):** Glassmorphic Svelte 5 application served directly by the middleware.

---

## 2. Prerequisites & Quick Start

### Prerequisites
- **Node.js:** v22+ LTS (Node 24 works out-of-the-box).
- **Minecraft:** Java Edition 1.20.1 (Singleplayer with Fabric Loader or Dedicated Server).

### Installation
```bash
# Clone and enter directory
git clone https://github.com/TnFlow/Chaos-Live.git
cd Chaos-Live

# Install monorepo dependencies
npm install

# Build all packages & web assets
npm run build
```

### Starting in Offline / Test Mode
To test everything locally without connecting to an actual live stream:
```bash
# Windows (PowerShell)
$env:USE_MOCK="true"; $env:MOCK_INTERVAL_MS="3000"; $env:WS_PORT="8080"; npm run dev

# Linux / macOS
USE_MOCK=true MOCK_INTERVAL_MS=3000 WS_PORT=8080 npm run dev
```
Open your browser at:
- **Streamer Control Center:** `http://localhost:8080/dashboard`
- **OBS Browser Overlay:** `http://localhost:8080/overlay`

---

## 3. Game Connector Setup (Minecraft)

Chaos-Live supports two game connection methods.

### Method A: Custom Fabric Mod (Recommended)
The custom Fabric mod (`packages/minecraft-mod`) runs inside Minecraft 1.20.1. It connects **outbound** to the middleware over WebSocket (`ws://localhost:8080/?clientType=mod`), meaning **no ports need to be opened on your game machine**.

1. **Build the Mod:**
   ```bash
   cd packages/minecraft-mod
   ./gradlew build    # Or gradlew.bat build on Windows
   ```
2. **Install:**
   - Copy `packages/minecraft-mod/build/libs/chaoslive-mod-1.0.0.jar` into your Minecraft `.minecraft/mods/` folder.
   - Ensure you have **Fabric Loader 0.14+** and **Fabric API** installed for Minecraft 1.20.1.
3. **Run Minecraft:**
   - Start singleplayer or your server. The mod will automatically connect to `ws://localhost:8080/?clientType=mod`.
   - In-game chat will confirm: `[Chaos-Live] Connected to middleware hub!`.
   - Commands execute synchronously on the Minecraft server tick thread, returning execution feedback ACKs back to the dashboard.

### Method B: Minecraft Server RCON (Fallback)
If running a vanilla or Paper/Spigot dedicated server without the Fabric mod:
1. In your Minecraft `server.properties`, set:
   ```properties
   enable-rcon=true
   rcon.port=25575
   rcon.password=your_secure_password
   broadcast-rcon-to-ops=false
   ```
2. Configure `.env` in the project root:
   ```env
   RCON_HOST=127.0.0.1
   RCON_PORT=25575
   RCON_PASSWORD=your_secure_password
   ```
3. Start the Chaos-Live middleware. It will automatically detect RCON and route commands to it when the Fabric mod is not connected.

---

## 4. Streaming Platform Ingestion

### TikTok LIVE
To connect to a live TikTok stream:
1. Edit `.env`:
   ```env
   TIKTOK_USERNAME=your_streamer_handle   # Without the '@' symbol
   USE_MOCK=false
   ```
2. Start the middleware:
   ```bash
   npm run dev
   ```
   The middleware uses a 3-state circuit breaker (`CLOSED` ➜ `OPEN` ➜ `HALF_OPEN`) with exponential backoff to handle connection drops gracefully.

### Twitch EventSub
Twitch integration is supported out-of-the-box via `TwitchAdapter`. It normalizes Bits cheers (`channel.cheer`), subscriptions, follows, channel points redemptions, chat, and raids.
- Channel points custom rewards map directly to gift rules based on reward name and points cost!

### Mock Mode (Offline Simulation)
Set `USE_MOCK=true` in `.env`. The mock adapter generates randomized, realistic stream traffic (roses, lions, likes, follows, chat) for stream rehearsal.

---

## 5. OBS Studio Integration

1. In **OBS Studio**, add a new **Browser Source** to your scene:
   - **URL:** `http://localhost:8080/overlay` (or `http://localhost:8080/` which defaults to the overlay)
   - **Width:** `1920`
   - **Height:** `1080`
   - **Custom CSS:** Leave blank (the background is fully transparent)
   - **Shutdown source when not visible:** Unchecked (keeps WebSocket connection alive)
2. What your viewers will see:
   - **Top Status Bar:** Connection indicator, live event counter, and community goal progress bar.
   - **Left HUD:** Live interaction feed with glassmorphic cards for gifts, likes, and followers.
   - **Center Screen:** Grand animated alerts when major gifts are received (e.g. Lions, Ice Creams, Bits cheers) showing who sent the gift and what in-game punishment was triggered.
   - **Right HUD:** Top supporters leaderboard ranked by total contributions.
   - **Bottom HUD:** Game execution ticker displaying the exact Minecraft commands running live.

---

## 6. Streamer Control Center (`/dashboard`)

Access the management dashboard in any web browser at:
👉 **`http://localhost:8080/dashboard`**

### Live Monitor & Queue
- **Real-Time KPIs:** Visual indicators for Pipeline Status (`ONLINE` or `PAUSED`), Queue Depth, Connected Clients (Overlay + Fabric Mod), and Active Streaming Platforms.
- **Event Feed:** Streaming terminal showing every incoming event, donor name, and the corresponding Minecraft action.

### Rule Editor & Hot Reloading
- Click the **⚙️ Rules** tab.
- Toggle any rule on or off instantly with the toggle button.
- Click **➕ Create New Rule** or **Edit**:
  - Set Rule Name, Priority (1–100), Event Type, and Value Threshold.
  - Minecraft Command Template with variable token helpers:
    - `${user.displayName}` — Sender's public display name.
    - `${metadata.giftName}` — Gift name (e.g. "Rose", "Lion").
    - `${event.value}` — Numerical value (diamonds or bits).
  - **Live Command Preview:** Updates in real-time as you type, showing what the command will look like with sample data.
  - **Hot Reload:** Changes are saved directly to `rules.json` and hot-reloaded into the running engine **without restarting the server**.

### Community Goal Management
- Click the **🎯 Goals** tab.
- Visual progress bars for collective stream milestones (e.g. `🌹 50 Roses ➜ Summon Warden`).
- When a goal reaches 100%, the middleware automatically triggers the celebration particle banner on the OBS overlay, dispatches the boss action with elevated priority (`score: 200`), and repeats the cycle if configured.
- Streamers can reset progress at any time using the **🔄 Reset Progress** button.

### Emergency Controls (Action Bar)
Located in the top right of the dashboard header:
- ⏸️ **Pause Actions:** Halts command dispatching immediately while continuing to buffer events in the queue (crucial when you're navigating lava, void, or tight parkour).
- ▶️ **Resume Actions:** Resumes queued execution.
- 🧹 **Purge Queue:** Clears all queued commands instantly if chat triggers an overwhelming spam attack.

### Testing with the Simulator
- Click the **🧪 Simulator** tab (or the quick simulator panel on the Monitor tab).
- Click presets like **🌹 1x Rose**, **🦁 1x Lion**, or **💎 500 Bits** to test your rules, Minecraft execution, and overlay animations with zero viewers required.

---

## 7. Configuration & Rules Reference

The default rules configuration resides at `packages/app/config/rules.json`. Example rule:

```json
{
  "id": "rule-lion-super-creeper",
  "name": "Lion: Powered Creeper Bomb",
  "enabled": true,
  "priority": 100,
  "cooldownMs": 10000,
  "matcher": {
    "eventTypes": ["gift"],
    "minValue": 20000
  },
  "action": {
    "actionType": "execute_command",
    "command": "summon minecraft:creeper ~ ~ ~ {powered:1b,CustomName:'{\"text\":\"${user.displayName}\\'s SUPER CREEPER\"}'}"
  }
}
```

### Security & Sanitization
All commands undergo strict whitelist validation before reaching the game:
- **Allowed commands:** `summon`, `effect`, `give`, `particle`, `title`, `tellraw`, `playsound`, `weather`, `time`, `gamemode`, `difficulty`, `say`.
- **Blocked commands:** `op`, `deop`, `ban`, `kick`, `stop`, `restart`, `whitelist`, `kill`.
- **Command chaining:** Semicolons (`;`), newlines (`\n`), and null bytes (`\x00`) are stripped and rejected.
- **Nested exploits:** `/execute run op` and similar privilege escalation attempts are strictly blocked.

---

## 8. What Should Come Next (Future Directions)

With the core engine, Fabric mod, Twitch/TikTok multi-platform ingestion, OBS overlay, and management dashboard complete, here is the recommended roadmap for taking Chaos-Live to the next level:

### 1. Standalone Desktop App (Electron / Tauri Packaging)
- **Goal:** Allow streamers who don't know Node.js or the terminal to install Chaos-Live as a single `.exe` / `.dmg` application.
- **Features:**
  - Auto-launches the background middleware and opens the dashboard in a native desktop window.
  - Automatic detection and installation of the Fabric mod into the local `.minecraft/mods` directory.
  - System tray icon with one-click Emergency Pause and OBS link copy.

### 2. Richer In-Game Fabric Mod Features
- **In-Game Overlay HUD:** Render current goal progress and recent top gifts directly on the Minecraft screen (top-left corner) so full-screen streamers don't need a second monitor.
- **Custom Sound Effects & Screen Shake:** Trigger client-side screen shakes, lightning flashes, or custom audio cues when high-tier gifts arrive.
- **Viewer-Controlled Voting:** Initiate interactive chat votes (e.g. "Choose Streamer's Next Fate: Blindness vs Diamond Shower") with a countdown timer rendered in-game and on the OBS overlay.

### 3. Additional Platform Adapters
- **YouTube Live (`@chaos-live/adapter-youtube`):** Support YouTube Super Chats, Super Stickers, and Channel Memberships.
- **Kick (`@chaos-live/adapter-kick`):** Support Kick stream gifts and chat commands.

### 4. Commercial Multi-Tenant Cloud SaaS
- Leveraging the **Phase 10 SaaS Foundation** (`TenantManager`, `TokenVault`, multi-tenant Prisma schema):
  - **Hosted Cloud Service:** Deploy on AWS/GCP with Kubernetes. Streamers log in with Twitch/TikTok OAuth and connect their game via an API key.
  - **Sidecar Isolation:** Deploy the AGPL TikTok adapter as an isolated sidecar microservice communicating with the cloud backend over gRPC/WebSocket, adhering to the finalized [ADR-0001](file:///d:/Chaos-Live/Chaos-Live/docs/adr/0001-licensing-strategy.md).
  - **Creator Monetization:** Premium custom alert templates, advanced analytics, and custom sound uploads.

### 5. Multi-Game Support Beyond Minecraft
- The `ChaosEvent` and `GameAction` protocol is game-agnostic.
- Create adapters for **Palworld** (RCON), **Rust** (RCON/Oxide), **ARK: Survival Evolved**, or **Valheim** using the identical rule engine and overlay!

---

*Enjoy streaming with Chaos-Live! Happy crafting and streaming!*
