import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { env } from './config/env.js'
import { RATE_LIMIT } from './config/constants.js'
import { AppError } from './shared/errors/AppError.js'
import { ERR_VALIDATION } from './shared/errors/error-codes.js'
import type { FastifyInstance } from 'fastify'

// --- Route modules ---
import authRoutes from './modules/auth/auth.routes.js'
import auditRoutes from './modules/audit/audit.routes.js'
import tenantsRoutes from './modules/tenants/tenants.routes.js'
import usersRoutes from './modules/users/users.routes.js'
import zabbixInstancesRoutes from './modules/zabbix-instances/zabbix-instances.routes.js'
import provisioningRoutes from './modules/provisioning/provisioning.routes.js'
import templateBuilderRoutes from './modules/template-builder/template-builder.routes.js'
import lifecycleRoutes from './modules/lifecycle/lifecycle.routes.js'
import alertingRoutes from './modules/alerting/alerting.routes.js'
import maintenanceRoutes from './modules/maintenance/maintenance.routes.js'

/**
 * Creates and configures the Fastify application.
 * Returns the configured instance without starting the server.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      ...(env.NODE_ENV === 'development' && {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
    },
    trustProxy: true,
  })

  // --- Security headers ---
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Managed by Nginx in production
  })

  // --- CORS ---
  await fastify.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  // --- Rate limiting ---
  await fastify.register(rateLimit, {
    max: RATE_LIMIT.API.max,
    timeWindow: RATE_LIMIT.API.timeWindow,
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'GEN_003',
        message: `Rate limit exceeded — retry after ${String(context.after)}`,
      },
    }),
  })

  // --- JWT ---
  await fastify.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    },
  })

  // --- Global error handler ---
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON())
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: ERR_VALIDATION,
          message: 'Validation failed',
          details: error.validation,
        },
      })
    }

    fastify.log.error(error)
    return reply.status(500).send({
      error: {
        code: 'GEN_002',
        message: 'Internal server error',
      },
    })
  })

  // --- Health check ---
  fastify.get(
    '/api/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      }
    },
  )

  // --- Register route modules (Phases 1-3) ---
  await fastify.register(authRoutes)
  await fastify.register(auditRoutes)
  await fastify.register(tenantsRoutes)
  await fastify.register(usersRoutes)
  await fastify.register(zabbixInstancesRoutes)
  await fastify.register(provisioningRoutes)
  await fastify.register(templateBuilderRoutes)
  await fastify.register(lifecycleRoutes)
  await fastify.register(alertingRoutes)
  await fastify.register(maintenanceRoutes)

  return fastify
}
