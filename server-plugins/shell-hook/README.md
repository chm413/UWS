# Shell Hook Bridge (C++)

This standalone bridge targets minimal deployments that cannot host the
full Java/Node adapters. It exposes the Unified Websocket Bridge Protocol
(U-WBP v2) over a lightweight C++ WebSocket server, while delegating any
server-specific logic to operator-provided shell hooks.

## Features

- Pure C++20 binary using Boost.Asio/Beast, no Python or Node runtime required.
- Authenticates Koishi connections with the shared bridge token and
  responds to `getServerInfo`, `getCapabilities`, `getUsage`, and `ping`.
- Optional control handler: forward any `control` action to an external
  script/binary (receives context through environment variables).
- Environment-variable configuration for port, identity, advertised caps,
  and control hooks, making it trivial to containerize.

## Building

```bash
cd server-plugins/shell-hook
cmake -S . -B build
cmake --build build --config Release
```

The resulting `build/shell_bridge` binary is completely self-contained.

## Running

```bash
export BRIDGE_TOKEN=super-secret
export SERVER_ID=shell-hook
export SERVER_NAME="Legacy Survival"
export CORE_NAME=Shell
export VERSION=1.0.0
export CAPABILITIES="core.info,metrics.tps,control.runCommand"
export CONTROL_HANDLER="/usr/local/bin/control-hook.sh"
./build/shell_bridge
```

When a Koishi adapter connects it must issue the standard `auth` request
with the same `BRIDGE_TOKEN`. After authentication the bridge replies to
status queries and exposes the configured capability list. If a
`CONTROL_HANDLER` is provided the bridge will populate two environment
variables before invoking it:

- `UWS_ACTION` – the requested control action, e.g. `setWeather`.
- `UWS_PARAMS` – JSON string containing the supplied parameters.

The handler's stdout is relayed back to Koishi as the response message.
If the handler variable is empty, the bridge responds with `unsupported`
for control commands.
