import { Context } from 'koishi'
import { AuditLogInput, RequestContext } from './types'
import { redactSensitive } from './utils'

export class AuditService {
  constructor(private ctx: Context) {}

  async log(entry: AuditLogInput, request?: RequestContext) {
    await this.ctx.database.create('audit_logs', {
      ...entry,
      ts: entry.ts ?? new Date(),
      meta: redactSensitive(entry.meta),
      ip: entry.ip ?? request?.ip ?? null,
      ua: entry.ua ?? request?.userAgent ?? null,
      requestId: entry.requestId ?? request?.requestId ?? null,
    })
  }
}

