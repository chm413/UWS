import WebSocket from 'ws'
import { Context, Logger } from 'koishi'
import { EventEmitter } from 'node:events'
import { v4 as uuidv4 } from 'uuid'
import { BridgeCommandEnvelope, LiveStatus, MinecraftServer, PluginConfig } from './types'
import { now } from './utils'

interface PendingRequest<T = any> {
  resolve: (value: T) => void
  reject: (err: Error) => void
  timeout: NodeJS.Timeout
}

export interface CombinedStatus {
  db?: any
  live?: LiveStatus
  features?: string[]
}

const logger = new Logger('uws.bridge')

export class BridgeConnection extends EventEmitter {
  private ws?: WebSocket
  private pending = new Map<string, PendingRequest>()
  private heartbeat?: NodeJS.Timeout
  private reconnectTimer?: NodeJS.Timeout
  private liveStatus?: LiveStatus
  private features: string[] = []

  constructor(
    private ctx: Context,
    private server: MinecraftServer,
    private config: PluginConfig,
    private onLiveStatus: (serverId: number, status: LiveStatus) => void,
    private onPush: (serverId: number, payload: BridgeCommandEnvelope) => void,
  ) {
    super()
  }

  start() {
    this.connect()
  }

  stop() {
    if (this.ws) {
      this.ws.close()
      this.ws.removeAllListeners()
      this.ws = undefined
    }
    this.pending.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new Error('disconnected'))
    })
    this.pending.clear()
    if (this.heartbeat) clearTimeout(this.heartbeat)
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
  }

  private scheduleReconnect(delay: number) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private connect() {
    const { host, port, token } = this.server
    const url = `ws://${host}:${port}`
    logger.info('connecting to %s', url)
    const ws = new WebSocket(url)
    this.ws = ws

    ws.on('open', () => {
      this.send({
        schema: 'uwbp/v2',
        cmd: 'auth',
        mode: 'request',
        data: { token },
        requestId: uuidv4(),
        timestamp: now(),
      })
    })

    ws.on('message', (raw) => this.handleMessage(raw.toString()))

    ws.on('close', (code) => {
      logger.warn('bridge closed %s:%s (code=%s)', host, port, code)
      this.emit('close', code)
      if (this.heartbeat) clearTimeout(this.heartbeat)
      const delay = Math.min(
        this.config.reconnectMaxSec * 1000,
        Math.max(this.config.reconnectMinSec * 1000, (Math.random() + 1) * this.config.reconnectMinSec * 1000),
      )
      this.scheduleReconnect(delay)
    })

    ws.on('error', (err) => {
      logger.error(err)
    })
  }

  private send(envelope: BridgeCommandEnvelope) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(envelope))
  }

  private handleMessage(raw: string) {
    try {
      const envelope: BridgeCommandEnvelope = JSON.parse(raw)
      this.dispatchEnvelope(envelope)
    } catch (err) {
      logger.warn('invalid message %s', err)
    }
  }

  private dispatchEnvelope(envelope: BridgeCommandEnvelope) {
    if (envelope.mode === 'response' && envelope.requestId) {
      const pending = this.pending.get(envelope.requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pending.delete(envelope.requestId)
        if (envelope.status === 'success' || !envelope.status) {
          pending.resolve(envelope.data)
        } else {
          pending.reject(new Error(envelope.msg || envelope.status))
        }
      }
      if (envelope.cmd === 'getCapabilities' && Array.isArray(envelope.data?.caps)) {
        this.features = envelope.data.caps
        this.ctx.database.set('minecraft_servers', this.server.id, {
          features: envelope.data.caps,
          lastCapsAt: new Date(),
          core: envelope.data.core ?? this.server.core,
          version: envelope.data.version ?? this.server.version,
        })
      }
      if (envelope.cmd === 'pong') {
        this.scheduleHeartbeat()
      }
      return
    }

    if (envelope.mode === 'push') {
      if (envelope.cmd === 'metrics.tps' || envelope.cmd.startsWith('metrics')) {
        const status: LiveStatus = {
          ...(this.liveStatus ?? {}),
          ...(envelope.data ?? {}),
        }
        this.liveStatus = status
        this.onLiveStatus(this.server.id, status)
      }
      this.onPush(this.server.id, envelope)
    }
  }

  private scheduleHeartbeat() {
    if (this.heartbeat) clearTimeout(this.heartbeat)
    this.heartbeat = setTimeout(() => {
      this.send({ schema: 'uwbp/v2', cmd: 'ping', mode: 'request', requestId: uuidv4(), timestamp: now() })
      this.scheduleHeartbeat()
    }, 30000)
  }

  async sendRequest<T = any>(cmd: string, data?: any): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('bridge_not_ready')
    const requestId = uuidv4()
    const timeout = setTimeout(() => {
      const pending = this.pending.get(requestId)
      if (pending) {
        pending.reject(new Error('timeout'))
        this.pending.delete(requestId)
      }
    }, this.config.requestTimeoutMs)
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, timeout })
    })
    this.send({ schema: 'uwbp/v2', cmd, mode: 'request', data, requestId, timestamp: now() })
    return promise
  }

  getLiveStatus() {
    return this.liveStatus
  }

  getFeatures() {
    return this.features
  }
}

export class BridgeManager extends EventEmitter {
  private connections = new Map<number, BridgeConnection>()
  private liveStatus = new Map<number, LiveStatus>()

  constructor(private ctx: Context, private config: PluginConfig) {
    super()
  }

  async init() {
    const servers = await this.ctx.database.get('minecraft_servers', {})
    servers.forEach((server) => this.register(server))
  }

  register(server: MinecraftServer) {
    if (this.connections.has(server.id)) return
    const conn = new BridgeConnection(
      this.ctx,
      server,
      this.config,
      (serverId, status) => {
        this.liveStatus.set(serverId, status)
        this.emit('live-status', serverId, status)
      },
      (serverId, payload) => this.emit('push', serverId, payload),
    )
    this.connections.set(server.id, conn)
    conn.start()
  }

  unregister(serverId: number) {
    const conn = this.connections.get(serverId)
    if (!conn) return
    conn.stop()
    this.connections.delete(serverId)
    this.liveStatus.delete(serverId)
  }

  getConnection(serverId: number) {
    return this.connections.get(serverId)
  }

  getCombinedStatus(server: MinecraftServer): CombinedStatus {
    return {
      db: server.lastStatus ?? null,
      live: this.liveStatus.get(server.id),
      features: this.connections.get(server.id)?.getFeatures(),
    }
  }
}

