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

When optional platform plugins are present the Bukkit adapters surface richer
capabilities automatically:

- **PlaceholderAPI** – exposes `ext.papi.resolve` so Koishi can batch-resolve
  placeholders with optional player context.
- **LuckPerms** – unlocks `ext.lp.*` commands for enumerating groups, managing
  inheritance, and checking player permissions directly through the LuckPerms
  API.
- **Vault** (Economy) – enables `ext.vault.*` operations to query balances and
  move funds between player accounts without shelling out to server commands.

These integrations rely on the official plugin APIs rather than command
wrappers, ensuring responses stay in sync with server-side validation and
permission checks.

For lightweight deployments that cannot host a JVM agent, additional standalone
bridge clients are provided:

- **standalone-rcon** – a Node.js service that proxies RCON-accessible servers
  into U-WBP v2 without needing to install plugins.
- **shell-hook** – a POSIX shell harness that can wrap arbitrary scripts to
  publish server status snapshots through the bridge protocol.

See each sub-directory for build instructions and configuration samples.

## Building the Java artifacts

All Java-based plugins and mods in this workspace are managed by the shared
Gradle build defined in this directory. The toolchain targets Java 21 so the
entire suite can be compiled with a single modern JDK while remaining compatible
with downstream runtimes that still support Java 17 bytecode. Before running the
build locally ensure a Java 21 JDK is installed and available on `PATH` (for
example `apt-get install openjdk-21-jdk` on Debian/Ubuntu images).

With the toolchain in place the artifacts can be compiled with:

```bash
cd server-plugins
gradle build --console=plain
```

Gradle will emit per-module JARs beneath
`build/libs` for the aggregating project and inside each submodule directory.
The first build may take several minutes as dependencies are downloaded.

> **Note:** The Bukkit-family plugins depend on the PaperMC snapshot repository
> (`https://repo.papermc.io/repository/maven-public/`). Network environments that
> block access to that host will cause `403 Forbidden` errors during dependency
> resolution. If that occurs you must either mirror the repository internally or
> provide a local Maven proxy that exposes the required artifacts before the
> build can succeed.

