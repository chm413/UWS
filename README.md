# Unified WebSocket Bridge (UWS)

This repository contains the reference implementation for the **Universal WebSocket Bridge Platform (UWS)** described in the project specification. It provides a complete toolchain to manage heterogeneous Minecraft servers (Java & Bedrock) from a single Koishi-based control plane by using a unified WebSocket protocol (**U-WBP v2**).

The repo is organized as a tiny mono-repo with two primary deliverables:

| Package | Description |
| --- | --- |
| [`@uws/koishi-plugin`](packages/koishi-plugin) | Koishi plugin that acts as the unified control plane (adapter + admin API). It manages database schemas, API tokens, ACL, auditing, and exposes REST/SSE interfaces on **Port B**. |
| [`@uws/bridge-node`](packages/bridge-node) | Standalone bridge daemon that runs alongside a Minecraft server. It speaks **U-WBP v2** on **Port A** and adapts server-specific capabilities through pluggable connectors (RCON & shell hooks). |

Both ends implement the behaviours, endpoints, and security requirements described in the project overview. The following sections highlight the most relevant modules.

---

## 1. Koishi Plugin (`packages/koishi-plugin`)

### 1.1 Features

* Extends Koishi models to include `minecraft_servers`, `server_acl`, `api_tokens`, and `audit_logs` tables.
* Manages bridge connections via `BridgeManager`, speaking U-WBP v2, handling reconnect/backoff, capability caching, and live status aggregation.
* Exposes **Port B** (`http://localhost:6251` by default) with REST endpoints:
  * `GET /v1/servers` / `GET /v1/servers/{id}/status` / `GET /v1/servers/{id}/players`
  * `POST /v1/servers/{id}/actions` and `POST /v1/servers/{id}/console`
  * `POST /v1/tokens`, `DELETE /v1/tokens/{id}`, `GET /v1/audit`
  * `GET /v1/events/stream` (Server-Sent Events) for players/metrics/chat topics.
* Issues personal access tokens (hashed in DB) using the Koishi authority system and per-server ACLs.
* Writes every high-risk operation to the `audit_logs` table.

### 1.2 Structure

```
packages/koishi-plugin/
├── src/
│   ├── index.ts             # Koishi entry point
│   ├── bridge-manager.ts    # Manages WebSocket clients to Port A bridges
│   ├── admin-server.ts      # REST/SSE HTTP server
│   ├── audit.ts             # Audit logging helper
│   ├── types.ts             # Shared interfaces + config schema
│   └── utils.ts             # Helpers (token hashing, SSE formatting, etc.)
└── tsconfig.json
```

### 1.3 Configuration

The plugin exposes the configuration described in the spec (admin port, token prefix, SSE heartbeat, command whitelist, reconnect strategy, etc.). Koishi administrators can enable it like any other plugin, e.g.

```ts
import { Context } from 'koishi'
import * as UwsPlugin from '@uws/koishi-plugin'

export const name = 'bot'

export function apply(ctx: Context) {
  ctx.plugin(UwsPlugin, {
    adminPort: 6251,
    tokenPrefix: 'pat_',
    commandWhitelist: ['list', 'say', 'kick', 'ban', 'pardon', 'whitelist', 'time', 'weather'],
    sseHeartbeatSec: 25,
    reconnectMinSec: 10,
    reconnectMaxSec: 300,
    readonlyConcurrency: 4,
    requestTimeoutMs: 5000,
  })
}
```

Once loaded, the plugin automatically boots the admin API and starts connecting to registered bridges. REST clients must supply a valid Koishi-issued bearer token.

---

## 2. Bridge Daemon (`packages/bridge-node`)

### 2.1 Supported server types

The Node-based bridge provides adapters for the following environments. Each adapter conforms to the U-WBP command set and emits capability metadata according to the spec.

* **Java RCON connector** – covers Paper, Folia, Spigot, Spipot, Bukkit, Mohist, Forge, NeoForge, and Fabric. It uses RCON to execute commands, manage whitelist/blacklist/kick/broadcast controls, and gather list/tps data (including Forge `forge tps`).
* **Bedrock connector** – targets LiteLoaderBDS (LLBDS) and other Bedrock cores with RCON.
* **Standalone RCON** – generic connector for any RCON-compatible server or proxy.
* **Shell hook connector** – integrates arbitrary deployments by executing shell scripts for status, players, and control operations.

Additional connectors can be implemented easily by extending `BaseConnector`.

### 2.2 Configuration file

The bridge reads `bridge.config.yaml` (or a custom path provided via `BRIDGE_CONFIG`). Example:

```yaml
listen:
  host: 0.0.0.0
  port: 6250
  token: bridge_secret
server:
  type: paper
  name: Survival-Folia
  core: Folia
  version: 1.21.8
  style: Java
rcon:
  host: localhost
  port: 25575
  password: secret
```

### 2.3 Running

```bash
cd packages/bridge-node
npm install
npm run build
cp bridge.config.example.yaml bridge.config.yaml
node dist/index.js
```

The daemon starts a WebSocket listener (Port A), verifies Koishi’s auth token, and responds to U-WBP requests (`auth`, `getCapabilities`, `getServerInfo`, `control`, `console.exec`, etc.). It also pushes periodic `metrics.tps` updates.

---

## 3. Development workflow

The mono-repo relies on standard TypeScript tooling. Install dependencies and build everything with:

```bash
npm install
npm run --workspaces build
```

---

## 4. Extending the system

* Add new connectors by extending `BaseConnector` and updating the factory in `connectors/index.ts`.
* Custom capabilities/limits can be published via `getCapabilities()`.
* SSE topics from the bridge can be enriched by emitting events through the Koishi plugin’s `BridgeManager` push handler.

---

## 5. License

This project is distributed under the terms of the MIT License. See [`LICENSE`](LICENSE) for details.

