# Shell Hook Bridge

For highly constrained environments the bridge can be hosted as a POSIX shell
script. The hook periodically executes user-defined commands to gather status
and writes Unified Websocket Bridge Protocol frames using `curl`.

## Usage

1. Copy `bridge.sh` to the server and make it executable:

   ```bash
   chmod +x bridge.sh
   ```

2. Update the configuration variables inside the script to point at the Koishi
   instance and customize the status and control handlers.

3. Run the script in the background or under a supervisor.

The default implementation publishes a basic heartbeat, CPU/memory snapshot, and
invokes backend commands when Koishi sends control messages.
