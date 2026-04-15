import { prisma } from '../../shared/database/prisma.js'
import { decrypt } from '../../shared/crypto/encryption.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
} from '../../shared/errors/error-codes.js'
import { logAction } from '../audit/audit.service.js'
import type { ZabbixMaintenance } from '../../integrations/zabbix/zabbix-types.js'

// ---------------------------------------------------------------------------
// Helper: Instantiate ZabbixApiService for a given instance
// ---------------------------------------------------------------------------

/**
 * Resolves a ZabbixApiService for the given tenant + instance.
 * Decrypts the stored API token before constructing the service.
 *
 * @param tenantId - Tenant owning the instance
 * @param instanceId - ZabbixInstance ID
 * @returns Configured ZabbixApiService
 * @throws AppError if instance not found or token decryption fails
 */
async function getZabbixService(tenantId: string, instanceId: string): Promise<ZabbixApiService> {
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: instanceId, tenantId },
  })

  if (!instance) {
    throw new AppError(ERR_INSTANCE_NOT_FOUND, 404, 'Zabbix instance not found')
  }

  let decryptedToken: string
  try {
    decryptedToken = decrypt(instance.apiTokenEncrypted)
  } catch {
    throw new AppError(
      ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
      500,
      'Failed to decrypt Zabbix API token',
    )
  }

  return new ZabbixApiService(
    instance.apiUrl,
    decryptedToken,
    instance.id,
    instance.version ?? undefined,
  )
}

// ---------------------------------------------------------------------------
// Maintenance CRUD
// ---------------------------------------------------------------------------

export interface CreateMaintenanceBody {
  name: string
  activeSince: string | number // epoch or ISO string
  activeTill: string | number
  hostIds: string[]
  description?: string | undefined
  maintenanceType?: 0 | 1 | undefined // 0 = with data collection, 1 = without
}

/**
 * Creates a maintenance period in Zabbix.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param body - Maintenance definition
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 * @returns Maintenance ID from Zabbix
 */
export async function createMaintenance(
  tenantId: string,
  instanceId: string,
  body: CreateMaintenanceBody,
  userId: string,
  ipAddress: string,
): Promise<{ maintenanceId: string }> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  const activeSince = toEpoch(body.activeSince)
  const activeTill = toEpoch(body.activeTill)
  const period = activeTill - activeSince

  const maintenanceId = await zabbixService.createMaintenance({
    name: body.name,
    active_since: activeSince,
    active_till: activeTill,
    hostids: body.hostIds,
    description: body.description ?? '',
    maintenance_type: body.maintenanceType ?? 0,
    timeperiods: [
      {
        timeperiod_type: 0, // one-time
        period,
        start_date: activeSince,
      },
    ],
  })

  await logAction({
    tenantId,
    userId,
    action: 'CREATE_MAINTENANCE',
    entityType: 'maintenance',
    entityId: maintenanceId,
    after: {
      maintenanceId,
      name: body.name,
      activeSince,
      activeTill,
      hostIds: body.hostIds,
    } as unknown as Record<string, unknown>,
    ipAddress,
  })

  return { maintenanceId }
}

/**
 * Lists all maintenance periods for a Zabbix instance.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @returns Array of Zabbix maintenance objects
 */
export async function listMaintenances(
  tenantId: string,
  instanceId: string,
): Promise<ZabbixMaintenance[]> {
  const zabbixService = await getZabbixService(tenantId, instanceId)
  return zabbixService.getMaintenances()
}

export interface UpdateMaintenanceBody {
  name?: string | undefined
  activeSince?: string | number | undefined
  activeTill?: string | number | undefined
  hostIds?: string[] | undefined
  description?: string | undefined
  maintenanceType?: 0 | 1 | undefined
}

/**
 * Updates a maintenance period in Zabbix.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param maintenanceId - Zabbix maintenance ID
 * @param body - Fields to update
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 */
export async function updateMaintenance(
  tenantId: string,
  instanceId: string,
  maintenanceId: string,
  body: UpdateMaintenanceBody,
  userId: string,
  ipAddress: string,
): Promise<void> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Fetch the current state for audit before-snapshot
  const existing = await zabbixService.getMaintenances({
    maintenanceids: maintenanceId,
  })
  const before = existing[0]

  const params: Record<string, unknown> = { maintenanceid: maintenanceId }
  if (body.name !== undefined) params['name'] = body.name
  if (body.description !== undefined) params['description'] = body.description
  if (body.maintenanceType !== undefined) params['maintenance_type'] = body.maintenanceType
  if (body.hostIds !== undefined) params['hostids'] = body.hostIds
  if (body.activeSince !== undefined) params['active_since'] = toEpoch(body.activeSince)
  if (body.activeTill !== undefined) params['active_till'] = toEpoch(body.activeTill)

  // Rebuild timeperiods if dates changed
  if (body.activeSince !== undefined || body.activeTill !== undefined) {
    const since = body.activeSince !== undefined ? toEpoch(body.activeSince) : parseInt(before?.active_since ?? '0', 10)
    const till = body.activeTill !== undefined ? toEpoch(body.activeTill) : parseInt(before?.active_till ?? '0', 10)
    params['timeperiods'] = [
      {
        timeperiod_type: 0,
        period: till - since,
        start_date: since,
      },
    ]
  }

  await zabbixService.updateMaintenance(params)

  await logAction({
    tenantId,
    userId,
    action: 'UPDATE_MAINTENANCE',
    entityType: 'maintenance',
    entityId: maintenanceId,
    before: before as unknown as Record<string, unknown>,
    after: params as Record<string, unknown>,
    ipAddress,
  })
}

/**
 * Deletes a maintenance period from Zabbix.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param maintenanceId - Zabbix maintenance ID
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 */
export async function deleteMaintenance(
  tenantId: string,
  instanceId: string,
  maintenanceId: string,
  userId: string,
  ipAddress: string,
): Promise<void> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Fetch for audit snapshot
  const existing = await zabbixService.getMaintenances({
    maintenanceids: maintenanceId,
  })

  await zabbixService.deleteMaintenance(maintenanceId)

  await logAction({
    tenantId,
    userId,
    action: 'DELETE_MAINTENANCE',
    entityType: 'maintenance',
    entityId: maintenanceId,
    before: (existing[0] ?? null) as unknown as Record<string, unknown>,
    ipAddress,
  })
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Converts an ISO date string or epoch number to a Unix epoch (seconds).
 */
function toEpoch(value: string | number): number {
  if (typeof value === 'number') {
    // If already in seconds (< 10 billion), keep as-is; otherwise convert from ms
    return value < 10_000_000_000 ? value : Math.floor(value / 1000)
  }
  return Math.floor(new Date(value).getTime() / 1000)
}
