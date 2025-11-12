import { EventEmitter } from 'eventemitter3'
import { BridgeConfig } from '../config'

export interface ConnectorCapabilities {
  caps: string[]
  limits: {
    'rate.qps': number
    'timeout.ms': number
    maxBatch: number
  }
}

export interface PlayersResult {
  count: number
  players: any[]
}

export interface UsageResult {
  cpu?: number
  memory?: number
  tps?: number
  tickTime?: number
  threads?: number
  uptime?: number
  [key: string]: any
}

export interface ControlResult {
  status: 'success' | 'fail' | 'unsupported'
  msg?: string
  details?: any
}

export abstract class BaseConnector extends EventEmitter {
  protected constructor(protected config: BridgeConfig) {
    super()
  }

  abstract readonly style: 'Java' | 'Bedrock'
  abstract readonly core: string

  get name() {
    return this.config.server.name ?? this.core
  }

  get version() {
    return this.config.server.version ?? 'unknown'
  }

  abstract init(): Promise<void>
  abstract getCapabilities(): Promise<ConnectorCapabilities>
  abstract getServerInfo(): Promise<any>
  abstract getPlayers(): Promise<PlayersResult>
  abstract getUsage(): Promise<UsageResult>
  abstract control(action: string, params?: Record<string, any>): Promise<ControlResult>
  abstract consoleExec(command: string): Promise<{ success: boolean; output: string }>

  async dispose(): Promise<void> {
    // optional override
  }
}

