import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { ApiToken, AuthorizationContext, RequestContext, Scope } from './types'

export function generateRequestId() {
  return uuidv4()
}

export function now() {
  return Date.now()
}

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateToken(prefix: string = 'pat_') {
  const raw = `${prefix}${crypto.randomBytes(24).toString('base64url')}`
  return { raw, hash: hashToken(raw) }
}

export function ensureScope(auth: AuthorizationContext | undefined, scope: Scope) {
  if (!auth) throw new Error('unauthorized')
  if (!auth.scopes.has(scope)) throw new Error('forbidden')
}

export function ensureServerAccess(auth: AuthorizationContext | undefined, serverId: number) {
  if (!auth) throw new Error('unauthorized')
  if (auth.serverFilter && !auth.serverFilter.has(serverId)) throw new Error('forbidden')
}

export function tokenExpired(token: ApiToken) {
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return true
  return false
}

export function createRequestContext(
  auth?: AuthorizationContext,
  ip?: string,
  ua?: string,
  requestId?: string,
): RequestContext {
  return {
    authorization: auth,
    requestId: requestId ?? generateRequestId(),
    ip,
    userAgent: ua,
  }
}

export async function parseJsonBody<T>(stream: NodeJS.ReadableStream): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {} as T
  return JSON.parse(raw)
}

export function serializeSseEvent(event: string, payload: any) {
  return `event: ${event}\n` + `data: ${JSON.stringify(payload)}\n\n`
}

export function redactSensitive(meta: any) {
  if (!meta) return meta
  const clone = JSON.parse(JSON.stringify(meta))
  if (clone.params) {
    for (const key of Object.keys(clone.params)) {
      if (key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')) {
        clone.params[key] = '[REDACTED]'
      }
    }
  }
  return clone
}

export function ensureWhitelist(command: string, whitelist: string[]) {
  const normalized = command.trim().toLowerCase()
  return whitelist.some((entry) => normalized.startsWith(entry.toLowerCase()))
}

export function safeJson(data: any) {
  return JSON.parse(JSON.stringify(data))
}

