import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'
import { CreateUserBodySchema, UpdateUserBodySchema } from './users.schema.js'
import {
  createUser,
  findAll,
  findById,
  updateUser,
  deactivateUser,
} from './users.service.js'
import type { JwtPayload } from '../../types/fastify.js'

/**
 * Users routes — scoped under /api/tenants/:tenantId/users.
 * All routes require auth + tenant middleware.
 * Write operations require 'users:write' permission (effectively ADMIN-only via wildcard).
 *
 * POST   /api/tenants/:tenantId/users
 * GET    /api/tenants/:tenantId/users
 * GET    /api/tenants/:tenantId/users/:userId
 * PATCH  /api/tenants/:tenantId/users/:userId
 * DELETE /api/tenants/:tenantId/users/:userId
 */
export default async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  // POST — create user
  fastify.post(
    '/api/tenants/:tenantId/users',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('users:write')] },
    async (request, reply) => {
      const user = request.user as unknown as JwtPayload
      const { tenantId } = request.params as { tenantId: string }
      const parsed = CreateUserBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const created = await createUser(tenantId, parsed.data, user.sub, request.ip)
      return reply.status(201).send(created)
    },
  )

  // GET — list users for tenant
  fastify.get(
    '/api/tenants/:tenantId/users',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('users:read')] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const users = await findAll(tenantId)
      return reply.send(users)
    },
  )

  // GET — single user
  fastify.get(
    '/api/tenants/:tenantId/users/:userId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('users:read')] },
    async (request, reply) => {
      const { tenantId, userId } = request.params as { tenantId: string; userId: string }
      const found = await findById(tenantId, userId)
      return reply.send(found)
    },
  )

  // PATCH — update user
  fastify.patch(
    '/api/tenants/:tenantId/users/:userId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('users:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, userId } = request.params as { tenantId: string; userId: string }
      const parsed = UpdateUserBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const updated = await updateUser(tenantId, userId, parsed.data, actor.sub, request.ip)
      return reply.send(updated)
    },
  )

  // DELETE — deactivate user (soft delete)
  fastify.delete(
    '/api/tenants/:tenantId/users/:userId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('users:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, userId } = request.params as { tenantId: string; userId: string }
      const deactivated = await deactivateUser(tenantId, userId, actor.sub, request.ip)
      return reply.send(deactivated)
    },
  )
}
