import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { BridgeConfig } from '../config'
import { BaseConnector, ConnectorCapabilities, ControlResult, PlayersResult, UsageResult } from './base'
import { RconClient } from '../utils/rcon'

const execAsync = promisify(exec)

function parseBedrockList(output: string) {
  const match = output.match(/There are (\d+)\/\d+ players online:(.*)/i)
  if (!match) return { count: 0, players: [] }
  const count = Number(match[1])
  const players = match[2]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((name) => ({ name, platform: 'Bedrock' }))
  return { count, players }
}

export class BedrockConnector extends BaseConnector {
  readonly style: 'Bedrock' = 'Bedrock'
  readonly core: string
  private rcon: RconClient

  constructor(config: BridgeConfig) {
    super(config)
    if (!config.rcon) throw new Error('RCON configuration required for Bedrock connector')
    this.core = config.server.core ?? 'LLBDS'
    this.rcon = new RconClient(config.rcon)
  }

  async init(): Promise<void> {}

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      caps: ['core.info', 'players.list', 'metrics.tps', 'control.runCommand', 'console.exec'],
      limits: { 'rate.qps': 10, 'timeout.ms': 5000, maxBatch: 20 },
    }
  }

  async getServerInfo(): Promise<any> {
    const list = await this.getPlayers()
    return {
      name: this.config.server.name ?? this.core,
      style: this.style,
      core: this.core,
      version: this.version,
      maxPlayers: list.count,
      onlinePlayers: list.count,
    }
  }

  async getPlayers(): Promise<PlayersResult> {
    const output = await this.rcon.send('list')
    return parseBedrockList(output)
  }

  async getUsage(): Promise<UsageResult> {
    try {
      const { stdout } = await execAsync('top -bn1 | head -n 5')
      return { raw: stdout }
    } catch (err) {
      return {}
    }
  }

  async control(action: string, params?: Record<string, any>): Promise<ControlResult> {
    switch (action) {
      case 'runCommand': {
        const output = await this.rcon.send(params?.command ?? '')
        return { status: 'success', msg: output }
      }
      case 'setWeather':
        await this.rcon.send(`weather ${params?.weather ?? 'clear'}`)
        return { status: 'success', msg: 'Weather updated' }
      default:
        return { status: 'unsupported', msg: 'Unsupported action' }
    }
  }

  async consoleExec(command: string): Promise<{ success: boolean; output: string }> {
    const output = await this.rcon.send(command)
    return { success: true, output }
  }

  async dispose(): Promise<void> {
    this.rcon.dispose()
  }
}

