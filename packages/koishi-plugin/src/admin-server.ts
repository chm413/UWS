import http from 'node:http'
import Koa from 'koa'
import Router from 'koa-router'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import { Context, Logger } from 'koishi'
import { BridgeManager } from './bridge-manager'
import {
  ActionRequest,
  ApiToken,
  AuthorizationContext,
  ConsoleRequest,
  MinecraftServer,
  PluginConfig,
  PlayerPage,
  Scope,
} from './types'
import {
  createRequestContext,
  ensureScope,
  ensureServerAccess,
  ensureWhitelist,
  generateToken,
  hashToken,
  safeJson,
  tokenExpired,
} from './utils'
import { AuditService } from './audit'

interface KoaState {
  auth?: AuthorizationContext
  requestId: string
}

interface SseClient {
  id: string
  res: http.ServerResponse
  topics: Set<string>
  scopes: Set<Scope>
}

const logger = new Logger('uws.admin')

const topicScopeMap: Record<string, Scope> = {
  players: 'players:read',
  metrics: 'metrics:read',
  chat: 'logs:read',
  logs: 'logs:read',
}

function mapEventToTopic(cmd: string) {
  if (cmd.startsWith('events.player')) return 'players'
  if (cmd.startsWith('metrics')) return 'metrics'
  if (cmd.startsWith('chat')) return 'chat'
  if (cmd.startsWith('logs')) return 'logs'
  return 'misc'
}

export class AdminServer {
  private app: Koa<any, KoaState>
  private server?: http.Server
  private router: Router<any, KoaState>
  private clients = new Map<string, SseClient>()
  private heartbeat?: NodeJS.Timeout

  constructor(
    private ctx: Context,
    private bridge: BridgeManager,
    private audit: AuditService,
    private config: PluginConfig,
  ) {
    this.app = new Koa<any, KoaState>()
    this.router = new Router<any, KoaState>({ prefix: '/v1' })
    this.setup()
  }

  private setup() {
    this.app.use(cors())

    this.app.use(async (koaCtx, next) => {
      const requestId = koaCtx.get('x-request-id') || generateToken('req_').raw
      ;(koaCtx.state as KoaState).requestId = requestId
      koaCtx.set('x-request-id', requestId)
      try {
        await next()
      } catch (err: any) {
        logger.warn(err)
        const status = err.message === 'unauthorized' ? 401 : err.message === 'forbidden' ? 403 : err.message === 'not_found' ? 404 : 500
        koaCtx.status = status
        koaCtx.body = { data: null, error: { code: err.message || 'error', message: err.message } }
      }
    })

    this.app.use(bodyParser())

    this.app.use(async (koaCtx, next) => {
      if (koaCtx.path.startsWith('/v1')) {
        const authHeader = koaCtx.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          throw new Error('unauthorized')
        }
        const tokenValue = authHeader.slice(7).trim()
        const token = await this.lookupToken(tokenValue, koaCtx)
        if (!token) throw new Error('unauthorized')
        const scopes = new Set(token.scopes as Scope[])
        const serverFilter = token.serverIds ? new Set<number>(token.serverIds) : undefined
        ;(koaCtx.state as KoaState).auth = { token, scopes, serverFilter }
      }
      await next()
    })

    this.router.get('/servers', async (koaCtx) => {
      const { auth } = koaCtx.state
      ensureScope(auth, 'servers:read')
      const servers = await this.ctx.database.get('minecraft_servers', {})
      const filtered = servers.filter((server) => {
        if (!auth?.serverFilter) return true
        return auth.serverFilter.has(server.id)
      })
      const data = filtered.map((server) => {
        const status = this.bridge.getCombinedStatus(server)
        return {
          id: server.id,
          name: server.name,
          core: server.core,
          version: server.version,
          online: status.live?.players ?? status.db?.players?.length ?? 0,
          features: status.features ?? server.features ?? [],
        }
      })
      koaCtx.body = { data, error: null }
    })

    this.router.get('/servers/:id/status', async (koaCtx) => {
      const serverId = Number(koaCtx.params.id)
      const { auth } = koaCtx.state
      ensureScope(auth, 'servers:read')
      ensureServerAccess(auth, serverId)
      const server = await this.getServer(serverId)
      const status = this.bridge.getCombinedStatus(server)
      koaCtx.body = { data: status, error: null }
    })

    this.router.get('/servers/:id/players', async (koaCtx) => {
      const serverId = Number(koaCtx.params.id)
      const { auth } = koaCtx.state
      ensureScope(auth, 'players:read')
      ensureServerAccess(auth, serverId)
      const conn = this.bridge.getConnection(serverId)
      if (!conn) throw new Error('bridge_not_ready')
      const data = await conn.sendRequest<PlayerPage>('getPlayers')
      koaCtx.body = { data, error: null }
    })

    this.router.post('/servers/:id/actions', async (koaCtx) => {
      const serverId = Number(koaCtx.params.id)
      const { auth } = koaCtx.state
      ensureScope(auth, 'servers:control')
      ensureServerAccess(auth, serverId)
      const conn = this.bridge.getConnection(serverId)
      if (!conn) throw new Error('bridge_not_ready')
      const payload = koaCtx.request.body as ActionRequest
      const result = await conn.sendRequest('control', { action: payload.action, params: payload.params })
      await this.audit.log(
        {
          actorType: 'token',
          actorId: auth!.token.name,
          action: `control.${payload.action}`,
          resource: `server:${serverId}`,
          serverId,
          success: true,
          meta: payload,
        },
        createRequestContext(auth, koaCtx.ip, koaCtx.get('user-agent'), koaCtx.state.requestId),
      )
      koaCtx.body = { data: result, error: null }
    })

    this.router.post('/servers/:id/console', async (koaCtx) => {
      const serverId = Number(koaCtx.params.id)
      const { auth } = koaCtx.state
      ensureScope(auth, 'servers:console')
      ensureServerAccess(auth, serverId)
      const payload = koaCtx.request.body as ConsoleRequest
      if (!ensureWhitelist(payload.command, this.config.commandWhitelist)) {
        throw new Error('forbidden')
      }
      const conn = this.bridge.getConnection(serverId)
      if (!conn) throw new Error('bridge_not_ready')
      const result = await conn.sendRequest('console.exec', { command: payload.command })
      await this.audit.log(
        {
          actorType: 'token',
          actorId: auth!.token.name,
          action: 'console.exec',
          resource: `server:${serverId}`,
          serverId,
          success: true,
          meta: payload,
        },
        createRequestContext(auth, koaCtx.ip, koaCtx.get('user-agent'), koaCtx.state.requestId),
      )
      koaCtx.body = { data: result, error: null }
    })

    this.router.post('/tokens', async (koaCtx) => {
      const { auth } = koaCtx.state
      ensureScope(auth, 'tokens:issue')
      const payload = koaCtx.request.body as Partial<ApiToken>
      const token = generateToken(this.config.tokenPrefix)
      const record = await this.ctx.database.create('api_tokens', {
        name: payload.name ?? 'token',
        tokenHash: token.hash,
        userId: payload.userId ?? null,
        serverIds: payload.serverIds ?? null,
        scopes: payload.scopes ?? [],
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null,
        ipBound: payload.ipBound ?? null,
        revoked: false,
        createdAt: new Date(),
        createdBy: auth!.token.name,
      })
      await this.audit.log(
        {
          actorType: 'token',
          actorId: auth!.token.name,
          action: 'tokens.issue',
          resource: `token:${record.id}`,
          serverId: null,
          success: true,
          meta: payload,
        },
        createRequestContext(auth, koaCtx.ip, koaCtx.get('user-agent'), koaCtx.state.requestId),
      )
      koaCtx.body = { data: { token: token.raw, id: record.id }, error: null }
    })

    this.router.delete('/tokens/:id', async (koaCtx) => {
      const { auth } = koaCtx.state
      ensureScope(auth, 'tokens:revoke')
      const id = Number(koaCtx.params.id)
      await this.ctx.database.set('api_tokens', id, { revoked: true })
      await this.audit.log(
        {
          actorType: 'token',
          actorId: auth!.token.name,
          action: 'tokens.revoke',
          resource: `token:${id}`,
          serverId: null,
          success: true,
          meta: {},
        },
        createRequestContext(auth, koaCtx.ip, koaCtx.get('user-agent'), koaCtx.state.requestId),
      )
      koaCtx.body = { data: true, error: null }
    })

    this.router.get('/audit', async (koaCtx) => {
      const { auth } = koaCtx.state
      ensureScope(auth, 'audit:read')
      const serverId = koaCtx.query.serverId ? Number(koaCtx.query.serverId) : undefined
      const logs = await this.ctx.database.get('audit_logs', serverId ? { serverId } : {})
      koaCtx.body = { data: logs, error: null }
    })

    this.router.get('/events/stream', async (koaCtx) => {
      const { auth } = koaCtx.state
      const topicsParam = String(koaCtx.query.topics || '')
      const topics = new Set(
        topicsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      if (!topics.size) topics.add('metrics')
      topics.forEach((topic) => ensureScope(auth, topicScopeMap[topic] ?? 'servers:read'))

      const req = koaCtx.req
      const res = koaCtx.res
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      })
      const clientId = generateToken('sse_').raw
      const client: SseClient = {
        id: clientId,
        res,
        topics,
        scopes: auth!.scopes,
      }
      this.clients.set(clientId, client)
      res.write(': connected\n\n')
      const heartbeat = setInterval(() => {
        if (res.writableEnded) return
        res.write(`: ping ${new Date().toISOString()}\n\n`)
      }, this.config.sseHeartbeatSec * 1000)
      req.on('close', () => {
        clearInterval(heartbeat)
        this.clients.delete(clientId)
      })
      koaCtx.respond = false
    })

    this.app.use(this.router.routes())
    this.app.use(this.router.allowedMethods())

    this.bridge.on('push', (serverId, envelope) => {
      const topic = mapEventToTopic(envelope.cmd)
      const payload = safeJson({ serverId, eventId: envelope.requestId ?? envelope.timestamp, timestamp: Date.now(), data: envelope.data })
      this.broadcast(topic, payload)
    })

    this.bridge.on('live-status', (serverId, status) => {
      const payload = safeJson({ serverId, timestamp: Date.now(), data: status })
      this.broadcast('metrics', payload)
    })
  }

  private broadcast(topic: string, payload: any) {
    for (const client of this.clients.values()) {
      if (!client.topics.has(topic)) continue
      if (client.res.writableEnded) {
        this.clients.delete(client.id)
        continue
      }
      client.res.write(`event: ${topic}\n`)
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
  }

  private async lookupToken(rawToken: string, koaCtx: Koa.ParameterizedContext<any, KoaState>) {
    const hash = hashToken(rawToken)
    const [record] = await this.ctx.database.get('api_tokens', { tokenHash: hash })
    if (!record || record.revoked || tokenExpired(record)) return null
    if (record.ipBound && record.ipBound.length && !record.ipBound.includes(koaCtx.ip)) return null
    return record
  }

  private async getServer(id: number) {
    const [server] = await this.ctx.database.get('minecraft_servers', { id })
    if (!server) throw new Error('not_found')
    return server
  }

  start() {
    this.server = this.app.listen(this.config.adminPort, () => {
      logger.info('admin port listening on %d', this.config.adminPort)
    })
  }

  stop() {
    this.server?.close()
    this.server = undefined
    this.clients.forEach((client) => client.res.end())
    this.clients.clear()
  }
}

