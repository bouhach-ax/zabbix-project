import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'
import { CreateInstanceBodySchema, UpdateInstanceBodySchema } from './zabbix-instances.schema.js'
import {
  createInstance,
  findAll,
  findById,
  updateInstance,
  deleteInstance,
  testConnectivity,
} from './zabbix-instances.service.js'
import type { JwtPayload } from '../../types/fastify.js'

/**
 * Zabbix Instances routes — scoped under /api/tenants/:tenantId/zabbix-instances.
 *
 * POST   /api/tenants/:tenantId/zabbix-instances
 * GET    /api/tenants/:tenantId/zabbix-instances
 * GET    /api/tenants/:tenantId/zabbix-instances/:instanceId
 * PATCH  /api/tenants/:tenantId/zabbix-instances/:instanceId
 * DELETE /api/tenants/:tenantId/zabbix-instances/:instanceId
 * POST   /api/tenants/:tenantId/zabbix-instances/:instanceId/test-connectivity
 */
export default async function zabbixInstancesRoutes(fastify: FastifyInstance): Promise<void> {
  // POST — create instance
  fastify.post(
    '/api/tenants/:tenantId/zabbix-instances',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId } = request.params as { tenantId: string }
      const parsed = CreateInstanceBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const instance = await createInstance(tenantId, parsed.data, actor.sub, request.ip)
      return reply.status(201).send(instance)
    },
  )

  // GET — list instances
  fastify.get(
    '/api/tenants/:tenantId/zabbix-instances',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:read')] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const instances = await findAll(tenantId)
      return reply.send(instances)
    },
  )

  // GET — single instance
  fastify.get(
    '/api/tenants/:tenantId/zabbix-instances/:instanceId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const instance = await findById(tenantId, instanceId)
      return reply.send(instance)
    },
  )

  // PATCH — update instance
  fastify.patch(
    '/api/tenants/:tenantId/zabbix-instances/:instanceId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const parsed = UpdateInstanceBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const instance = await updateInstance(
        tenantId,
        instanceId,
        parsed.data,
        actor.sub,
        request.ip,
      )
      return reply.send(instance)
    },
  )

  // DELETE — soft delete (deactivate)
  fastify.delete(
    '/api/tenants/:tenantId/zabbix-instances/:instanceId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const instance = await deleteInstance(tenantId, instanceId, actor.sub, request.ip)
      return reply.send(instance)
    },
  )

  // POST — test connectivity
  fastify.post(
    '/api/tenants/:tenantId/zabbix-instances/:instanceId/test-connectivity',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('hosts:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const result = await testConnectivity(tenantId, instanceId)
      return reply.send(result)
    },
  )
}
