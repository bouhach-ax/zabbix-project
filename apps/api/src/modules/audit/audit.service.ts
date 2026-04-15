import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'

export interface LogActionParams {
  tenantId: string
  userId: string
  action: string
  entityType: string
  entityId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  comment?: string
  ipAddress: string
  userAgent?: string | undefined
}

/**
 * Writes an audit log entry to the database.
 * Static service — import and call directly.
 * Never throws — errors are logged and swallowed to avoid disrupting the main flow.
 */
export async function logAction(params: LogActionParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before !== null && params.before !== undefined
          ? (params.before as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        after: params.after !== null && params.after !== undefined
          ? (params.after as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        comment: params.comment ?? null,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent ?? null,
      },
    })
  } catch (err) {
    // Audit failures must not break the main request
    console.error('[AuditService] Failed to write audit log:', err)
  }
}
