import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authMiddleware } from '../../shared/middlewares/auth.middleware.js'
import { tenantMiddleware } from '../../shared/middlewares/tenant.middleware.js'
import { requirePermission } from '../../shared/middlewares/rbac.middleware.js'
import { CreateTemplateBody, UpdateTemplateBody, TestCommandBody } from './template-builder.schema.js'
import * as service from './template-builder.service.js'
import { testCommand } from './command-tester.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { prisma } from '../../shared/database/prisma.js'
import { decrypt } from '../../shared/crypto/encryption.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
} from '../../shared/errors/error-codes.js'

/** Route params for tenant + instance scoped endpoints. */
interface InstanceParams {
  tenantId: string
  instanceId: string
}

/** Route params for a specific template. */
interface TemplateParams extends InstanceParams {
  templateId: string
}

/** Query params for list endpoint. */
interface ListQuery {
  page?: string
  limit?: string
}

/**
 * Template Builder routes.
 * All routes are scoped to /api/tenants/:tenantId/instances/:instanceId/templates
 */
export default async function templateBuilderRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const readHooks = [authMiddleware, tenantMiddleware, requirePermission('templates:read')]
  const writeHooks = [authMiddleware, tenantMiddleware, requirePermission('templates:write')]

  /**
   * POST /api/tenants/:tenantId/instances/:instanceId/templates
   * Creates a new managed template.
   */
  fastify.post<{
    Params: InstanceParams
    Body: unknown
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/templates',
    { preHandler: writeHooks },
    async (request: FastifyRequest<{ Params: InstanceParams; Body: unknown }>, reply: FastifyReply) => {
      const { tenantId, instanceId } = request.params
      const body = CreateTemplateBody.parse(request.body)
      const userId = request.user.sub
      const ipAddress = request.ip

      const template = await service.createTemplate(
        tenantId,
        instanceId,
        body,
        userId,
        ipAddress,
      )

      return reply.status(201).send({ data: template })
    },
  )

  /**
   * GET /api/tenants/:tenantId/instances/:instanceId/templates
   * Lists managed templates with pagination.
   */
  fastify.get<{
    Params: InstanceParams
    Querystring: ListQuery
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/templates',
    { preHandler: readHooks },
    async (request: FastifyRequest<{ Params: InstanceParams; Querystring: ListQuery }>, reply: FastifyReply) => {
      const { tenantId, instanceId } = request.params
      const page = Number(request.query.page ?? '1') || 1
      const limit = Number(request.query.limit ?? '20') || 20

      const result = await service.listTemplates(tenantId, instanceId, page, limit)
      return reply.send(result)
    },
  )

  /**
   * GET /api/tenants/:tenantId/instances/:instanceId/templates/:templateId
   * Gets a single managed template.
   */
  fastify.get<{
    Params: TemplateParams
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/templates/:templateId',
    { preHandler: readHooks },
    async (request: FastifyRequest<{ Params: TemplateParams }>, reply: FastifyReply) => {
      const { tenantId, instanceId, templateId } = request.params
      const template = await service.getTemplate(tenantId, instanceId, templateId)
      return reply.send({ data: template })
    },
  )

  /**
   * PATCH /api/tenants/:tenantId/instances/:instanceId/templates/:templateId
   * Updates an existing managed template.
   */
  fastify.patch<{
    Params: TemplateParams
    Body: unknown
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/templates/:templateId',
    { preHandler: writeHooks },
    async (request: FastifyRequest<{ Params: TemplateParams; Body: unknown }>, reply: FastifyReply) => {
      const { tenantId, templateId } = request.params
      const body = UpdateTemplateBody.parse(request.body)
      const userId = request.user.sub
      const ipAddress = request.ip

      const updated = await service.updateTemplate(
        tenantId,
        templateId,
        body,
        userId,
        ipAddress,
      )

      return reply.send({ data: updated })
    },
  )

  /**
   * POST /api/tenants/:tenantId/instances/:instanceId/templates/:templateId/deploy
   * Deploys a managed template to the Zabbix instance.
   */
  fastify.post<{
    Params: TemplateParams
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/templates/:templateId/deploy',
    { preHandler: writeHooks },
    async (request: FastifyRequest<{ Params: TemplateParams }>, reply: FastifyReply) => {
      const { tenantId, templateId } = request.params
      const userId = request.user.sub
      const ipAddress = request.ip

      const deployed = await service.deployTemplate(tenantId, templateId, userId, ipAddress)
      return reply.send({ data: deployed })
    },
  )

  /**
   * POST /api/tenants/:tenantId/instances/:instanceId/test-command
   * Tests a system.run command on a Zabbix host via the agent.
   */
  fastify.post<{
    Params: InstanceParams
    Body: unknown
  }>(
    '/api/tenants/:tenantId/instances/:instanceId/test-command',
    { preHandler: writeHooks },
    async (request: FastifyRequest<{ Params: InstanceParams; Body: unknown }>, reply: FastifyReply) => {
      const { tenantId, instanceId } = request.params
      const { hostId, command } = TestCommandBody.parse(request.body)

      // Build ZabbixApiService for this instance
      const instance = await prisma.zabbixInstance.findFirst({
        where: { id: instanceId, tenantId },
      })

      if (!instance) {
        throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
      }

      let apiToken: string
      try {
        apiToken = decrypt(instance.apiTokenEncrypted)
      } catch {
        throw new AppError(
          ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
          500,
          'Failed to decrypt Zabbix API token',
        )
      }

      const zabbixService = new ZabbixApiService(
        instance.apiUrl,
        apiToken,
        instance.id,
        instance.version ?? undefined,
      )

      const result = await testCommand(zabbixService, hostId, command)
      return reply.send({ data: result })
    },
  )
}
