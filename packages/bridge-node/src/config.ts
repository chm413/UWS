export type ServerType =
  | 'paper'
  | 'spigot'
  | 'spipot'
  | 'bukkit'
  | 'mohist'
  | 'forge'
  | 'neoforge'
  | 'fabric'
  | 'llbds'
  | 'standalone-rcon'
  | 'shell-hook'

export interface BridgeListenConfig {
  host?: string
  port: number
  token: string
}

export interface RconConfig {
  host: string
  port: number
  password: string
  timeoutMs?: number
}

export interface ShellHookConfig {
  statusCommand: string
  playersCommand?: string
  controlCommand?: string
  cwd?: string
}

export interface BridgeConfig {
  listen: BridgeListenConfig
  server: {
    type: ServerType
    name?: string
    core?: string
    version?: string
    style?: 'Java' | 'Bedrock'
  }
  rcon?: RconConfig
  shell?: ShellHookConfig
  metrics?: {
    cpuCommand?: string
    memoryCommand?: string
  }
}

