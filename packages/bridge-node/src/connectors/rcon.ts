import { BridgeConfig } from '../config'
import { BaseConnector, ConnectorCapabilities, ControlResult, PlayersResult, UsageResult } from './base'
import { RconClient } from '../utils/rcon'

export class StandaloneRconConnector extends BaseConnector {
  readonly style: 'Java' = 'Java'
  readonly core: string
  private rcon: RconClient

  constructor(config: BridgeConfig) {
    super(config)
    if (!config.rcon) throw new Error('RCON configuration required')
    this.rcon = new RconClient(config.rcon)
    this.core = config.server.core ?? 'RCON'
  }

  async init(): Promise<void> {}

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      caps: ['core.info', 'players.list', 'control.runCommand', 'console.exec'],
      limits: { 'rate.qps': 5, 'timeout.ms': 5000, maxBatch: 10 },
    }
  }

  async getServerInfo(): Promise<any> {
    return {
      name: this.config.server.name ?? 'Standalone RCON',
      style: this.style,
      core: this.core,
      version: this.version,
    }
  }

  async getPlayers(): Promise<PlayersResult> {
    const output = await this.rcon.send('list')
    const [, listPart] = output.split(':')
    const rawNames = listPart ? listPart.trim() : ''
    const names = rawNames
      .split(',')
      .map((entry: string) => entry.trim())
      .filter((entry: string): entry is string => entry.length > 0)
    return {
      count: names.length,
      players: names.map((playerName: string) => ({ name: playerName })),
      raw: output,
    }

  async getUsage(): Promise<UsageResult> {
    return {}
  }

  async control(action: string, params?: Record<string, any>): Promise<ControlResult> {
    if (action === 'runCommand') {
      const output = await this.rcon.send(params?.command ?? '')
      return { status: 'success', msg: output }
    }
    return { status: 'unsupported', msg: 'Unsupported action' }
  }

  async consoleExec(command: string): Promise<{ success: boolean; output: string }> {
    const output = await this.rcon.send(command)
    return { success: true, output }
  }

  async dispose(): Promise<void> {
    await this.rcon.dispose()
  }
}

