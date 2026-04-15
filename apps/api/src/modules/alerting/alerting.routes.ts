import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'
import type { JwtPayload } from '../../types/fastify.js'
import {
  getCorrelatedAlerts,
  acknowledgeAlert,
  suppressAlert,
  getAlertHistory,
  getNoisyTriggers,
  createCorrelationRule,
  listCorrelationRules,
  updateCorrelationRule,
  deleteCorrelationRule,
} from './alerting.service.js'
import type { RuleType } from '@prisma/client'

/**
 * Alerting routes — correlated alerts, acknowledgment, suppression,
 * alert history, noisy triggers, and correlation rule CRUD.
 *
 * GET    /api/tenants/:tenantId/instances/:instanceId/alerts
 * POST   /api/tenants/:tenantId/instances/:instanceId/alerts/:triggerId/acknowledge
 * POST   /api/tenants/:tenantId/instances/:instanceId/alerts/:triggerId/suppress
 * GET    /api/tenants/:tenantId/instances/:instanceId/alert-history
 * GET    /api/tenants/:tenantId/instances/:instanceId/noisy-triggers
 * POST   /api/tenants/:tenantId/correlation-rules
 * GET    /api/tenants/:tenantId/correlation-rules
 * PATCH  /api/tenants/:tenantId/correlation-rules/:ruleId
 * DELETE /api/tenants/:tenantId/correlation-rules/:ruleId
 */
export default async function alertingRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET — correlated alerts
  // -------------------------------------------------------------------------
  fastify.get(
    '/api/tenants/:tenantId/instances/:instanceId/alerts',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const incidents = await getCorrelatedAlerts(tenantId, instanceId)
      return reply.send(incidents)
    },
  )

  // -------------------------------------------------------------------------
  // POST — acknowledge alert
  // -------------------------------------------------------------------------
  fastify.post(
    '/api/tenants/:tenantId/instances/:instanceId/alerts/:triggerId/acknowledge',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId, triggerId } = request.params as {
        tenantId: string
        instanceId: string
        triggerId: string
      }
      const body = request.body as { message?: string }
      if (!body?.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "message" is required and must be a non-empty string')
      }

      await acknowledgeAlert(tenantId, instanceId, triggerId, actor.sub, body.message.trim(), request.ip)
      return reply.status(200).send({ success: true })
    },
  )

  // -------------------------------------------------------------------------
  // POST — suppress alert (temporary maintenance)
  // -------------------------------------------------------------------------
  fastify.post(
    '/api/tenants/:tenantId/instances/:instanceId/alerts/:triggerId/suppress',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, instanceId, triggerId } = request.params as {
        tenantId: string
        instanceId: string
        triggerId: string
      }
      const body = request.body as { durationMinutes?: number }
      if (
        body?.durationMinutes === undefined ||
        typeof body.durationMinutes !== 'number' ||
        body.durationMinutes <= 0
      ) {
        throw new AppError(
          ERR_VALIDATION,
          400,
          'Field "durationMinutes" is required and must be a positive number',
        )
      }

      const maintenanceId = await suppressAlert(
        tenantId,
        instanceId,
        triggerId,
        actor.sub,
        body.durationMinutes,
        request.ip,
      )
      return reply.status(201).send({ maintenanceId })
    },
  )

  // -------------------------------------------------------------------------
  // GET — alert history
  // -------------------------------------------------------------------------
  fastify.get(
    '/api/tenants/:tenantId/instances/:instanceId/alert-history',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const query = request.query as { limit?: string; hostId?: string; severity?: string }
      const events = await getAlertHistory(tenantId, instanceId, {
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        hostId: query.hostId,
        severity: query.severity,
      })
      return reply.send(events)
    },
  )

  // -------------------------------------------------------------------------
  // GET — noisy triggers
  // -------------------------------------------------------------------------
  fastify.get(
    '/api/tenants/:tenantId/instances/:instanceId/noisy-triggers',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:read')] },
    async (request, reply) => {
      const { tenantId, instanceId } = request.params as {
        tenantId: string
        instanceId: string
      }
      const triggers = await getNoisyTriggers(tenantId, instanceId)
      return reply.send(triggers)
    },
  )

  // -------------------------------------------------------------------------
  // POST — create correlation rule
  // -------------------------------------------------------------------------
  fastify.post(
    '/api/tenants/:tenantId/correlation-rules',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId } = request.params as { tenantId: string }
      const body = request.body as {
        name?: string
        type?: RuleType
        conditions?: Record<string, unknown>
        timeWindow?: number
        priority?: number
        isActive?: boolean
      }

      if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "name" is required')
      }
      if (!body.type || !['TOPOLOGICAL', 'TEMPORAL', 'TAG_BASED', 'CUSTOM'].includes(body.type)) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "type" must be one of: TOPOLOGICAL, TEMPORAL, TAG_BASED, CUSTOM')
      }
      if (!body.conditions || typeof body.conditions !== 'object') {
        throw new AppError(ERR_VALIDATION, 400, 'Field "conditions" is required and must be an object')
      }

      const rule = await createCorrelationRule(
        tenantId,
        {
          name: body.name.trim(),
          type: body.type,
          conditions: body.conditions,
          timeWindow: body.timeWindow,
          priority: body.priority,
          isActive: body.isActive,
        },
        actor.sub,
        request.ip,
      )
      return reply.status(201).send(rule)
    },
  )

  // -------------------------------------------------------------------------
  // GET — list correlation rules
  // -------------------------------------------------------------------------
  fastify.get(
    '/api/tenants/:tenantId/correlation-rules',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:read')] },
    async (request, reply) => {
      const { tenantId } = request.params as { tenantId: string }
      const rules = await listCorrelationRules(tenantId)
      return reply.send(rules)
    },
  )

  // -------------------------------------------------------------------------
  // PATCH — update correlation rule
  // -------------------------------------------------------------------------
  fastify.patch(
    '/api/tenants/:tenantId/correlation-rules/:ruleId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, ruleId } = request.params as { tenantId: string; ruleId: string }
      const body = request.body as {
        name?: string
        type?: RuleType
        conditions?: Record<string, unknown>
        timeWindow?: number
        priority?: number
        isActive?: boolean
      }

      if (
        body?.type &&
        !['TOPOLOGICAL', 'TEMPORAL', 'TAG_BASED', 'CUSTOM'].includes(body.type)
      ) {
        throw new AppError(ERR_VALIDATION, 400, 'Field "type" must be one of: TOPOLOGICAL, TEMPORAL, TAG_BASED, CUSTOM')
      }

      const rule = await updateCorrelationRule(tenantId, ruleId, body ?? {}, actor.sub, request.ip)
      return reply.send(rule)
    },
  )

  // -------------------------------------------------------------------------
  // DELETE — delete correlation rule
  // -------------------------------------------------------------------------
  fastify.delete(
    '/api/tenants/:tenantId/correlation-rules/:ruleId',
    { preHandler: [authMiddleware, tenantMiddleware, requirePermission('alerts:write')] },
    async (request, reply) => {
      const actor = request.user as unknown as JwtPayload
      const { tenantId, ruleId } = request.params as { tenantId: string; ruleId: string }
      await deleteCorrelationRule(tenantId, ruleId, actor.sub, request.ip)
      return reply.status(204).send()
    },
  )
}
