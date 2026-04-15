import { prisma } from '../../shared/database/prisma.js'
import { decrypt } from '../../shared/crypto/encryption.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { AppError } from '../../shared/errors/AppError.js'
import {
  ERR_INSTANCE_NOT_FOUND,
  ERR_INSTANCE_TOKEN_DECRYPT_FAILED,
  ERR_ALERT_NOT_FOUND,
  ERR_ALERT_RULE_NOT_FOUND,
} from '../../shared/errors/error-codes.js'
import { logAction } from '../audit/audit.service.js'
import {
  CorrelationEngine,
  type CorrelatedIncident,
  type CorrelationRuleConfig,
  type NetworkTopology,
} from './correlation-engine.js'
import { ScoringEngine, type AlertHistoryEntry, type NoisyTrigger } from './scoring-engine.js'
import type { ZabbixEvent, ZabbixTrigger } from '../../integrations/zabbix/zabbix-types.js'
import type { RuleType } from '@prisma/client'

const correlationEngine = new CorrelationEngine()
const scoringEngine = new ScoringEngine()

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
// Correlated Alerts
// ---------------------------------------------------------------------------

/**
 * Retrieves active alerts from a Zabbix instance and groups them into
 * correlated incidents using the tenant's correlation rules.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @returns Array of correlated incidents
 */
export async function getCorrelatedAlerts(
  tenantId: string,
  instanceId: string,
): Promise<CorrelatedIncident[]> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Fetch active alerts from Zabbix
  const alerts = await zabbixService.getActiveAlerts()

  if (alerts.length === 0) return []

  // Fetch correlation rules for this tenant
  const dbRules = await prisma.correlationRule.findMany({
    where: { tenantId },
    orderBy: { priority: 'desc' },
  })

  const rules: CorrelationRuleConfig[] = dbRules.map((r) => ({
    type: r.type,
    timeWindow: r.timeWindow,
    conditions: r.conditions as Record<string, unknown>,
    isActive: r.isActive,
    priority: r.priority,
  }))

  // Build simplified topology from host IPs (extract /24 segment)
  const topology = buildTopologyFromAlerts(alerts)

  return correlationEngine.correlate(alerts, rules, topology)
}

/**
 * Builds a network topology from alerts by extracting /24 segments
 * from host interface IPs. Simplified approach for initial implementation.
 */
function buildTopologyFromAlerts(alerts: ZabbixTrigger[]): NetworkTopology {
  const segments: Record<string, string> = {}

  for (const alert of alerts) {
    const host = alert.hosts?.[0]
    if (!host) continue

    // Use the host name to derive segment as a fallback;
    // in production, host.get with selectInterfaces would be used
    // For now, use the hostid mapped to a generic segment based on tags
    const networkTag = alert.tags?.find((t) => t.tag === 'network_segment')
    if (networkTag) {
      segments[host.hostid] = networkTag.value
    }
  }

  return { segments }
}

// ---------------------------------------------------------------------------
// Acknowledge Alert
// ---------------------------------------------------------------------------

/**
 * Acknowledges an alert (trigger) in Zabbix.
 * Fetches recent events for the trigger and acknowledges them.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param triggerId - Zabbix trigger ID to acknowledge
 * @param userId - Acting user ID (for audit)
 * @param message - Acknowledgment message
 * @param ipAddress - Client IP (for audit)
 */
export async function acknowledgeAlert(
  tenantId: string,
  instanceId: string,
  triggerId: string,
  userId: string,
  message: string,
  ipAddress: string,
): Promise<void> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Get recent events for this trigger
  const events = await zabbixService.getEvents({
    objectids: triggerId,
    limit: 10,
    sortfield: ['clock'],
    sortorder: 'DESC',
  })

  if (events.length === 0) {
    throw new AppError(ERR_ALERT_NOT_FOUND, 404, 'No events found for this trigger')
  }

  const eventIds = events.map((e) => e.eventid)
  await zabbixService.acknowledgeEvent(eventIds, message)

  await logAction({
    tenantId,
    userId,
    action: 'ACKNOWLEDGE_ALERT',
    entityType: 'trigger',
    entityId: triggerId,
    after: { message, eventIds } as unknown as Record<string, unknown>,
    ipAddress,
  })
}

// ---------------------------------------------------------------------------
// Suppress Alert
// ---------------------------------------------------------------------------

/**
 * Suppresses an alert by creating a temporary maintenance period in Zabbix
 * for the trigger's host.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param triggerId - Zabbix trigger ID
 * @param userId - Acting user ID (for audit)
 * @param durationMinutes - Duration of suppression in minutes
 * @param ipAddress - Client IP (for audit)
 * @returns Maintenance ID created in Zabbix
 */
export async function suppressAlert(
  tenantId: string,
  instanceId: string,
  triggerId: string,
  userId: string,
  durationMinutes: number,
  ipAddress: string,
): Promise<string> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Get the trigger to find its host
  const triggers = await zabbixService.getActiveAlerts({
    triggerids: triggerId,
    limit: 1,
  })

  if (triggers.length === 0) {
    throw new AppError(ERR_ALERT_NOT_FOUND, 404, 'Trigger not found or not active')
  }

  const trigger = triggers[0]!
  const hostId = trigger.hosts?.[0]?.hostid
  if (!hostId) {
    throw new AppError(ERR_ALERT_NOT_FOUND, 404, 'No host associated with this trigger')
  }

  const now = Math.floor(Date.now() / 1000)
  const until = now + durationMinutes * 60

  const maintenanceId = await zabbixService.createMaintenance({
    name: `Suppression: trigger ${triggerId} (${new Date().toISOString()})`,
    active_since: now,
    active_till: until,
    hostids: [hostId],
    maintenance_type: 1, // 1 = no data collection suppressed, just suppress problems
    timeperiods: [
      {
        timeperiod_type: 0, // one-time
        period: durationMinutes * 60,
        start_date: now,
      },
    ],
  })

  await logAction({
    tenantId,
    userId,
    action: 'SUPPRESS_ALERT',
    entityType: 'trigger',
    entityId: triggerId,
    after: {
      maintenanceId,
      hostId,
      durationMinutes,
      activeSince: now,
      activeTill: until,
    } as unknown as Record<string, unknown>,
    ipAddress,
  })

  return maintenanceId
}

// ---------------------------------------------------------------------------
// Alert History
// ---------------------------------------------------------------------------

export interface AlertHistoryFilters {
  limit?: number | undefined
  hostId?: string | undefined
  severity?: string | undefined
}

/**
 * Retrieves event history from a Zabbix instance with optional filters.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @param filters - Optional filters for limit, hostId, severity
 * @returns Array of Zabbix events
 */
export async function getAlertHistory(
  tenantId: string,
  instanceId: string,
  filters?: AlertHistoryFilters,
): Promise<ZabbixEvent[]> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  const params: Record<string, unknown> = {
    source: 0, // triggers
    object: 0, // triggers
    limit: filters?.limit ?? 100,
  }

  if (filters?.hostId) {
    params['hostids'] = filters.hostId
  }

  if (filters?.severity) {
    params['severities'] = [parseInt(filters.severity, 10)]
  }

  return zabbixService.getEvents(params)
}

// ---------------------------------------------------------------------------
// Correlation Rules CRUD
// ---------------------------------------------------------------------------

export interface CreateCorrelationRuleBody {
  name: string
  type: RuleType
  conditions: Record<string, unknown>
  timeWindow?: number | undefined
  priority?: number | undefined
  isActive?: boolean | undefined
}

/**
 * Creates a new correlation rule for a tenant.
 *
 * @param tenantId - Tenant ID
 * @param body - Rule configuration
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 * @returns Created correlation rule
 */
export async function createCorrelationRule(
  tenantId: string,
  body: CreateCorrelationRuleBody,
  userId: string,
  ipAddress: string,
) {
  const rule = await prisma.correlationRule.create({
    data: {
      tenantId,
      name: body.name,
      type: body.type,
      conditions: body.conditions as object,
      timeWindow: body.timeWindow ?? 120,
      priority: body.priority ?? 0,
      isActive: body.isActive ?? true,
    },
  })

  await logAction({
    tenantId,
    userId,
    action: 'CREATE_CORRELATION_RULE',
    entityType: 'correlationRule',
    entityId: rule.id,
    after: rule as unknown as Record<string, unknown>,
    ipAddress,
  })

  return rule
}

/**
 * Lists all correlation rules for a tenant.
 *
 * @param tenantId - Tenant ID
 * @returns Array of correlation rules
 */
export async function listCorrelationRules(tenantId: string) {
  return prisma.correlationRule.findMany({
    where: { tenantId },
    orderBy: { priority: 'desc' },
  })
}

export interface UpdateCorrelationRuleBody {
  name?: string | undefined
  type?: RuleType | undefined
  conditions?: Record<string, unknown> | undefined
  timeWindow?: number | undefined
  priority?: number | undefined
  isActive?: boolean | undefined
}

/**
 * Updates a correlation rule.
 *
 * @param tenantId - Tenant ID
 * @param ruleId - Rule ID
 * @param body - Fields to update
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 * @returns Updated rule
 */
export async function updateCorrelationRule(
  tenantId: string,
  ruleId: string,
  body: UpdateCorrelationRuleBody,
  userId: string,
  ipAddress: string,
) {
  const existing = await prisma.correlationRule.findFirst({
    where: { id: ruleId, tenantId },
  })

  if (!existing) {
    throw new AppError(ERR_ALERT_RULE_NOT_FOUND, 404, 'Correlation rule not found')
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data['name'] = body.name
  if (body.type !== undefined) data['type'] = body.type
  if (body.conditions !== undefined) data['conditions'] = body.conditions as object
  if (body.timeWindow !== undefined) data['timeWindow'] = body.timeWindow
  if (body.priority !== undefined) data['priority'] = body.priority
  if (body.isActive !== undefined) data['isActive'] = body.isActive

  const rule = await prisma.correlationRule.update({
    where: { id: ruleId },
    data,
  })

  await logAction({
    tenantId,
    userId,
    action: 'UPDATE_CORRELATION_RULE',
    entityType: 'correlationRule',
    entityId: ruleId,
    before: existing as unknown as Record<string, unknown>,
    after: rule as unknown as Record<string, unknown>,
    ipAddress,
  })

  return rule
}

/**
 * Deletes a correlation rule.
 *
 * @param tenantId - Tenant ID
 * @param ruleId - Rule ID
 * @param userId - Acting user ID (for audit)
 * @param ipAddress - Client IP (for audit)
 */
export async function deleteCorrelationRule(
  tenantId: string,
  ruleId: string,
  userId: string,
  ipAddress: string,
): Promise<void> {
  const existing = await prisma.correlationRule.findFirst({
    where: { id: ruleId, tenantId },
  })

  if (!existing) {
    throw new AppError(ERR_ALERT_RULE_NOT_FOUND, 404, 'Correlation rule not found')
  }

  await prisma.correlationRule.delete({ where: { id: ruleId } })

  await logAction({
    tenantId,
    userId,
    action: 'DELETE_CORRELATION_RULE',
    entityType: 'correlationRule',
    entityId: ruleId,
    before: existing as unknown as Record<string, unknown>,
    ipAddress,
  })
}

// ---------------------------------------------------------------------------
// Noisy Triggers
// ---------------------------------------------------------------------------

/**
 * Identifies noisy triggers from a Zabbix instance's recent event history.
 *
 * @param tenantId - Tenant ID
 * @param instanceId - Zabbix instance ID
 * @returns Array of noisy trigger recommendations
 */
export async function getNoisyTriggers(
  tenantId: string,
  instanceId: string,
): Promise<NoisyTrigger[]> {
  const zabbixService = await getZabbixService(tenantId, instanceId)

  // Fetch recent events (last 7 days worth, up to 1000)
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
  const events = await zabbixService.getEvents({
    source: 0,
    object: 0,
    time_from: sevenDaysAgo,
    limit: 1000,
    sortfield: ['clock'],
    sortorder: 'DESC',
  })

  const history: AlertHistoryEntry[] = events.map((e) => ({
    triggerId: e.objectid,
    firedAt: new Date(parseInt(e.clock, 10) * 1000),
    resolved: e.value === '0',
  }))

  return scoringEngine.findNoisyTriggers(history)
}
