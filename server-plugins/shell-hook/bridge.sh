#!/usr/bin/env bash
set -euo pipefail

BRIDGE_PORT=${BRIDGE_PORT:-6250}
BRIDGE_HOST=${BRIDGE_HOST:-0.0.0.0}
BRIDGE_TOKEN=${BRIDGE_TOKEN:-change-me}
SERVER_ID=${SERVER_ID:-shell-hook}
CORE_NAME=${CORE_NAME:-Shell}
VERSION=${VERSION:-1.0.0}
start_bridge() {
  python3 <<'PY' &
import asyncio
import json
import os
import websockets
import psutil

BRIDGE_TOKEN = os.environ.get('BRIDGE_TOKEN', 'change-me')
SERVER_ID = os.environ.get('SERVER_ID', 'shell-hook')
CORE_NAME = os.environ.get('CORE_NAME', 'Shell')
VERSION = os.environ.get('VERSION', '1.0.0')

async def handler(websocket):
    try:
        message = await websocket.recv()
        data = json.loads(message)
        if data.get('cmd') != 'auth' or data.get('data', {}).get('token') != BRIDGE_TOKEN:
            await websocket.send(json.dumps({
                'schema': 'uwbp/v2',
                'mode': 'response',
                'cmd': 'auth',
                'status': 'unauthorized',
                'requestId': data.get('requestId'),
                'timestamp': int(asyncio.get_event_loop().time() * 1000),
            }))
            await websocket.close()
            return
        await websocket.send(json.dumps({
            'schema': 'uwbp/v2',
            'mode': 'response',
            'cmd': 'auth',
            'status': 'success',
            'requestId': data.get('requestId'),
            'timestamp': int(asyncio.get_event_loop().time() * 1000),
            'data': {
                'serverId': SERVER_ID,
                'style': 'Shell',
                'core': CORE_NAME,
                'version': VERSION,
                'reportMode': 'passive',
            }
        }))
        async for message in websocket:
            payload = json.loads(message)
            if payload.get('cmd') == 'getUsage':
                usage = {
                    'schema': 'uwbp/v2',
                    'mode': 'response',
                    'cmd': 'getUsage',
                    'status': 'success',
                    'requestId': payload.get('requestId'),
                    'timestamp': int(asyncio.get_event_loop().time() * 1000),
                    'data': {
                        'cpu': psutil.cpu_percent(interval=None),
                        'memory': psutil.virtual_memory().percent,
                        'threads': psutil.cpu_count(),
                        'uptime': int(asyncio.get_event_loop().time()),
                    },
                }
                await websocket.send(json.dumps(usage))
    except websockets.ConnectionClosed:
        pass

async def main():
    async with websockets.serve(handler, os.environ.get('BRIDGE_HOST', '0.0.0.0'), int(os.environ.get('BRIDGE_PORT', '6250'))):
        await asyncio.Future()

if __name__ == '__main__':
    asyncio.run(main())
PY
}

start_bridge
