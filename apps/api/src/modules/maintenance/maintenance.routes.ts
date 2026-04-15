import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'
import type { JwtPayload } from '../../types/fastify.js'
import {
  createMaintenance,
  listMaintenances,
  updateMaintenance,
  deleteMaintenance,
} from './maintenance.service.js'

/**
 * Maintenance routes — CRUD for Zabbix maintenance periods.
 *
 * POST   /api/tenants/:tenantId/instances/:instanceId/maintenances
 * GET    /api/tenants/:tenantId/instances/:instanceId/maintenances
 * PATCH  /api/tenants/:tenantId/instances/:instanceId/maintenances/:maintenanceId
 * DELETE /api/tenants/:tenantId/instances/:instanceId/maintenances/:maintenanceId
 */
export default async function maintenanceRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST — create maintenance
  // -------------------------------------------------------------------------
  fastify.post(
    '/api/tenants/:tenantId/instances/:instanceId/maintenances',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('maintenance:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const body = request.body as {
        name?: string
        activeSince?: string | number
        activeTill?: string | number
        hostIds?: string[]
        description?: string
        maintenanceType?: number
      }

      if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "name" is required')
      }
      if (body.activeSince === undefined) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "activeSince" is required')
      }
      if (body.activeTill === undefined) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "activeTill" is required')
      }
      if (!Array.isArray(body.hostIds) || body.hostIds.length === 0) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "hostIds" must be a non-empty array')
      }
      if (
        body.maintenanceType !== undefined &&
        body.maintenanceType !== 0 &&
        body.maintenanceType !== 1
      ) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "maintenanceType" must be 0 or 1')
      }

      const result = await createMaintenance(
        tenantId,
        instanceId,
        {
          name: body.name.trim(),
          activeSince: body.activeSince,
          activeTill: body.activeTill,
          hostIds: body.hostIds,
          description: body.description,
          maintenanceType: (body.maintenanceType ?? 0) as 0 | 1,
        },
        actor.sub,
        request.ip,
      )
      return reply.status(201).send(result)
    },
  )

  // -------------------------------------------------------------------------
  // GET — list maintenances
  // -------------------------------------------------------------------------
  fastify.get(
    '/api/tenants/:tenantId/instances/:instanceId/maintenances',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('maintenance:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const maintenances = await listMaintenances(tenantId, instanceId)
      return reply.send(maintenances)
    },
  )

  // -------------------------------------------------------------------------
  // PATCH — update maintenance
  // -------------------------------------------------------------------------
  fastify.patch(
    '/api/tenants/:tenantId/instances/:instanceId/maintenances/:maintenanceId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('maintenance:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId, maintenanceId } = request.params as {
        tenantId: string
        instanceId: string
        maintenanceId: string
      }
      const body = request.body as {
        name?: string
        activeSince?: string | number
        activeTill?: string | number
        hostIds?: string[]
        description?: string
        maintenanceType?: number
      }

      if (
        body?.maintenanceType !== undefined &&
        body.maintenanceType !== 0 &&
        body.maintenanceType !== 1
      ) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "maintenanceType" must be 0 or 1')
      }

      await updateMaintenance(
        tenantId,
        instanceId,
        maintenanceId,
        {
          name: body?.name,
          activeSince: body?.activeSince,
          activeTill: body?.activeTill,
          hostIds: body?.hostIds,
          description: body?.description,
          maintenanceType: body?.maintenanceType as 0 | 1 | undefined,
        },
        actor.sub,
        request.ip,
      )
      return reply.status(200).send({ success: true })
    },
  )

  // -------------------------------------------------------------------------
  // DELETE — delete maintenance
  // -------------------------------------------------------------------------
  fastify.delete(
    '/api/tenants/:tenantId/instances/:instanceId/maintenances/:maintenanceId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('maintenance:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId, maintenanceId } = request.params as {
        tenantId: string
        instanceId: string
        maintenanceId: string
      }
      await deleteMaintenance(tenantId, instanceId, maintenanceId, actor.sub, request.ip)
      return reply.status(204).send()
    },
  )
}
