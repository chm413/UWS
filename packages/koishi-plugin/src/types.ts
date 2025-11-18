import { Schema } from 'koishi'

export type ServerStyle = 'Java' | 'Bedrock'
export type ReportMode = 'proactive' | 'passive' | 'mixed'

export interface MinecraftServer {
  id: number
  name: string
  host: string
  port: number
  token: string
  groupIds?: string
  motdText?: string
  maxPlayers?: number
  statusInterval?: number
  lastStatus?: any
  style?: ServerStyle
  core?: string
  version?: string
  features?: string[]
  reportMode?: ReportMode
  lastCapsAt?: Date
}

export type SubjectType = 'user' | 'group' | 'role'

export interface ServerAcl {
  id: number
  serverId: number
  subjectType: SubjectType
  subjectId: string
  scopes: string[]
  createdAt: Date
  updatedAt: Date
}

export interface ApiToken {
  id: number
  name: string
  tokenHash: string
  userId: string | null
  serverIds: number[] | null
  scopes: string[]
  expiresAt: Date | null
  ipBound: string[] | null
  revoked: boolean
  createdAt: Date
  createdBy: string
}

export interface AuditLog {
  id: number
  ts: Date
  actorType: 'user' | 'token' | 'bot'
  actorId: string
  action: string
  resource: string
  serverId: number | null
  requestId: string | null
  success: boolean
  meta: any
  ip: string | null
  ua: string | null
}

export type AuditLogInput =
  Omit<AuditLog, 'id' | 'ts' | 'requestId' | 'ip' | 'ua'> &
  Partial<Pick<AuditLog, 'ts' | 'requestId' | 'ip' | 'ua'>>

export interface Config {
  adminPort: number
  tokenPrefix: string
  commandWhitelist: string[]
  sseHeartbeatSec: number
  reconnectMinSec: number
  reconnectMaxSec: number
  readonlyConcurrency: number
  requestTimeoutMs: number
}

export const Config: Schema<Config> = Schema.object({
  adminPort: Schema.number().default(6251).description('Port for management API.'),
  tokenPrefix: Schema.string().default('pat_').description('Prefix for issued API tokens.'),
  commandWhitelist: Schema.array(Schema.string()).default([
    'list',
    'say',
    'kick',
    'ban',
    'pardon',
    'whitelist',
    'time',
    'weather',
  ]),
  sseHeartbeatSec: Schema.number().default(25),
  reconnectMinSec: Schema.number().default(10),
  reconnectMaxSec: Schema.number().default(300),
  readonlyConcurrency: Schema.number().default(4),
  requestTimeoutMs: Schema.number().default(5000),
})

export interface BridgeCommandEnvelope<T = any> {
  schema: string
  cmd: string
  mode: 'request' | 'response' | 'push'
  requestId?: string
  timestamp?: number
  status?: 'success' | 'fail' | 'error' | 'unauthorized' | 'unsupported'
  msg?: string
  data?: T
}

export interface LiveStatus {
  tps?: number
  players?: number
  cpu?: number
  mem?: number
  [key: string]: any
}

export interface PlayerInfo {
  name: string
  uuid?: string
  ip?: string
  platform?: string
  auth?: string
  ping?: number
  op?: boolean
  permissionGroup?: string
  gamemode?: string
  firstJoin?: number
  lastSeen?: number
}

export interface ActionRequest {
  action: string
  params?: Record<string, any>
}

export interface ConsoleRequest {
  command: string
}

export interface IssuedTokenResult {
  token: string
  record: ApiToken
}

export type Scope =
  | 'servers:read'
  | 'servers:write'
  | 'servers:control'
  | 'servers:console'
  | 'players:read'
  | 'players:kick'
  | 'players:whitelist'
  | 'players:blacklist'
  | 'world:read'
  | 'world:write'
  | 'metrics:read'
  | 'logs:read'
  | 'tokens:issue'
  | 'tokens:revoke'
  | 'acl:write'
  | 'audit:read'

export interface AuthorizationContext {
  token: ApiToken
  scopes: Set<Scope>
  serverFilter?: Set<number>
}

export interface RequestContext {
  authorization?: AuthorizationContext
  requestId: string
  ip?: string
  userAgent?: string
}

export interface PlayerPage {
  count: number
  players: PlayerInfo[]
  cursor?: string
  hasMore?: boolean
}

declare module 'koishi' {
  interface Tables {
    minecraft_servers: MinecraftServer
    server_acl: ServerAcl
    api_tokens: ApiToken
    audit_logs: AuditLog
  }
}

