import type { FastifyRequest, FastifyReply } from 'fastify'
import { logAction } from './audit.service.js'

/**
 * Factory that creates a Fastify onSend hook that auto-logs mutations.
 * @param action - Audit action name e.g. 'HOST_CREATED'
 * @param entityType - Entity type e.g. 'ManagedHost'
 * @param getEntityId - Function to extract entity ID from request
 */
export function createAuditHook(
  action: string,
  entityType: string,
  getEntityId: (request: FastifyRequest) => string,
) {
  return async function auditHook(
    request: FastifyRequest,
    _reply: FastifyReply,
    payload: unknown,
  ): Promise<unknown> {
    const user = request.user
    if (user) {
      await logAction({
        tenantId: user.tenantId,
        userId: user.sub,
        action,
        entityType,
        entityId: getEntityId(request),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? undefined,
      })
    }
    return payload
  }
}
