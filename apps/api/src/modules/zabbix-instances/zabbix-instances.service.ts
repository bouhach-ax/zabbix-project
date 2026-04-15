import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_UNREACHABLE,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
  ERR_TENANT_INSTANCE_LIMIT_REACHED,
  ERR_TENANT_NOT_FOUND,
} from '../../shared/errors/error-codes.js'
import { encrypt, decrypt } from '../../shared/crypto/encryption.js'
import { logAction } from '../audit/audit.service.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import type { CreateInstanceBody, UpdateInstanceBody } from './zabbix-instances.schema.js'
import { INSTANCE_SELECT } from './zabbix-instances.schema.js'

/**
 * Zabbix Instances service — CRUD with encrypted token storage, connectivity testing, and audit logging.
 */

/**
 * Creates a new Zabbix instance for a tenant.
 * Encrypts the API token, tests connectivity, and stores detected version.
 * @throws AppError TNT_005 if tenant has reached instance limit
 * @throws AppError ZBX_002 if connectivity test fails
 */
export async function createInstance(
  tenantId: string,
  body: CreateInstanceBody,
  userId: string,
  ipAddress: string,
) {
  // Check tenant instance limit
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { maxInstances: true },
  })
  if (!tenant) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 404, 'Tenant not found')
  }

  const instanceCount = await prisma.zabbixInstance.count({
    where: { tenantId, isActive: true },
  })
  if (instanceCount >= tenant.maxInstances) {
    throw new AppError(
      ERR_TENANT_INSTANCE_LIMIT_REACHED,
      409,
      `Instance limit reached (max: ${String(tenant.maxInstances)})`,
    )
  }

  // Encrypt the API token
  const apiTokenEncrypted = encrypt(body.apiToken)

  // Test connectivity and detect version
  const zbxService = new ZabbixApiService(body.apiUrl, body.apiToken, 'temp')
  const health = await zbxService.healthCheck()

  if (!health.reachable) {
    throw new AppError(
      ERR_INSTANCE_UNREACHABLE,
      502,
      `Cannot reach Zabbix API at ${body.apiUrl}`,
      { error: health.error },
    )
  }

  const instance = await prisma.zabbixInstance.create({
    data: {
      tenantId,
      label: body.label,
      apiUrl: body.apiUrl,
      apiTokenEncrypted,
      version: health.version,
      isActive: body.isActive ?? true,
      lastHealthCheck: new Date(),
      healthStatus: 'OK',
    },
    select: INSTANCE_SELECT,
  })

  await logAction({
    tenantId,
    userId,
    action: 'ZABBIX_INSTANCE_CREATED',
    entityType: 'ZabbixInstance',
    entityId: instance.id,
    after: { label: instance.label, apiUrl: instance.apiUrl, version: instance.version },
    ipAddress,
  })

  return instance
}

/**
 * Lists all Zabbix instances for a tenant. Never returns encrypted token.
 */
export async function findAll(tenantId: string) {
  return prisma.zabbixInstance.findMany({
    where: { tenantId },
    select: INSTANCE_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Finds a single Zabbix instance by ID within a tenant.
 * @throws AppError ZBX_001 if not found
 */
export async function findById(tenantId: string, instanceId: string) {
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: INSTANCE_SELECT,
  })
  if (!instance) {
    throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
  }
  return instance
}

/**
 * Updates a Zabbix instance. Re-encrypts token if provided.
 * @throws AppError ZBX_001 if not found
 */
export async function updateInstance(
  tenantId: string,
  instanceId: string,
  body: UpdateInstanceBody,
  userId: string,
  ipAddress: string,
) {
  const before = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: INSTANCE_SELECT,
  })
  if (!before) {
    throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
  }

  const updateData: Record<string, unknown> = {}
  if (body.label !== undefined) updateData['label'] = body.label
  if (body.apiUrl !== undefined) updateData['apiUrl'] = body.apiUrl
  if (body.isActive !== undefined) updateData['isActive'] = body.isActive
  if (body.apiToken !== undefined) {
    updateData['apiTokenEncrypted'] = encrypt(body.apiToken)
  }

  const instance = await prisma.zabbixInstance.update({
    where: { id: instanceId },
    data: updateData,
    select: INSTANCE_SELECT,
  })

  // Audit — mask token, never log encrypted token
  await logAction({
    tenantId,
    userId,
    action: 'ZABBIX_INSTANCE_UPDATED',
    entityType: 'ZabbixInstance',
    entityId: instanceId,
    before: { label: before.label, apiUrl: before.apiUrl, isActive: before.isActive },
    after: {
      label: instance.label,
      apiUrl: instance.apiUrl,
      isActive: instance.isActive,
      ...(body.apiToken !== undefined && { apiToken: '***REDACTED***' }),
    },
    ipAddress,
  })

  return instance
}

/**
 * Soft-deletes a Zabbix instance by setting isActive=false.
 * @throws AppError ZBX_001 if not found
 */
export async function deleteInstance(
  tenantId: string,
  instanceId: string,
  userId: string,
  ipAddress: string,
) {
  const before = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: INSTANCE_SELECT,
  })
  if (!before) {
    throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
  }

  const instance = await prisma.zabbixInstance.update({
    where: { id: instanceId },
    data: { isActive: false },
    select: INSTANCE_SELECT,
  })

  await logAction({
    tenantId,
    userId,
    action: 'ZABBIX_INSTANCE_DEACTIVATED',
    entityType: 'ZabbixInstance',
    entityId: instanceId,
    before: { isActive: before.isActive },
    after: { isActive: false },
    ipAddress,
  })

  return instance
}

/**
 * Tests connectivity to a Zabbix instance. Decrypts the token, connects, and updates health status in DB.
 * @throws AppError ZBX_001 if instance not found
 * @throws AppError ZBX_005 if token decryption fails
 */
export async function testConnectivity(tenantId: string, instanceId: string) {
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: { id: true, apiUrl: true, apiTokenEncrypted: true, version: true },
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

  const zbxService = new ZabbixApiService(instance.apiUrl, apiToken, instance.id, instance.version ?? undefined)
  const health = await zbxService.healthCheck()

  // Update health status in DB
  await prisma.zabbixInstance.update({
    where: { id: instanceId },
    data: {
      lastHealthCheck: new Date(),
      healthStatus: health.reachable ? 'OK' : 'UNREACHABLE',
      ...(health.version && { version: health.version }),
    },
  })

  return {
    reachable: health.reachable,
    version: health.version,
    error: health.error,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Returns a ZabbixApiService instance for the given Zabbix instance.
 * Used by other modules that need to interact with Zabbix API.
 * @throws AppError ZBX_001 if instance not found
 * @throws AppError ZBX_005 if token decryption fails
 */
export async function getZabbixService(
  tenantId: string,
  instanceId: string,
): Promise<ZabbixApiService> {
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
    select: { id: true, apiUrl: true, apiTokenEncrypted: true, version: true },
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

  return new ZabbixApiService(instance.apiUrl, apiToken, instance.id, instance.version ?? undefined)
}
