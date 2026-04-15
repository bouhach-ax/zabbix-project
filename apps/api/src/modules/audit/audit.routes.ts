import type { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/database/prisma.js'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { PAGINATION } from '../../config/constants.js'

/**
 * Audit log routes.
 * GET /api/tenants/:tenantId/audit — paginated, filterable audit log
 */
export default async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: { tenantId: string }
    Querystring: {
      page?: number
      limit?: number
      entityType?: string
      entityId?: string
      userId?: string
    }
  }>(
    '/api/tenants/:tenantId/audit',
    {
      preHandler: [authMiddleware, tenantMiddleware, requirePermission('audit:read')],
    },
    async (request, reply) => {
      const { tenantId } = request.params
      const {
        page = 1,
        limit = PAGINATION.DEFAULT_LIMIT,
        entityType,
        entityId,
        userId,
      } = request.query

      const take = Math.min(limit, PAGINATION.MAX_LIMIT)
      const skip = (page - 1) * take

      const where = {
        tenantId,
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
        ...(userId ? { userId } : {}),
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip,
          take,
          include: {
            user: {
              select: { id: true, email: true, firstName: true, lastName: true },
            },
          },
        }),
        prisma.auditLog.count({ where }),
      ])

      return reply.send({
        data: logs,
        meta: { total, page, limit: take, pages: Math.ceil(total / take) },
      })
    },
  )
}
