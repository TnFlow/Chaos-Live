# Chaos-Live — Fabric Mod (Minecraft 1.20.1)

Outbound WebSocket connector connecting Minecraft dedicated servers directly to the **Chaos-Live** streaming middleware hub.

---

## 🚀 Architecture Highlights

- **Outbound Connection (Zero Open Ports):** The mod dials OUT to `ws://localhost:8080/?clientType=mod`. The Minecraft host machine requires zero open inbound firewall ports.
- **Thread Safety:** Actions received via WebSocket are scheduled safely onto the Minecraft server tick thread via `server.execute(...)`.
- **Zero Heavy Dependencies:** Uses Java 11+ `java.net.http.WebSocket` and `Gson` (provided by Minecraft/Fabric runtime).
- **Execution ACKs:** Measures execution duration and transmits feedback results back to the middleware pipeline and audit database.

---

## 🛠️ Building the Mod

### Requirements
- JDK 17 or higher (`JAVA_HOME` configured)

### Build Command
```bash
# On Windows
./gradlew.bat build

# On Linux/macOS
./gradlew build
```

The compiled jar will be produced at:
`build/libs/chaos-live-fabric-0.1.0.jar`

---

## 📦 Installation

1. Copy `chaos-live-fabric-0.1.0.jar` into your Minecraft server's `mods/` directory.
2. Ensure [Fabric Loader](https://fabricmc.net/) (>= 0.15.11) and [Fabric API](https://modrinth.com/mod/fabric-api) are installed.
3. Start the server. Configuration will be generated at `config/chaos-live.json`.

---

## ⚙️ Configuration (`config/chaos-live.json`)

```json
{
  "enabled": true,
  "wsHost": "localhost",
  "wsPort": 8080,
  "autoReconnect": true,
  "reconnectDelayMs": 3000,
  "maxReconnectAttempts": 20
}
```
