import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION, ERR_AUTH_INSUFFICIENT_PERMISSIONS } from '../../shared/errors/error-codes.js'
import { CreateTenantBodySchema, UpdateTenantBodySchema } from './tenants.schema.js'
import {
  createTenant,
  findAll,
  findById,
  updateTenant,
  deactivateTenant,
} from './tenants.service.js'
import type { JwtPayload } from '../../types/fastify.js'

/**
 * Tenants routes.
 * POST   /api/tenants          — ADMIN only
 * GET    /api/tenants          — ADMIN only
 * GET    /api/tenants/:id      — ADMIN or own tenant
 * PATCH  /api/tenants/:id      — ADMIN only
 * DELETE /api/tenants/:id      — ADMIN only (deactivate)
 */
export default async function tenantsRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/tenants — create a new tenant
  fastify.post(
    '/api/tenants',
    { preHandler: [authMiddleware, requirePermission('tenants:write')] },
    async (request, reply) => {
      const user = request.user as unknown as JwtPayload
      const parsed = CreateTenantBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const tenant = await createTenant(parsed.data, user.sub, request.ip)
      return reply.status(201).send(tenant)
    },
  )

  // GET /api/tenants — list all tenants
  fastify.get(
    '/api/tenants',
    { preHandler: [authMiddleware, requirePermission('tenants:read')] },
    async (_request, reply) => {
      const tenants = await findAll()
      return reply.send(tenants)
    },
  )

  // GET /api/tenants/:id — get single tenant
  fastify.get(
    '/api/tenants/:id',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const user = request.user as unknown as JwtPayload
      const { id } = request.params as { id: string }
      // ADMIN can view any tenant; non-ADMIN can only view their own
      if (user.role !== 'ADMIN' && user.tenantId !== id) {
        throw new AppError(
          ERR_AUTH_INSUFFICIENT_PERMISSIONS,
          403,
          'You can only view your own tenant',
        )
      }
      const tenant = await findById(id)
      return reply.send(tenant)
    },
  )

  // PATCH /api/tenants/:id — update a tenant
  fastify.patch(
    '/api/tenants/:id',
    { preHandler: [authMiddleware, requirePermission('tenants:write')] },
    async (request, reply) => {
      const user = request.user as unknown as JwtPayload
      const { id } = request.params as { id: string }
      const parsed = UpdateTenantBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const tenant = await updateTenant(id, parsed.data, user.sub, request.ip)
      return reply.send(tenant)
    },
  )

  // DELETE /api/tenants/:id — deactivate (soft delete)
  fastify.delete(
    '/api/tenants/:id',
    { preHandler: [authMiddleware, requirePermission('tenants:write')] },
    async (request, reply) => {
      const user = request.user as unknown as JwtPayload
      const { id } = request.params as { id: string }
      const tenant = await deactivateTenant(id, user.sub, request.ip)
      return reply.send(tenant)
    },
  )
}
