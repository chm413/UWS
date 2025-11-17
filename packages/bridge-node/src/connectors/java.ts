import { BridgeConfig } from '../config'
import { BaseConnector, ConnectorCapabilities, ControlResult, PlayersResult, UsageResult } from './base'
import { RconClient } from '../utils/rcon'

export type JavaVariantType =
  | 'paper'
  | 'spigot'
  | 'spipot'
  | 'bukkit'
  | 'mohist'
  | 'forge'
  | 'neoforge'
  | 'fabric'

interface JavaVariantOptions {
  core: string
  reportMode: 'proactive' | 'passive' | 'mixed'
  metricsCommand?: string
  pluginsCommand?: string
  reloadCommand?: string
  extraCaps?: string[]
}

const JAVA_VARIANT_METADATA: Record<JavaVariantType, JavaVariantOptions> = {
  paper: {
    core: 'Paper',
    reportMode: 'mixed',
    metricsCommand: 'tps',
    pluginsCommand: 'plugins',
    reloadCommand: 'reload confirm',
    extraCaps: ['metrics.mspt'],
  },
  spigot: {
    core: 'Spigot',
    reportMode: 'mixed',
    metricsCommand: 'tps',
    pluginsCommand: 'plugins',
  },
  spipot: {
    core: 'Spigot',
    reportMode: 'mixed',
    metricsCommand: 'tps',
    pluginsCommand: 'plugins',
  },
  bukkit: {
    core: 'Bukkit',
    reportMode: 'passive',
    metricsCommand: 'tps',
    pluginsCommand: 'plugins',
  },
  mohist: {
    core: 'Mohist',
    reportMode: 'mixed',
    metricsCommand: 'forge tps',
    pluginsCommand: 'plugins',
  },
  forge: {
    core: 'Forge',
    reportMode: 'mixed',
    metricsCommand: 'forge tps',
    pluginsCommand: 'forge mods',
  },
  neoforge: {
    core: 'NeoForge',
    reportMode: 'mixed',
    metricsCommand: 'forge tps',
    pluginsCommand: 'forge mods',
  },
  fabric: {
    core: 'Fabric',
    reportMode: 'mixed',
    metricsCommand: 'tps',
  },
}

const BASE_CAPABILITIES = [
  'core.info',
  'players.list',
  'metrics.tps',
  'control.runCommand',
  'control.setWeather',
  'control.setTime',
  'control.broadcast',
  'control.kickPlayer',
  'control.whitelistAdd',
  'control.whitelistRemove',
  'control.blacklistAdd',
  'control.blacklistRemove',
  'control.reloadServer',
  'control.stopServer',
  'console.exec',
]

function parseList(output: string): PlayersResult {
  const result: PlayersResult = { count: 0, players: [], raw: output }
  const detailMatch = output.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/i)
  const simpleMatch = output.match(/There are (\d+) players online:?\s*(.*)/i)

  if (detailMatch) {
    result.count = Number(detailMatch[1])
    result.maxPlayers = Number(detailMatch[2])
    const names = detailMatch[3]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    result.players = names.map((name) => ({ name }))
    return result
  }

  if (simpleMatch) {
    result.count = Number(simpleMatch[1])
    const names = simpleMatch[2]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    result.players = names.map((name) => ({ name }))
    return result
  }

  if (output.includes(':')) {
    const [, names] = output.split(':', 2)
    const parsed = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    result.players = parsed.map((name) => ({ name }))
    result.count = parsed.length
  }

  return result
}

function parsePlugins(output: string) {
  const plugins: { name: string }[] = []
  const matcher = output.match(/Plugins? \((\d+)\): (.*)/i)
  if (matcher) {
    const names = matcher[2]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    for (const name of names) {
      plugins.push({ name })
    }
    return plugins
  }

  const forgeMatch = output.match(/Mods?:\s*(.*)/i)
  if (forgeMatch) {
    const names = forgeMatch[1]
      .split(',')
      .map((name) => name.replace(/\[[^\]]+\]/g, '').trim())
      .filter(Boolean)
    for (const name of names) {
      plugins.push({ name })
    }
  }
  return plugins
}

function extractTps(output: string): number | undefined {
  const minute = output.match(/TPS from last 1m, 5m, 15m:\s*([0-9.]+)/i)
  if (minute) return Number(minute[1])
  const direct = output.match(/TPS[:=]\s*([0-9.]+)/i)
  if (direct) return Number(direct[1])
  return undefined
}

function extractMspt(output: string): number | undefined {
  const mspt = output.match(/MSPT[:=]\s*([0-9.]+)/i)
  if (mspt) return Number(mspt[1])
  const tick = output.match(/Tick(?: time)?[:=]\s*([0-9.]+)/i)
  if (tick) return Number(tick[1])
  return undefined
}

export class JavaRconConnector extends BaseConnector {
  readonly style: 'Java' = 'Java'
  readonly core: string
  private readonly rcon: RconClient
  private readonly variant: JavaVariantOptions

  constructor(config: BridgeConfig, variant?: JavaVariantOptions) {
    super(config)
    if (!config.rcon) throw new Error('RCON configuration required for Java connector')
    this.variant = variant ?? {
      core: config.server.core ?? config.server.type.toUpperCase(),
      reportMode: 'mixed',
    }
    this.rcon = new RconClient(config.rcon)
    this.core = config.server.core ?? this.variant.core
  }

  async init(): Promise<void> {}

  protected getCapabilitiesList() {
    return Array.from(new Set([...BASE_CAPABILITIES, ...(this.variant.extraCaps ?? [])]))
  }

  async getCapabilities(): Promise<ConnectorCapabilities> {
    return {
      caps: this.getCapabilitiesList(),
      limits: { 'rate.qps': 20, 'timeout.ms': 5000, maxBatch: 50 },
    }
  }

  private async fetchVersion(): Promise<string | undefined> {
    try {
      const output = await this.rcon.send('version')
      const match = output.match(/running\s+([\w .()\-]+?)(?:\s+\(.*\))?$/i)
      if (match) return match[1].trim()
      return output.trim()
    } catch (err) {
      return undefined
    }
  }

  private async fetchPlugins(): Promise<{ name: string }[]> {
    if (!this.variant.pluginsCommand) return []
    try {
      const output = await this.rcon.send(this.variant.pluginsCommand)
      return parsePlugins(output)
    } catch (err) {
      return []
    }
  }

  async getServerInfo(): Promise<any> {
    const [players, plugins, version] = await Promise.all([
      this.getPlayers(),
      this.fetchPlugins(),
      this.fetchVersion(),
    ])

    return {
      name: this.name,
      style: this.style,
      core: this.core,
      version: version ?? this.version,
      maxPlayers: players.maxPlayers,
      onlinePlayers: players.count,
      plugins,
      reportMode: this.variant.reportMode,
    }
  }

  async getPlayers(): Promise<PlayersResult> {
    try {
      const output = await this.rcon.send('list')
      return parseList(output)
    } catch (err) {
      return { count: 0, players: [] }
    }
  }

  async getUsage(): Promise<UsageResult> {
    const command = this.variant.metricsCommand ?? 'tps'
    try {
      const output = await this.rcon.send(command)
      return {
        tps: extractTps(output),
        tickTime: extractMspt(output),
        raw: output,
      }
    } catch (err) {
      return {}
    }
  }

  async control(action: string, params?: Record<string, any>): Promise<ControlResult> {
    switch (action) {
      case 'setWeather': {
        const weather = params?.weather ?? 'clear'
        await this.rcon.send(`weather ${weather}`)
        return { status: 'success', msg: `Weather set to ${weather}` }
      }
      case 'setTime': {
        const time = params?.time ?? 'day'
        await this.rcon.send(`time set ${time}`)
        return { status: 'success', msg: `Time set to ${time}` }
      }
      case 'broadcast': {
        const message = params?.message ?? ''
        if (!message) return { status: 'fail', msg: 'message required' }
        await this.rcon.send(`say ${message}`)
        return { status: 'success', msg: 'Message broadcasted' }
      }
      case 'kickPlayer': {
        const player = params?.player ?? params?.name
        if (!player) return { status: 'fail', msg: 'player required' }
        const reason = params?.reason ? ` ${params.reason}` : ''
        await this.rcon.send(`kick ${player}${reason}`.trim())
        return { status: 'success', msg: `Kicked ${player}` }
      }
      case 'whitelistAdd': {
        const player = params?.player ?? params?.name
        if (!player) return { status: 'fail', msg: 'player required' }
        await this.rcon.send(`whitelist add ${player}`)
        return { status: 'success', msg: `Whitelisted ${player}` }
      }
      case 'whitelistRemove': {
        const player = params?.player ?? params?.name
        if (!player) return { status: 'fail', msg: 'player required' }
        await this.rcon.send(`whitelist remove ${player}`)
        return { status: 'success', msg: `Removed ${player} from whitelist` }
      }
      case 'blacklistAdd': {
        const player = params?.player ?? params?.name
        if (!player) return { status: 'fail', msg: 'player required' }
        const reason = params?.reason ? ` ${params.reason}` : ''
        await this.rcon.send(`ban ${player}${reason}`.trim())
        return { status: 'success', msg: `Banned ${player}` }
      }
      case 'blacklistRemove': {
        const player = params?.player ?? params?.name
        if (!player) return { status: 'fail', msg: 'player required' }
        await this.rcon.send(`pardon ${player}`)
        return { status: 'success', msg: `Unbanned ${player}` }
      }
      case 'reloadServer': {
        const command = this.variant.reloadCommand ?? 'reload'
        await this.rcon.send(command)
        return { status: 'success', msg: 'Reload initiated' }
      }
      case 'stopServer': {
        await this.rcon.send('stop')
        return { status: 'success', msg: 'Stop command sent' }
      }
      case 'runCommand': {
        const command = params?.command
        if (!command) return { status: 'fail', msg: 'command required' }
        const output = await this.rcon.send(command)
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
    await this.rcon.dispose()
  }
}

export function createJavaConnector(type: JavaVariantType, config: BridgeConfig): JavaRconConnector {
  const metadata = JAVA_VARIANT_METADATA[type]
  return new JavaRconConnector(config, metadata)
}

export { JAVA_VARIANT_METADATA }
