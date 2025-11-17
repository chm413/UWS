import { createServer, Server } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { BridgeConfig } from './config'
import { createConnector } from './connectors'
import { BaseConnector } from './connectors/base'
import { v4 as uuidv4 } from 'uuid'

interface ClientState {
  socket: WebSocket
  authorized: boolean
}

export class BridgeWsServer {
  private httpServer: Server
  private wss: WebSocketServer
  private connector: BaseConnector
  private clients = new Set<ClientState>()
  private metricsTimer?: NodeJS.Timeout

  constructor(private config: BridgeConfig) {
    this.httpServer = createServer()
    this.wss = new WebSocketServer({ server: this.httpServer })
    this.connector = createConnector(config)
    this.wss.on('connection', (socket) => this.handleConnection(socket))
  }

  async start() {
    await this.connector.init()
    const port = this.config.listen.port
    const host = this.config.listen.host ?? '0.0.0.0'
    await new Promise<void>((resolve) => this.httpServer.listen(port, host, resolve))
    this.startMetricsLoop()
    console.log(`Bridge listening on ws://${host}:${port}`)
  }

  async stop() {
    this.metricsTimer && clearInterval(this.metricsTimer)
    this.clients.forEach((client) => client.socket.close())
    await new Promise<void>((resolve) => this.httpServer.close(() => resolve()))
    await this.connector.dispose()
  }

  private handleConnection(socket: WebSocket) {
    const state: ClientState = { socket, authorized: false }
    this.clients.add(state)
    socket.on('message', (raw) => this.handleMessage(state, raw.toString()))
    socket.on('close', () => {
      this.clients.delete(state)
    })
  }

  private async handleMessage(client: ClientState, raw: string) {
    let message: any
    try {
      message = JSON.parse(raw)
    } catch (err) {
      return
    }
    const requestId = message.requestId ?? uuidv4()
    const base = { schema: 'uwbp/v2', requestId, cmd: message.cmd, mode: 'response' as const, timestamp: Date.now() }

    const send = (payload: any) => client.socket.send(JSON.stringify({ ...base, ...payload }))

    if (message.cmd === 'auth') {
      if (message.data?.token !== this.config.listen.token) {
        send({ status: 'unauthorized', msg: 'invalid token' })
        client.socket.close(4001, 'unauthorized')
        return
      }
      client.authorized = true
      send({
        status: 'success',
        data: {
          serverId: this.config.server.name ?? 'server',
          style: this.connector.style,
          core: this.connector.core,
          version: this.connector.version,
          reportMode: 'mixed',
        },
      })
      return
    }

    if (!client.authorized) {
      send({ status: 'unauthorized', msg: 'auth required' })
      return
    }

    switch (message.cmd) {
      case 'ping':
        send({ status: 'success', cmd: 'pong', data: { time: Date.now() } })
        break
      case 'getCapabilities': {
        const caps = await this.connector.getCapabilities()
        send({ status: 'success', data: caps })
        break
      }
      case 'getServerInfo': {
        const info = await this.connector.getServerInfo()
        send({ status: 'success', data: info })
        break
      }
      case 'getPlayers': {
        const players = await this.connector.getPlayers()
        send({ status: 'success', data: players })
        break
      }
      case 'getUsage': {
        const usage = await this.connector.getUsage()
        send({ status: 'success', data: usage })
        break
      }
      case 'control': {
        const result = await this.connector.control(message.data?.action, message.data?.params)
        send({ status: result.status === 'success' ? 'success' : result.status, msg: result.msg, data: result.details })
        break
      }
      case 'console.exec': {
        const output = await this.connector.consoleExec(message.data?.command)
        send({ status: output.success ? 'success' : 'fail', data: output })
        break
      }
      default:
        send({ status: 'unsupported', msg: 'Unsupported command' })
        break
    }
  }

  private startMetricsLoop() {
    this.metricsTimer = setInterval(async () => {
      if (!this.clients.size) return
      const usage = await this.connector.getUsage()
      const payload = {
        schema: 'uwbp/v2',
        cmd: 'metrics.tps',
        mode: 'push' as const,
        timestamp: Date.now(),
        data: usage,
      }
      for (const client of this.clients) {
        if (client.authorized && client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(JSON.stringify(payload))
        }
      }
    }, 15000)
  }
}

