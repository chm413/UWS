import { WebSocketServer } from 'ws'
import { Rcon } from 'rcon-client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import crypto from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const configPath = path.join(__dirname, 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

const rcon = new Rcon({
  host: config.rcon.host,
  port: config.rcon.port,
  password: config.rcon.password,
})

const wss = new WebSocketServer({ host: config.listen.host, port: config.listen.port })

let authorizedClients = new Set()

async function ensureRcon() {
  if (!rcon.connected) {
    await rcon.connect()
  }
}

wss.on('connection', (socket) => {
  const state = { authorized: false }
  socket.on('message', async (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch (err) {
      return
    }
    const requestId = message.requestId || crypto.randomUUID()

    const send = (payload) => {
      socket.send(
        JSON.stringify({
          schema: 'uwbp/v2',
          mode: 'response',
          requestId,
          cmd: message.cmd,
          timestamp: Date.now(),
          ...payload,
        }),
      )
    }

    if (message.cmd === 'auth') {
      if (message.data?.token !== config.listen.token) {
        send({ status: 'unauthorized', msg: 'invalid token' })
        socket.close(4001, 'unauthorized')
        return
      }
      state.authorized = true
      authorizedClients.add(socket)
      send({
        status: 'success',
        data: {
          serverId: config.listen.serverId,
          style: config.listen.style,
          core: config.listen.core,
          version: config.listen.version,
          reportMode: 'mixed',
        },
      })
      return
    }

    if (!state.authorized) {
      send({ status: 'unauthorized', msg: 'auth required' })
      return
    }

    switch (message.cmd) {
      case 'ping':
        send({ status: 'success', cmd: 'pong', data: { time: Date.now() } })
        break
      case 'getServerInfo':
        send({ status: 'success', data: await getServerInfo() })
        break
      case 'getPlayers':
        send({ status: 'success', data: await getPlayers() })
        break
      case 'getUsage':
        send({ status: 'success', data: getUsage() })
        break
      case 'control':
        send({ status: 'success', data: await handleControl(message.data) })
        break
      case 'console.exec':
        send({ status: 'success', data: await runCommand(message.data?.command) })
        break
      default:
        send({ status: 'unsupported', msg: 'unknown command' })
    }
  })

  socket.on('close', () => {
    authorizedClients.delete(socket)
  })
})

async function runCommand(command) {
  if (!command) {
    return { success: false, output: 'missing command' }
  }
  try {
    await ensureRcon()
    const output = await rcon.send(command)
    return { success: true, output }
  } catch (err) {
    return { success: false, output: String(err) }
  }
}

async function getServerInfo() {
  return {
    name: config.listen.serverId,
    style: config.listen.style,
    core: config.listen.core,
    version: config.listen.version,
    description: 'RCON proxied server',
    motd: 'RCON proxied server',
    maxPlayers: (await getPlayers()).maxPlayers,
    onlinePlayers: (await getPlayers()).count,
    whitelistEnabled: false,
    serverMode: 'unknown',
  }
}

async function getPlayers() {
  try {
    await ensureRcon()
    const raw = await rcon.send('list')
    const match = raw.match(/(\d+)\s*\/\s*(\d+)/)
    const count = match ? Number(match[1]) : 0
    const maxPlayers = match ? Number(match[2]) : 0
    const namesMatch = raw.match(/:(.*)/)
    const names = namesMatch && namesMatch[1] ? namesMatch[1].split(',').map((n) => n.trim()).filter(Boolean) : []
    const players = names.map((name) => ({ name, uuid: null, platform: 'Java', auth: 'unknown' }))
    return { count, players, maxPlayers }
  } catch (err) {
    return { count: 0, players: [], maxPlayers: 0, error: String(err) }
  }
}

function getUsage() {
  const load = os.loadavg()
  const runtime = process.uptime()
  return {
    cpu: Math.round((load[0] / os.cpus().length) * 10000) / 100,
    memory: Math.round((process.memoryUsage().rss / os.totalmem()) * 10000) / 100,
    tps: null,
    tickTime: null,
    threads: os.cpus().length,
    uptime: Math.round(runtime),
  }
}

async function handleControl(data) {
  if (!data?.action) {
    return { status: 'fail', msg: 'missing action' }
  }
  switch (data.action) {
    case 'runCommand':
      return runCommand(data.params?.command || '')
    case 'setWeather':
      await runCommand(`weather ${data.params?.weather || 'clear'}`)
      return { status: 'success' }
    case 'setTime':
      await runCommand(`time set ${data.params?.time ?? 0}`)
      return { status: 'success' }
    case 'broadcast':
      await runCommand(`say ${data.params?.message ?? ''}`)
      return { status: 'success' }
    default:
      return { status: 'unsupported', msg: 'action not implemented' }
  }
}

console.log(`Standalone RCON bridge listening on ws://${config.listen.host}:${config.listen.port}`)
