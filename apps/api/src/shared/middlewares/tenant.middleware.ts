import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../database/prisma.js'
import { AppError } from '../errors/AppError.js'
import { ERR_TENANT_INACTIVE, ERR_TENANT_NOT_FOUND } from '../errors/error-codes.js'

/**
 * Fastify preHandler — validates tenant from JWT payload and attaches to request.
 * Must run after authMiddleware.
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const jwtPayload = request.user as { tenantId?: string }
  const tenantId = jwtPayload?.tenantId

  if (!tenantId) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 401, 'No tenant in token')
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, isActive: true, slug: true, plan: true },
  })

  if (!tenant) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 404, 'Tenant not found')
  }

  if (!tenant.isActive) {
    throw new AppError(ERR_TENANT_INACTIVE, 403, 'Tenant account is disabled')
  }

  // Attach tenant info to request for downstream handlers
  ;(request as FastifyRequest & { tenant: typeof tenant }).tenant = tenant
}
