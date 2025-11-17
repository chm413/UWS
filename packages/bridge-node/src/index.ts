import fs from 'fs'
import path from 'path'
import { BridgeConfig } from './config'
import { BridgeWsServer } from './ws-server'
import yaml from 'yaml'

function loadConfig(): BridgeConfig {
  const configPath = process.env.BRIDGE_CONFIG || path.join(process.cwd(), 'bridge.config.yaml')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`)
  }
  const raw = fs.readFileSync(configPath, 'utf8')
  if (configPath.endsWith('.json')) {
    return JSON.parse(raw)
  }
  return yaml.parse(raw)
}

async function main() {
  try {
    const config = loadConfig()
    const server = new BridgeWsServer(config)
    await server.start()
    process.on('SIGINT', () => {
      server.stop().then(() => process.exit(0))
    })
    process.on('SIGTERM', () => {
      server.stop().then(() => process.exit(0))
    })
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()

