# Standalone RCON Bridge

This lightweight Node.js service connects to a Minecraft server through RCON
and exposes the Unified Websocket Bridge Protocol (U-WBP v2) so that Koishi can
consume telemetry and issue control actions without installing a plugin. The
service mirrors the built-in Java connector from `packages/bridge-node` but is
packaged as an independent script for environments where installing the full
bridge manager is undesirable.

## Usage

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `config.example.json` to `config.json` and adjust the RCON and U-WBP
   credentials.

3. Start the bridge:

   ```bash
   node index.js
   ```

The process listens for Koishi on the configured WebSocket port while polling
RCON for player lists and metrics.
