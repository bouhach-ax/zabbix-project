import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { login, refresh, logout } from './auth.service.js'
import { LoginBodySchema, RefreshBodySchema, LogoutBodySchema } from './auth.schema.js'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'
import { prisma } from '../../shared/database/prisma.js'
import { RATE_LIMIT } from '../../config/constants.js'

/**
 * Auth routes.
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * GET  /api/auth/me
 */
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/auth/login
  fastify.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: RATE_LIMIT.AUTH.max, timeWindow: RATE_LIMIT.AUTH.timeWindow } },
    },
    async (request, reply) => {
      const parsed = LoginBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      const { email, password, tenantId } = parsed.data
      const result = await login(email, password, request.ip, tenantId)
      return reply.status(200).send(result)
    },
  )

  // POST /api/auth/refresh
  fastify.post('/api/auth/refresh', async (request, reply) => {
    const parsed = RefreshBodySchema.safeParse(request.body)
    if (!parsed.success) {
      throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
    }
    const result = await refresh(parsed.data.refreshToken, request.ip)
    return reply.status(200).send(result)
  })

  // POST /api/auth/logout
  fastify.post(
    '/api/auth/logout',
    { preHandler: [authMiddleware] },
    async (request, reply) => {
      const parsed = LogoutBodySchema.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.errors)
      }
      await logout(
        parsed.data.refreshToken,
        request.user.sub,
        request.user.tenantId,
        request.ip,
      )
      return reply.status(204).send()
    },
  )

  // GET /api/auth/me
  fastify.get(
    '/api/auth/me',
    { preHandler: [authMiddleware, tenantMiddleware] },
    async (request, reply) => {
      const user = await prisma.user.findFirst({
        where: { id: request.user.sub, tenantId: request.user.tenantId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          tenantId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
      })
      if (!user) {
        throw new AppError('USR_001', 404, 'User not found')
      }
      return reply.send(user)
    },
  )
}

// Suppress unused import warning for z
const _z = z

