import { BridgeConfig } from '../config'
import { BaseConnector } from './base'
import { createJavaConnector } from './java'
import type { JavaVariantType } from './java'
import { BedrockConnector } from './bedrock'
import { StandaloneRconConnector } from './rcon'
import { ShellHookConnector } from './shell'

export function createConnector(config: BridgeConfig): BaseConnector {
  switch (config.server.type) {
    case 'paper':
    case 'spigot':
    case 'bukkit':
    case 'mohist':
    case 'forge':
    case 'neoforge':
    case 'fabric':
      return createJavaConnector(config.server.type as JavaVariantType, config)
    case 'llbds':
      return new BedrockConnector(config)
    case 'standalone-rcon':
      return new StandaloneRconConnector(config)
    case 'shell-hook':
      return new ShellHookConnector(config)
    default:
      throw new Error(`Unsupported server type ${config.server.type}`)
  }
}

