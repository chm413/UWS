import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { BridgeConfig } from '../config'
import { BaseConnector, ConnectorCapabilities, ControlResult, PlayersResult, UsageResult } from './base'
import { RconClient } from '../utils/rcon'

const execAsync = promisify(exec)

function parseList(output: string) {
  const match = output.match(/There are (\d+) of a max of (\d+) players online: (.*)/i)
  if (!match) return { count: 0, players: [] }
  const count = Number(match[1])
  const players = match[3]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((name) => ({ name }))
  return { count, players }
}

export class JavaRconConnector extends BaseConnector {
  readonly style: 'Java' = 'Java'
  readonly core: string
  private rcon: RconClient

  constructor(config: BridgeConfig) {
    super(config)
    if (!config.rcon) throw new Error('RCON configuration required for Java connector')
    this.rcon = new RconClient(config.rcon)
    this.core = config.server.core ?? config.server.type.toUpperCase()
  }

  async init(): Promise<void> {}

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      caps: [
        'core.info',
        'players.list',
        'metrics.tps',
        'control.runCommand',
        'control.setWeather',
        'control.setTime',
        'events.chat',
        'console.exec',
      ],
      limits: { 'rate.qps': 20, 'timeout.ms': 5000, maxBatch: 50 },
    }
  }

  async getServerInfo(): Promise<any> {
    const motd = await this.rcon.send('motd')
    const list = await this.getPlayers()
    return {
      name: this.name,
      style: this.style,
      core: this.core,
      version: this.version,
      description: motd?.trim(),
      maxPlayers: list.count,
      onlinePlayers: list.count,
    }
  }

  async getPlayers(): Promise<PlayersResult> {
    const output = await this.rcon.send('list')
    return parseList(output)
  }

  async getUsage(): Promise<UsageResult> {
    try {
      const { stdout } = await execAsync('top -bn1 | head -n 5')
      return { cpu: undefined, memory: undefined, raw: stdout }
    } catch (err) {
      return { }
    }
  }

  async control(action: string, params?: Record<string, any>): Promise<ControlResult> {
    switch (action) {
      case 'setWeather': {
        await this.rcon.send(`weather ${params?.weather ?? 'clear'}`)
        return { status: 'success', msg: `Weather set to ${params?.weather}` }
      }
      case 'setTime': {
        await this.rcon.send(`time set ${params?.time ?? 'day'}`)
        return { status: 'success', msg: `Time set to ${params?.time}` }
      }
      case 'runCommand': {
        const output = await this.rcon.send(params?.command ?? '')
        return { status: 'success', msg: output }
      }
      default:
        return { status: 'unsupported', msg: 'Action not supported' }
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

