import { Context, Logger } from 'koishi'
import { AdminServer } from './admin-server'
import { AuditService } from './audit'
import { BridgeManager } from './bridge-manager'
import { Config as ConfigSchema, PluginConfig } from './types'

export const name = 'uws-koishi-plugin'
export const Config = ConfigSchema
const logger = new Logger('uws.plugin')

export function apply(ctx: Context, config: PluginConfig) {
  ctx.model.extend(
    'minecraft_servers',
    {
      id: 'unsigned',
      name: 'string',
      host: 'string',
      port: 'unsigned',
      token: 'string',
      groupIds: 'string',
      motdText: 'string',
      maxPlayers: 'unsigned',
      statusInterval: 'unsigned',
      lastStatus: 'json',
      style: 'string',
      core: 'string',
      version: 'string',
      features: 'json',
      reportMode: 'string',
      lastCapsAt: 'timestamp',
    },
    { autoInc: true },
  )

  ctx.model.extend(
    'server_acl',
    {
      id: 'unsigned',
      serverId: 'unsigned',
      subjectType: 'string',
      subjectId: 'string',
      scopes: 'json',
      createdAt: 'timestamp',
      updatedAt: 'timestamp',
    },
    { autoInc: true },
  )

  ctx.model.extend(
    'api_tokens',
    {
      id: 'unsigned',
      name: 'string',
      tokenHash: 'string',
      userId: 'string',
      serverIds: 'json',
      scopes: 'json',
      expiresAt: 'timestamp',
      ipBound: 'json',
      revoked: 'boolean',
      createdAt: 'timestamp',
      createdBy: 'string',
    },
    { autoInc: true },
  )

  ctx.model.extend(
    'audit_logs',
    {
      id: 'unsigned',
      ts: 'timestamp',
      actorType: 'string',
      actorId: 'string',
      action: 'string',
      resource: 'string',
      serverId: 'unsigned',
      requestId: 'string',
      success: 'boolean',
      meta: 'json',
      ip: 'string',
      ua: 'string',
    },
    { autoInc: true },
  )

  const audit = new AuditService(ctx)
  const bridge = new BridgeManager(ctx, config)

  bridge.on('live-status', async (serverId, status) => {
    await ctx.database.set('minecraft_servers', serverId, { lastStatus: status })
  })

  bridge.on('push', async (serverId, payload) => {
    if (payload.cmd === 'getServerInfo' && payload.data) {
      await ctx.database.set('minecraft_servers', serverId, {
        lastStatus: { ...(payload.data || {}) },
      })
    }
  })

  ctx.plugin((ctx) => {
    const admin = new AdminServer(ctx, bridge, audit, config)
    bridge.init().then(() => logger.info('bridge manager initialized'))
    admin.start()
    ctx.on('dispose', () => {
      admin.stop()
    })
  })
}

