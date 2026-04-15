import type { ManagedHost } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_HOST_NOT_FOUND,
  ERR_HOST_INVALID_STATUS_TRANSITION,
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
} from '../../shared/errors/error-codes.js'
import { decrypt } from '../../shared/crypto/encryption.js'
import { logAction } from '../audit/audit.service.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'

/** Preview data returned before decommissioning a host. */
export interface DecommissionPreview {
  host: ManagedHost
  linkedTemplates: number
  hasActiveJob: boolean
}

/** A ghost host candidate — decommissioned locally but potentially still active in Zabbix. */
export interface GhostHostCandidate {
  id: string
  hostname: string
  zabbixHostId: string
  zabbixInstanceId: string
  decommissionedAt: Date
}

/**
 * Creates a ZabbixApiService for a given tenant + instance.
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
 * Returns a preview of what decommissioning a host will affect.
 *
 * @param tenantId - Owning tenant ID
 * @param hostId - Host to preview decommission for
 * @returns Preview data including linked template count and active job status
 * @throws AppError HOST_001 if host not found
 */
export async function getDecommissionPreview(
  tenantId: string,
  hostId: string,
): Promise<DecommissionPreview> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
    include: {
      assignedTemplates: true,
      provisioningJob: true,
    },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const hasActiveJob = host.provisioningJob
    ? !['SUCCESS', 'FAILED'].includes(host.provisioningJob.status)
    : false

  return {
    host,
    linkedTemplates: host.assignedTemplates.length,
    hasActiveJob,
  }
}

/**
 * Decommissions a host: disables it in Zabbix and sets status to DECOMMISSIONED.
 *
 * Valid source statuses: ACTIVE, MAINTENANCE.
 * Cannot decommission a host that is already DECOMMISSIONED or still ONBOARDING.
 *
 * @param tenantId - Owning tenant ID
 * @param hostId - Host to decommission
 * @param userId - User performing the action
 * @param ipAddress - Client IP for audit log
 * @returns Updated host record
 * @throws AppError HOST_001 if host not found
 * @throws AppError HOST_003 if status transition is invalid
 */
export async function decommissionHost(
  tenantId: string,
  hostId: string,
  userId: string,
  ipAddress: string,
): Promise<ManagedHost> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  // Only ACTIVE or MAINTENANCE hosts can be decommissioned
  if (host.status !== 'ACTIVE' && host.status !== 'MAINTENANCE') {
    throw new AppError(
      ERR_HOST_INVALID_STATUS_TRANSITION,
      400,
      `Cannot decommission host with status '${host.status}'. Only ACTIVE or MAINTENANCE hosts can be decommissioned.`,
    )
  }

  // Disable host in Zabbix if it was declared there
  if (host.zabbixHostId) {
    try {
      const zabbixService = await getZabbixServiceForInstance(
        tenantId,
        host.zabbixInstanceId,
      )
      // status: 1 = disabled in Zabbix
      await zabbixService.updateHost({
        hostid: host.zabbixHostId,
        status: 1,
      })
    } catch (err) {
      // Log but do not block decommission if Zabbix is unreachable
      console.error(
        `[Lifecycle] Failed to disable host ${host.zabbixHostId} in Zabbix:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  const previousStatus = host.status

  const updated = await prisma.managedHost.update({
    where: { id: hostId },
    data: { status: 'DECOMMISSIONED' },
  })

  await logAction({
    tenantId,
    userId,
    action: 'host.decommission',
    entityType: 'ManagedHost',
    entityId: hostId,
    before: { status: previousStatus },
    after: { status: 'DECOMMISSIONED' },
    comment: `Host decommissioned from status ${previousStatus}`,
    ipAddress,
  })

  return updated
}

/**
 * Detects ghost hosts: hosts marked as DECOMMISSIONED locally
 * that still have a zabbixHostId (potentially still active in Zabbix).
 *
 * @param tenantId - Owning tenant ID
 * @returns List of ghost host candidates
 */
export async function detectGhostHosts(
  tenantId: string,
): Promise<GhostHostCandidate[]> {
  const ghostHosts = await prisma.managedHost.findMany({
    where: {
      tenantId,
      status: 'DECOMMISSIONED',
      zabbixHostId: { not: null },
    },
    select: {
      id: true,
      hostname: true,
      zabbixHostId: true,
      zabbixInstanceId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  // TODO: For each ghost host, optionally check against Zabbix API
  // to verify if the host is still active/enabled there.
  // This would require calling zabbixService.getHosts({ hostids: [zabbixHostId] })
  // for each instance and checking the status field.

  return ghostHosts.map((h) => ({
    id: h.id,
    hostname: h.hostname,
    zabbixHostId: h.zabbixHostId!,
    zabbixInstanceId: h.zabbixInstanceId,
    decommissionedAt: h.updatedAt,
  }))
}
