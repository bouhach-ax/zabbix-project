import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import {
  CreateHostBody,
  UpdateHostBody,
  StartProvisioningBody,
  TransitionStatusBody,
  ListHostsQuery,
} from './provisioning.schema.js'
import {
  createHost,
  listHosts,
  getHost,
  updateHost,
  transitionStatus,
  startProvisioning,
  getJobStatus,
  cancelJob,
  getScript,
} from './provisioning.service.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_VALIDATION } from '../../shared/errors/error-codes.js'

/** Route params for tenant-scoped endpoints. */
interface TenantParams {
  tenantId: string
}

/** Route params for host-specific endpoints. */
interface HostParams extends TenantParams {
  hostId: string
}

/**
 * Provisioning module routes.
 * Handles host CRUD, provisioning job management, and script retrieval.
 */
export default async function provisioningRoutes(fastify: FastifyInstance): Promise<void> {
  const readPreHandler = [authMiddleware, tenantMiddleware, requirePermission('hosts:read')]
  const writePreHandler = [authMiddleware, tenantMiddleware, requirePermission('hosts:write')]
  const provReadPreHandler = [authMiddleware, tenantMiddleware, requirePermission('provisioning:read')]
  const provWritePreHandler = [authMiddleware, tenantMiddleware, requirePermission('provisioning:write')]

  // ──────────────────────────────────────────
  // Host CRUD
  // ──────────────────────────────────────────

  /**
   * POST /api/tenants/:tenantId/hosts — Create a new managed host
   */
  fastify.post<{ Params: TenantParams }>(
    '/api/tenants/:tenantId/hosts',
    { preHandler: writePreHandler },
    async (request: FastifyRequest<{ Params: TenantParams }>, reply: FastifyReply) => {
      const parsed = CreateHostBody.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.flatten())
      }

      const { tenantId } = request.params
      const host = await createHost(tenantId, parsed.data, request.user.sub, request.ip)
      return reply.status(201).send(host)
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts — List hosts with filters and pagination
   */
  fastify.get<{ Params: TenantParams }>(
    '/api/tenants/:tenantId/hosts',
    { preHandler: readPreHandler },
    async (request: FastifyRequest<{ Params: TenantParams }>, reply: FastifyReply) => {
      const parsed = ListHostsQuery.safeParse(request.query)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.flatten())
      }

      const { tenantId } = request.params
      const result = await listHosts(tenantId, parsed.data)
      return reply.send(result)
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts/:hostId — Get a single host with details
   */
  fastify.get<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId',
    { preHandler: readPreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params
      const host = await getHost(tenantId, hostId)
      return reply.send(host)
    },
  )

  /**
   * PATCH /api/tenants/:tenantId/hosts/:hostId — Update host properties
   */
  fastify.patch<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId',
    { preHandler: writePreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const parsed = UpdateHostBody.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.flatten())
      }

      const { tenantId, hostId } = request.params
      const host = await updateHost(tenantId, hostId, parsed.data, request.user.sub, request.ip)
      return reply.send(host)
    },
  )

  /**
   * POST /api/tenants/:tenantId/hosts/:hostId/status — Transition host status
   */
  fastify.post<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId/status',
    { preHandler: writePreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const parsed = TransitionStatusBody.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.flatten())
      }

      const { tenantId, hostId } = request.params
      const host = await transitionStatus(
        tenantId,
        hostId,
        parsed.data.status,
        request.user.sub,
        request.ip,
        parsed.data.comment,
      )
      return reply.send(host)
    },
  )

  // ──────────────────────────────────────────
  // Provisioning Jobs
  // ──────────────────────────────────────────

  /**
   * POST /api/tenants/:tenantId/hosts/:hostId/provision — Start provisioning
   */
  fastify.post<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId/provision',
    { preHandler: provWritePreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const parsed = StartProvisioningBody.safeParse(request.body)
      if (!parsed.success) {
        throw new AppError(ERR_VALIDATION, 400, 'Validation failed', parsed.error.flatten())
      }

      const { tenantId, hostId } = request.params
      const job = await startProvisioning(
        tenantId,
        hostId,
        parsed.data,
        request.user.sub,
        request.ip,
      )
      return reply.status(202).send(job)
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts/:hostId/provision — Get job status
   */
  fastify.get<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId/provision',
    { preHandler: provReadPreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params
      const job = await getJobStatus(tenantId, hostId)
      return reply.send(job)
    },
  )

  /**
   * DELETE /api/tenants/:tenantId/hosts/:hostId/provision — Cancel a running job
   */
  fastify.delete<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId/provision',
    { preHandler: provWritePreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params
      const job = await cancelJob(tenantId, hostId, request.user.sub, request.ip)
      return reply.send(job)
    },
  )

  /**
   * GET /api/tenants/:tenantId/hosts/:hostId/script — Download generated script
   * Returns plain text for direct download/execution.
   */
  fastify.get<{ Params: HostParams }>(
    '/api/tenants/:tenantId/hosts/:hostId/script',
    { preHandler: provReadPreHandler },
    async (request: FastifyRequest<{ Params: HostParams }>, reply: FastifyReply) => {
      const { tenantId, hostId } = request.params
      const script = await getScript(tenantId, hostId)
      return reply.type('text/plain').send(script)
    },
  )
}
