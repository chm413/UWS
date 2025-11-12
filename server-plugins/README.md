# Minecraft Bridge Server Plugins

This directory contains reference implementations of bridge clients that connect
Minecraft servers to the Koishi management plane via the Unified Websocket
Bridge Protocol (U-WBP v2). Each sub-directory targets a different server
runtime and demonstrates how to surface common telemetry, player events, and
control primitives back to Koishi.

The modules share a lightweight Java library that handles the protocol framing,
reconnect logic, and topic subscription tracking. Platform-specific adapters map
local server APIs to the standard bridge commands. The Java-oriented platforms
(Paper, Spigot, Spipot, Bukkit, Mohist) build on a shared Bukkit foundation,
whereas Forge, NeoForge, and Fabric expose their lifecycle hooks using their
respective modding APIs.

For lightweight deployments that cannot host a JVM agent, additional standalone
bridge clients are provided:

- **standalone-rcon** – a Node.js service that proxies RCON-accessible servers
  into U-WBP v2 without needing to install plugins.
- **shell-hook** – a POSIX shell harness that can wrap arbitrary scripts to
  publish server status snapshots through the bridge protocol.

See each sub-directory for build instructions and configuration samples.
