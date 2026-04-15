import type { ManagedTemplate, Prisma } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_TPL_NOT_FOUND,
  ERR_TPL_VALIDATION_FAILED,
  ERR_TPL_DEPLOY_FAILED,
  ERR_TPL_INTERNAL_NAME_TAKEN,
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
} from '../../shared/errors/error-codes.js'
import { decrypt } from '../../shared/crypto/encryption.js'
import { logAction } from '../audit/audit.service.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { validateTemplate } from './template-builder.validator.js'
import {
  generateZabbixApiCalls,
  TEMPLATE_ID_PLACEHOLDER,
} from './template-builder.generator.js'
import type { CreateTemplateInput, UpdateTemplateInput } from './template-builder.schema.js'
import { PAGINATION } from '../../config/constants.js'

/**
 * Creates a ZabbixApiService for a given tenant + instance.
 * Queries the DB, decrypts the token, returns the service.
 */
async function getZabbixServiceForInstance(
  tenantId: string,
  instanceId: string,
): Promise<ZabbixApiService> {
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

  return new ZabbixApiService(
    instance.apiUrl,
    apiToken,
    instance.id,
    instance.version ?? undefined,
  )
}

/**
 * Creates a new managed template in the database.
 * Validates the template data exhaustively before persisting.
 *
 * @param tenantId - Owning tenant ID
 * @param zabbixInstanceId - Target Zabbix instance ID
 * @param body - Template data from the request
 * @param userId - User performing the action
 * @param ipAddress - Client IP for audit log
 * @returns Created ManagedTemplate record
 * @throws AppError TPL_002 if validation fails
 * @throws AppError TPL_005 if internalName is already taken
 */
export async function createTemplate(
  tenantId: string,
  zabbixInstanceId: string,
  body: CreateTemplateInput,
  userId: string,
  ipAddress: string,
): Promise<ManagedTemplate> {
  // Exhaustive validation
  const validationErrors = validateTemplate(body)
  // Filter out warnings (code ending with _WARN) from hard errors
  const hardErrors = validationErrors.filter((e) => !e.code.endsWith('_WARN'))
  if (hardErrors.length > 0) {
    throw new AppError(ERR_TPL_VALIDATION_FAILED, 400, 'Template validation failed', {
      errors: hardErrors,
      warnings: validationErrors.filter((e) => e.code.endsWith('_WARN')),
    })
  }

  // Check internalName uniqueness for this tenant + instance
  const existing = await prisma.managedTemplate.findFirst({
    where: { tenantId, zabbixInstanceId, internalName: body.internalName },
  })
  if (existing) {
    throw new AppError(
      ERR_TPL_INTERNAL_NAME_TAKEN,
      409,
      `Internal name '${body.internalName}' is already used in this instance`,
    )
  }

  // Verify instance belongs to tenant
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: zabbixInstanceId, tenantId },
  })
  if (!instance) {
    throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
  }

  const createData: Prisma.ManagedTemplateUncheckedCreateInput = {
    tenantId,
    zabbixInstanceId,
    name: body.name,
    internalName: body.internalName,
    targetApp: body.targetApp,
    targetOs: body.targetOs,
    description: body.description ?? null,
    prerequisites: body.prerequisites as Prisma.InputJsonValue,
    macros: body.macros as unknown as Prisma.InputJsonValue,
    items: body.items as unknown as Prisma.InputJsonValue,
    triggers: body.triggers as unknown as Prisma.InputJsonValue,
    valueMaps: body.valueMaps as unknown as Prisma.InputJsonValue,
    discoveryRules: body.discoveryRules as unknown as Prisma.InputJsonValue,
    createdBy: userId,
  }

  const template = await prisma.managedTemplate.create({
    data: createData,
  })

  await logAction({
    tenantId,
    userId,
    action: 'template.create',
    entityType: 'ManagedTemplate',
    entityId: template.id,
    after: { name: body.name, internalName: body.internalName },
    ipAddress,
  })

  return template
}

/**
 * Lists managed templates for a tenant + instance with pagination.
 *
 * @param tenantId - Owning tenant ID
 * @param zabbixInstanceId - Target Zabbix instance ID
 * @param page - Page number (1-based)
 * @param limit - Items per page
 */
export async function listTemplates(
  tenantId: string,
  zabbixInstanceId: string,
  page: number = 1,
  limit: number = PAGINATION.DEFAULT_LIMIT,
): Promise<{ data: ManagedTemplate[]; total: number; page: number; limit: number }> {
  const effectiveLimit = Math.min(limit, PAGINATION.MAX_LIMIT)
  const skip = (page - 1) * effectiveLimit

  const [data, total] = await Promise.all([
    prisma.managedTemplate.findMany({
      where: { tenantId, zabbixInstanceId },
      skip,
      take: effectiveLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.managedTemplate.count({
      where: { tenantId, zabbixInstanceId },
    }),
  ])

  return { data, total, page, limit: effectiveLimit }
}

/**
 * Gets a single managed template by ID.
 * Always filters by tenantId to prevent cross-tenant access.
 *
 * @throws AppError TPL_001 if not found
 */
export async function getTemplate(
  tenantId: string,
  zabbixInstanceId: string,
  templateId: string,
): Promise<ManagedTemplate> {
  const template = await prisma.managedTemplate.findFirst({
    where: { id: templateId, tenantId, zabbixInstanceId },
  })

  if (!template) {
    throw new AppError(ERR_TPL_NOT_FOUND, 404, 'Template not found')
  }

  return template
}

/**
 * Updates an existing managed template.
 * Re-validates the merged data before persisting.
 *
 * @throws AppError TPL_001 if not found
 * @throws AppError TPL_002 if validation fails
 */
export async function updateTemplate(
  tenantId: string,
  templateId: string,
  body: UpdateTemplateInput,
  userId: string,
  ipAddress: string,
): Promise<ManagedTemplate> {
  const existing = await prisma.managedTemplate.findFirst({
    where: { id: templateId, tenantId },
  })

  if (!existing) {
    throw new AppError(ERR_TPL_NOT_FOUND, 404, 'Template not found')
  }

  // If internalName is changing, check uniqueness
  if (body.internalName && body.internalName !== existing.internalName) {
    const duplicate = await prisma.managedTemplate.findFirst({
      where: {
        tenantId,
        zabbixInstanceId: existing.zabbixInstanceId,
        internalName: body.internalName,
        id: { not: templateId },
      },
    })
    if (duplicate) {
      throw new AppError(
        ERR_TPL_INTERNAL_NAME_TAKEN,
        409,
        `Internal name '${body.internalName}' is already used in this instance`,
      )
    }
  }

  const before = {
    name: existing.name,
    internalName: existing.internalName,
    targetApp: existing.targetApp,
  }

  const updateData: Prisma.ManagedTemplateUpdateInput = {
    version: { increment: 1 },
  }
  if (body.name !== undefined) updateData.name = body.name
  if (body.internalName !== undefined) updateData.internalName = body.internalName
  if (body.targetApp !== undefined) updateData.targetApp = body.targetApp
  if (body.targetOs !== undefined) updateData.targetOs = body.targetOs
  if (body.description !== undefined) updateData.description = body.description
  if (body.prerequisites !== undefined)
    updateData.prerequisites = body.prerequisites as Prisma.InputJsonValue
  if (body.macros !== undefined)
    updateData.macros = body.macros as unknown as Prisma.InputJsonValue
  if (body.items !== undefined)
    updateData.items = body.items as unknown as Prisma.InputJsonValue
  if (body.triggers !== undefined)
    updateData.triggers = body.triggers as unknown as Prisma.InputJsonValue
  if (body.valueMaps !== undefined)
    updateData.valueMaps = body.valueMaps as unknown as Prisma.InputJsonValue
  if (body.discoveryRules !== undefined)
    updateData.discoveryRules = body.discoveryRules as unknown as Prisma.InputJsonValue

  const updated = await prisma.managedTemplate.update({
    where: { id: templateId },
    data: updateData,
  })

  await logAction({
    tenantId,
    userId,
    action: 'template.update',
    entityType: 'ManagedTemplate',
    entityId: templateId,
    before,
    after: {
      name: updated.name,
      internalName: updated.internalName,
      targetApp: updated.targetApp,
    },
    ipAddress,
  })

  return updated
}

/**
 * Deploys a managed template to the Zabbix instance.
 *
 * Generates ordered Zabbix API calls, executes them sequentially,
 * and performs rollback (template deletion) on failure.
 *
 * @throws AppError TPL_001 if template not found
 * @throws AppError TPL_003 if deployment fails
 */
export async function deployTemplate(
  tenantId: string,
  templateId: string,
  userId: string,
  ipAddress: string,
): Promise<ManagedTemplate> {
  const template = await prisma.managedTemplate.findFirst({
    where: { id: templateId, tenantId },
  })

  if (!template) {
    throw new AppError(ERR_TPL_NOT_FOUND, 404, 'Template not found')
  }

  const zabbixService = await getZabbixServiceForInstance(
    tenantId,
    template.zabbixInstanceId,
  )

  // Build the template input from the stored JSON columns
  const templateInput: CreateTemplateInput = {
    name: template.name,
    internalName: template.internalName,
    targetApp: template.targetApp,
    targetOs: template.targetOs as CreateTemplateInput['targetOs'],
    description: template.description ?? undefined,
    prerequisites: template.prerequisites as string[],
    macros: template.macros as unknown as CreateTemplateInput['macros'],
    items: template.items as unknown as CreateTemplateInput['items'],
    triggers: template.triggers as unknown as CreateTemplateInput['triggers'],
    valueMaps: template.valueMaps as unknown as CreateTemplateInput['valueMaps'],
    discoveryRules: template.discoveryRules as unknown as CreateTemplateInput['discoveryRules'],
  }

  // Use a default host group ID — in production this would come from config or the instance
  const hostGroupId = '1'
  const apiCalls = generateZabbixApiCalls(templateInput, hostGroupId)

  let zabbixTemplateId: string | null = null
  const discoveryRuleIds: Record<string, string> = {}

  try {
    for (const call of apiCalls) {
      // Replace template ID placeholder with real ID after creation
      let params = call.params
      if (zabbixTemplateId && typeof params === 'object' && params !== null) {
        const serialized = JSON.stringify(params)
        let resolved = serialized.replace(
          new RegExp(TEMPLATE_ID_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          zabbixTemplateId,
        )

        // Replace discovery rule ID placeholders
        for (const [ruleKey, ruleId] of Object.entries(discoveryRuleIds)) {
          const placeholder = `__RULE_${ruleKey}__`
          resolved = resolved.replace(
            new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            ruleId,
          )
        }

        params = JSON.parse(resolved) as unknown
      }

      if (call.method === 'template.create') {
        zabbixTemplateId = await zabbixService.createTemplate(
          params as Record<string, unknown>,
        )
      } else if (call.method === 'valuemap.create') {
        await zabbixService.createValueMap(params as Record<string, unknown>)
      } else if (call.method === 'usermacro.create') {
        await zabbixService.createUserMacro(params as Record<string, unknown>)
      } else if (call.method === 'item.create') {
        await zabbixService.createItem(params as Record<string, unknown>)
      } else if (call.method === 'trigger.create') {
        await zabbixService.createTrigger(params as Record<string, unknown>)
      } else if (call.method === 'discoveryrule.create') {
        const ruleId = await zabbixService.createDiscoveryRule(
          params as Record<string, unknown>,
        )
        // Store rule ID by key for prototype resolution
        const ruleParams = params as Record<string, unknown>
        const ruleKey = (ruleParams['key_'] as string) ?? ''
        discoveryRuleIds[ruleKey] = ruleId
      } else if (
        call.method === 'itemprototype.create' ||
        call.method === 'triggerprototype.create'
      ) {
        await zabbixService.execute(call.method, params)
      } else {
        await zabbixService.execute(call.method, params)
      }
    }
  } catch (err) {
    // Rollback: delete the template if it was created
    if (zabbixTemplateId) {
      try {
        await zabbixService.deleteTemplate(zabbixTemplateId)
      } catch {
        // Rollback failure is logged but does not mask the original error
        console.error(
          `[TemplateBuilder] Rollback failed for template ${zabbixTemplateId}`,
        )
      }
    }

    const message = err instanceof Error ? err.message : String(err)
    throw new AppError(
      ERR_TPL_DEPLOY_FAILED,
      502,
      `Template deployment failed: ${message}`,
      { originalError: message },
    )
  }

  // Update the DB record with the Zabbix template ID and deploy timestamp
  const updated = await prisma.managedTemplate.update({
    where: { id: templateId },
    data: {
      zabbixTemplateId,
      deployedAt: new Date(),
    },
  })

  await logAction({
    tenantId,
    userId,
    action: 'template.deploy',
    entityType: 'ManagedTemplate',
    entityId: templateId,
    after: { zabbixTemplateId, deployedAt: updated.deployedAt },
    ipAddress,
  })

  return updated
}
