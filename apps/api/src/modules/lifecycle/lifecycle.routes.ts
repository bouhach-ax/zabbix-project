import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import * as service from './lifecycle.service.js'

/** Route params for tenant-scoped endpoints. */
interface TenantParams {
  tenantId: string
}

/** Route params for host-specific endpoints. */
interface HostParams extends TenantParams {
  hostId: string
}

/**
 * Lifecycle management routes.
 * Handles host decommissioning and ghost host detection.
 */
export default async function lifecycleRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const readHooks = [authMiddleware, tenantMiddleware, requirePermission('hosts:read')]
  const writeHooks = [authMiddleware, tenantMiddleware, requirePermission('hosts:write')]

  /**
   * POST /api/tenants/:tenantId/hosts/:hostId/decommission
   * Decommissions a host: disables in Zabbix and sets status to DECOMMISSIONED.
   */
  fastify.post<{
    Params: HostParams
  }>(
    '/api/tenants/:tenantId/hosts/:hostId/decommission',
    { preHandler: writeHooks },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params
      const userId = request.user.sub
      const ipAddress = request.ip

      const host = await service.decommissionHost(tenantId, hostId, userId, ipAddress)
      return reply.send({ data: host })
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts/:hostId/decommission/preview
   * Returns a preview of what decommissioning a host will affect.
   */
  fastify.get<{
    Params: HostParams
  }>(
    '/api/tenants/:tenantId/hosts/:hostId/decommission/preview',
    { preHandler: readHooks },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params

      const preview = await service.getDecommissionPreview(tenantId, hostId)
      return reply.send({ data: preview })
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts/ghost
   * Detects ghost hosts: decommissioned hosts that still have a Zabbix host ID.
   */
  fastify.get<{
    Params: TenantParams
  }>(
    '/api/tenants/:tenantId/hosts/ghost',
    { preHandler: readHooks },
    async (request: FastifyRequest<{ Params: TenantParams }>, reply: FastifyReply) => {
      const { tenantId } = request.params

      const ghosts = await service.detectGhostHosts(tenantId)
      return reply.send({ data: ghosts })
    },
  )
}
