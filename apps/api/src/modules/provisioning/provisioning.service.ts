import type { HostStatus, ManagedHost, ProvisioningJob } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_HOST_NOT_FOUND,
  ERR_HOST_INVALID_STATUS_TRANSITION,
  ERR_TENANT_HOST_LIMIT_REACHED,
  ERR_INSTANCE_NOT_FOUND,
  ERR_PROV_JOB_NOT_FOUND,
  ERR_PROV_JOB_ALREADY_RUNNING,
} from '../../shared/errors/error-codes.js'
import { getQueue, QUEUE_NAMES } from '../../shared/queue/bullmq.js'
import { logAction } from '../audit/audit.service.js'
import { ZABBIX_AGENT_DEFAULT_PORT, PAGINATION } from '../../config/constants.js'
import type { ICreateHostBody, IUpdateHostBody, IStartProvisioningBody, IListHostsQuery } from './provisioning.schema.js'

/**
 * Valid status transitions for ManagedHost lifecycle.
 * DECOMMISSIONED is a terminal state — no transitions out.
 */
const VALID_TRANSITIONS: Record<string, HostStatus[]> = {
  ONBOARDING: ['ACTIVE'],
  ACTIVE: ['MAINTENANCE', 'DECOMMISSIONED'],
  MAINTENANCE: ['ACTIVE', 'DECOMMISSIONED'],
  DECOMMISSIONED: [],
}

/**
 * Job statuses that indicate a provisioning job is still active.
 */
const ACTIVE_JOB_STATUSES = [
  'PENDING',
  'DETECTING',
  'SCRIPT_GENERATED',
  'AGENT_DEPLOYED',
  'HOST_DECLARED',
  'OS_TEMPLATE_APPLIED',
  'OS_VALIDATED',
  'WAITING_APP_DECLARATION',
  'APPS_CONFIGURING',
] as const

// ──────────────────────────────────────────────
// Host CRUD
// ──────────────────────────────────────────────

/**
 * Creates a new managed host.
 * Validates tenant host limit and instance ownership before creation.
 *
 * @param tenantId - ID of the owning tenant
 * @param body - Host creation payload
 * @param userId - ID of the user performing the action
 * @param ipAddress - Client IP for audit logging
 * @returns The newly created ManagedHost record
 * @throws AppError TNT_004 if tenant has reached maxHosts limit
 * @throws AppError ZBX_001 if zabbixInstanceId does not belong to tenant
 */
export async function createHost(
  tenantId: string,
  body: ICreateHostBody,
  userId: string,
  ipAddress: string,
): Promise<ManagedHost> {
  // Validate tenant host limit
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { maxHosts: true },
  })

  const hostCount = await prisma.managedHost.count({
    where: { tenantId, status: { not: 'DECOMMISSIONED' } },
  })

  if (hostCount >= tenant.maxHosts) {
    throw new AppError(
      ERR_TENANT_HOST_LIMIT_REACHED,
      403,
      `Tenant host limit reached (${tenant.maxHosts}). Decommission unused hosts or upgrade your plan.`,
    )
  }

  // Validate Zabbix instance belongs to tenant
  const instance = await prisma.zabbixInstance.findFirst({
    where: { id: body.zabbixInstanceId, tenantId },
  })

  if (!instance) {
    throw new AppError(
      ERR_INSTANCE_NOT_FOUND,
      404,
      'Zabbix instance not found or does not belong to this tenant',
    )
  }

  const host = await prisma.managedHost.create({
    data: {
      tenantId,
      zabbixInstanceId: body.zabbixInstanceId,
      hostname: body.hostname,
      ipAddress: body.ipAddress,
      os: body.os ?? null,
      declaredRole: body.declaredRole ?? null,
      location: body.location ?? null,
      tags: body.tags ?? [],
      hostGroupIds: body.hostGroupIds ?? [],
      agentPort: body.agentPort ?? ZABBIX_AGENT_DEFAULT_PORT,
      status: 'ONBOARDING',
    },
  })

  await logAction({
    tenantId,
    userId,
    action: 'host.create',
    entityType: 'ManagedHost',
    entityId: host.id,
    after: host as unknown as Record<string, unknown>,
    ipAddress,
  })

  return host
}

/**
 * Lists managed hosts for a tenant with optional filters and pagination.
 *
 * @param tenantId - ID of the owning tenant
 * @param query - Pagination and filter parameters
 * @returns Paginated list of hosts and total count
 */
export async function listHosts(
  tenantId: string,
  query: IListHostsQuery,
): Promise<{ hosts: ManagedHost[]; total: number; page: number; limit: number }> {
  const page = query.page ?? 1
  const limit = Math.min(query.limit ?? PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT)
  const skip = (page - 1) * limit

  const where: Prisma.ManagedHostWhereInput = { tenantId }

  if (query.status) {
    where.status = query.status
  }

  if (query.zabbixInstanceId) {
    where.zabbixInstanceId = query.zabbixInstanceId
  }

  if (query.search) {
    where.OR = [
      { hostname: { contains: query.search, mode: 'insensitive' } },
      { ipAddress: { contains: query.search, mode: 'insensitive' } },
      { declaredRole: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  const [hosts, total] = await Promise.all([
    prisma.managedHost.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { instance: { select: { label: true } } },
    }),
    prisma.managedHost.count({ where }),
  ])

  return { hosts, total, page, limit }
}

/**
 * Gets a single host with its provisioning job and assigned templates.
 *
 * @param tenantId - ID of the owning tenant (security filter)
 * @param hostId - ID of the host to retrieve
 * @returns The host with related records
 * @throws AppError HOST_001 if host not found or does not belong to tenant
 */
export async function getHost(
  tenantId: string,
  hostId: string,
): Promise<ManagedHost & { provisioningJob: ProvisioningJob | null }> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
    include: {
      provisioningJob: true,
      assignedTemplates: {
        include: { template: { select: { id: true, name: true, targetApp: true } } },
      },
      instance: { select: { id: true, label: true, apiUrl: true, version: true } },
    },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  return host as ManagedHost & { provisioningJob: ProvisioningJob | null }
}

/**
 * Updates an existing managed host.
 * Records before/after state in audit log.
 *
 * @param tenantId - ID of the owning tenant (security filter)
 * @param hostId - ID of the host to update
 * @param body - Partial update payload
 * @param userId - ID of the user performing the action
 * @param ipAddress - Client IP for audit logging
 * @returns The updated host
 * @throws AppError HOST_001 if host not found or does not belong to tenant
 */
export async function updateHost(
  tenantId: string,
  hostId: string,
  body: IUpdateHostBody,
  userId: string,
  ipAddress: string,
): Promise<ManagedHost> {
  const existing = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
  })

  if (!existing) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const updated = await prisma.managedHost.update({
    where: { id: hostId },
    data: {
      ...(body.hostname !== undefined && { hostname: body.hostname }),
      ...(body.ipAddress !== undefined && { ipAddress: body.ipAddress }),
      ...(body.os !== undefined && { os: body.os }),
      ...(body.declaredRole !== undefined && { declaredRole: body.declaredRole }),
      ...(body.location !== undefined && { location: body.location }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.hostGroupIds !== undefined && { hostGroupIds: body.hostGroupIds }),
      ...(body.agentPort !== undefined && { agentPort: body.agentPort }),
    },
  })

  await logAction({
    tenantId,
    userId,
    action: 'host.update',
    entityType: 'ManagedHost',
    entityId: hostId,
    before: existing as unknown as Record<string, unknown>,
    after: updated as unknown as Record<string, unknown>,
    ipAddress,
  })

  return updated
}

/**
 * Transitions a host to a new status.
 * Validates the transition against the allowed state machine.
 *
 * @param tenantId - ID of the owning tenant (security filter)
 * @param hostId - ID of the host to transition
 * @param newStatus - Target status
 * @param userId - ID of the user performing the action
 * @param ipAddress - Client IP for audit logging
 * @param comment - Optional reason for the transition
 * @returns The updated host
 * @throws AppError HOST_001 if host not found
 * @throws AppError HOST_003 if transition is invalid
 */
export async function transitionStatus(
  tenantId: string,
  hostId: string,
  newStatus: HostStatus,
  userId: string,
  ipAddress: string,
  comment?: string,
): Promise<ManagedHost> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const allowed = VALID_TRANSITIONS[host.status] ?? []
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      ERR_HOST_INVALID_STATUS_TRANSITION,
      400,
      `Cannot transition from ${host.status} to ${newStatus}. Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
      { currentStatus: host.status, requestedStatus: newStatus, allowed },
    )
  }

  const updated = await prisma.managedHost.update({
    where: { id: hostId },
    data: { status: newStatus },
  })

  await logAction({
    tenantId,
    userId,
    action: 'host.transition',
    entityType: 'ManagedHost',
    entityId: hostId,
    before: { status: host.status },
    after: { status: newStatus },
    ...(comment != null ? { comment } : {}),
    ipAddress,
  })

  return updated
}

// ──────────────────────────────────────────────
// Provisioning Job Management
// ──────────────────────────────────────────────

/**
 * Starts a provisioning job for a host.
 * Creates a ProvisioningJob and enqueues a BullMQ job for async processing.
 *
 * @param tenantId - ID of the owning tenant
 * @param hostId - ID of the host to provision
 * @param body - Zabbix server IPs for script generation
 * @param userId - ID of the user performing the action
 * @param ipAddress - Client IP for audit logging
 * @returns The created ProvisioningJob
 * @throws AppError HOST_001 if host not found
 * @throws AppError PROV_004 if a provisioning job is already active
 */
export async function startProvisioning(
  tenantId: string,
  hostId: string,
  body: IStartProvisioningBody,
  userId: string,
  ipAddress: string,
): Promise<ProvisioningJob> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  // Check for already-active provisioning job
  const existingJob = await prisma.provisioningJob.findUnique({
    where: { hostId },
  })

  if (existingJob && (ACTIVE_JOB_STATUSES as readonly string[]).includes(existingJob.status)) {
    throw new AppError(
      ERR_PROV_JOB_ALREADY_RUNNING,
      409,
      `A provisioning job is already active for this host (status: ${existingJob.status})`,
    )
  }

  // Upsert the job — if a previous FAILED/SUCCESS job exists, replace it
  const job = existingJob
    ? await prisma.provisioningJob.update({
        where: { hostId },
        data: {
          status: 'PENDING',
          currentStep: 'Initialisation',
          detectedOs: Prisma.JsonNull,
          generatedScript: null,
          steps: [],
          errorCode: null,
          errorMessage: null,
          startedAt: new Date(),
          completedAt: null,
        },
      })
    : await prisma.provisioningJob.create({
        data: {
          hostId,
          status: 'PENDING',
          currentStep: 'Initialisation',
          steps: [],
          startedAt: new Date(),
        },
      })

  // Enqueue BullMQ job
  const queue = getQueue(QUEUE_NAMES.PROVISIONING)
  await queue.add('provision-host', {
    hostId,
    tenantId,
    zabbixServerIp: body.zabbixServerIp,
    zabbixActiveIp: body.zabbixActiveIp,
  })

  await logAction({
    tenantId,
    userId,
    action: 'provisioning.start',
    entityType: 'ProvisioningJob',
    entityId: job.id,
    after: { hostId, zabbixServerIp: body.zabbixServerIp },
    ipAddress,
  })

  return job
}

/**
 * Gets the current provisioning job status for a host.
 *
 * @param tenantId - ID of the owning tenant
 * @param hostId - ID of the host
 * @returns The ProvisioningJob record
 * @throws AppError PROV_001 if no job found
 */
export async function getJobStatus(
  tenantId: string,
  hostId: string,
): Promise<ProvisioningJob> {
  // First ensure the host belongs to this tenant
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
    select: { id: true },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const job = await prisma.provisioningJob.findUnique({
    where: { hostId },
  })

  if (!job) {
    throw new AppError(ERR_PROV_JOB_NOT_FOUND, 404, 'No provisioning job found for this host')
  }

  return job
}

/**
 * Cancels an active provisioning job.
 *
 * @param tenantId - ID of the owning tenant
 * @param hostId - ID of the host
 * @param userId - ID of the user performing the action
 * @param ipAddress - Client IP for audit logging
 * @returns The updated ProvisioningJob
 * @throws AppError HOST_001 if host not found
 * @throws AppError PROV_001 if no job found
 */
export async function cancelJob(
  tenantId: string,
  hostId: string,
  userId: string,
  ipAddress: string,
): Promise<ProvisioningJob> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
    select: { id: true },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const job = await prisma.provisioningJob.findUnique({
    where: { hostId },
  })

  if (!job) {
    throw new AppError(ERR_PROV_JOB_NOT_FOUND, 404, 'No provisioning job found for this host')
  }

  const updated = await prisma.provisioningJob.update({
    where: { hostId },
    data: {
      status: 'FAILED',
      errorMessage: 'Cancelled by user',
      completedAt: new Date(),
    },
  })

  await logAction({
    tenantId,
    userId,
    action: 'provisioning.cancel',
    entityType: 'ProvisioningJob',
    entityId: job.id,
    before: { status: job.status },
    after: { status: 'FAILED', errorMessage: 'Cancelled by user' },
    ipAddress,
  })

  return updated
}

/**
 * Returns the generated installation script for a host's provisioning job.
 *
 * @param tenantId - ID of the owning tenant
 * @param hostId - ID of the host
 * @returns The generated script as a string
 * @throws AppError HOST_001 if host not found
 * @throws AppError PROV_001 if no job found or script not yet generated
 */
export async function getScript(
  tenantId: string,
  hostId: string,
): Promise<string> {
  const host = await prisma.managedHost.findFirst({
    where: { id: hostId, tenantId },
    select: { id: true },
  })

  if (!host) {
    throw new AppError(ERR_HOST_NOT_FOUND, 404, 'Host not found')
  }

  const job = await prisma.provisioningJob.findUnique({
    where: { hostId },
    select: { generatedScript: true },
  })

  if (!job || !job.generatedScript) {
    throw new AppError(
      ERR_PROV_JOB_NOT_FOUND,
      404,
      'No provisioning script available. Start provisioning first or wait for script generation.',
    )
  }

  return job.generatedScript
}
