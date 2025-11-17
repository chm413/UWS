import { Rcon } from 'rcon-client'
import { RconConfig } from '../config'

export class RconClient {
  private client?: Rcon

  constructor(private config: RconConfig) {}

  async connect() {
    if (this.client) return
    this.client = await Rcon.connect({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      timeout: this.config.timeoutMs ?? 5000,
    })
  }

  async send(command: string) {
    await this.connect()
    if (!this.client) throw new Error('RCON connection not established')
    return this.client.send(command)
  }

  async dispose() {
    if (!this.client) return
    await this.client.end()
    this.client = undefined
  }
}

