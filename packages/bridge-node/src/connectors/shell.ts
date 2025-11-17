import { exec } from 'child_process'
import { promisify } from 'util'
import { BridgeConfig } from '../config'
import { BaseConnector, ConnectorCapabilities, ControlResult, PlayersResult, UsageResult } from './base'

const execAsync = promisify(exec)

export class ShellHookConnector extends BaseConnector {
  readonly style: 'Java' | 'Bedrock'
  readonly core: string

  constructor(config: BridgeConfig) {
    super(config)
    if (!config.shell) throw new Error('Shell configuration required')
    this.style = config.server.style ?? 'Java'
    this.core = config.server.core ?? 'Shell'
  }

  async init(): Promise<void> {}

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      caps: ['core.info', 'players.list', 'metrics.tps', 'control.runCommand'],
      limits: { 'rate.qps': 3, 'timeout.ms': 8000, maxBatch: 10 },
    }
  }

  async execCommand(command: string) {
    const cwd = this.config.shell?.cwd
    const { stdout } = await execAsync(command, { cwd })
    return stdout.trim()
  }

  async getServerInfo(): Promise<any> {
    return {
      name: this.config.server.name ?? 'Shell Managed Server',
      style: this.style,
      core: this.core,
      version: this.config.server.version ?? 'unknown',
    }
  }

  async getPlayers(): Promise<PlayersResult> {
    const command = this.config.shell?.playersCommand ?? 'cat /tmp/players.json'
    try {
      const stdout = await this.execCommand(command)
      const players = JSON.parse(stdout)
      return { count: players.length, players }
    } catch (err) {
      return { count: 0, players: [] }
    }
  }

  async getUsage(): Promise<UsageResult> {
    const output = this.config.shell?.statusCommand ? await this.execCommand(this.config.shell.statusCommand) : ''
    return { raw: output }
  }

  async control(action: string, params?: Record<string, any>): Promise<ControlResult> {
    if (!this.config.shell?.controlCommand) return { status: 'unsupported' }
    const payload = JSON.stringify({ action, params })
    await this.execCommand(`${this.config.shell.controlCommand} '${payload.replace(/'/g, "'\\''")}'`)
    return { status: 'success', msg: 'Command executed' }
  }

  async consoleExec(command: string): Promise<{ success: boolean; output: string }> {
    const output = await this.control('runCommand', { command })
    return { success: output.status === 'success', output: output.msg ?? '' }
  }
}

