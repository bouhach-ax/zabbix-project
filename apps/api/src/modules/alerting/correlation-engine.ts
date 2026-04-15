import { randomUUID } from 'crypto'
import type { RuleType } from '@prisma/client'
import type { ZabbixTrigger } from '../../integrations/zabbix/zabbix-types.js'

export interface CorrelatedIncident {
  id: string
  rootCause?: string | undefined
  alerts: ZabbixTrigger[]
  alertIds: string[]
  correlationType: RuleType
  confidence: number
  createdAt: Date
}

export interface NetworkTopology {
  /** Map of hostid to network segment identifier (e.g., '192.168.1') */
  segments: Record<string, string>
}

export interface CorrelationRuleConfig {
  type: RuleType
  timeWindow: number
  conditions: Record<string, unknown>
  isActive: boolean
  priority?: number
}

/**
 * Groups alerts into correlated incidents.
 * Applies rules in order: topological, temporal, tag-based.
 * Unmatched alerts become individual incidents.
 */
export class CorrelationEngine {
  /**
   * Correlates a list of active alerts into grouped incidents.
   *
   * @param alerts - Active Zabbix triggers with host info
   * @param rules - Correlation rules from the tenant's configuration
   * @param topology - Optional network topology for topological rules
   * @returns Array of correlated incidents
   */
  correlate(
    alerts: ZabbixTrigger[],
    rules: CorrelationRuleConfig[],
    topology?: NetworkTopology,
  ): CorrelatedIncident[] {
    if (alerts.length === 0) return []

    const sortedRules = [...rules]
      .filter((r) => r.isActive)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

    const matchedTriggerIds = new Set<string>()
    const incidents: CorrelatedIncident[] = []

    for (const rule of sortedRules) {
      const unmatched = alerts.filter((a) => !matchedTriggerIds.has(a.triggerid))
      if (unmatched.length === 0) break

      let groups: ZabbixTrigger[][]

      switch (rule.type) {
        case 'TOPOLOGICAL':
          groups = this.groupByTopology(unmatched, rule, topology)
          break
        case 'TEMPORAL':
          groups = this.groupByTime(unmatched, rule)
          break
        case 'TAG_BASED':
          groups = this.groupByTags(unmatched, rule)
          break
        default:
          groups = []
          break
      }

      for (const group of groups) {
        if (group.length < 2) continue

        const rootCauseAlert = this.findRootCause(group)
        const confidence = this.calculateConfidence(rule.type, group.length, alerts.length)

        const incident: CorrelatedIncident = {
          id: randomUUID(),
          rootCause: rootCauseAlert?.hosts?.[0]?.hostid,
          alerts: group,
          alertIds: group.map((a) => a.triggerid),
          correlationType: rule.type,
          confidence,
          createdAt: new Date(),
        }

        incidents.push(incident)
        for (const a of group) {
          matchedTriggerIds.add(a.triggerid)
        }
      }
    }

    // Remaining unmatched alerts become individual incidents
    for (const alert of alerts) {
      if (matchedTriggerIds.has(alert.triggerid)) continue
      incidents.push({
        id: randomUUID(),
        rootCause: alert.hosts?.[0]?.hostid,
        alerts: [alert],
        alertIds: [alert.triggerid],
        correlationType: 'CUSTOM',
        confidence: 1.0,
        createdAt: new Date(),
      })
    }

    return incidents
  }

  /**
   * Groups alerts by network segment using the topology map.
   * Only groups alerts whose hosts share the same segment and fired within timeWindow.
   */
  private groupByTopology(
    alerts: ZabbixTrigger[],
    rule: CorrelationRuleConfig,
    topology?: NetworkTopology,
  ): ZabbixTrigger[][] {
    if (!topology?.segments) return []

    const segmentMap = new Map<string, ZabbixTrigger[]>()

    for (const alert of alerts) {
      const hostId = alert.hosts?.[0]?.hostid
      if (!hostId) continue

      const segment = topology.segments[hostId]
      if (!segment) continue

      const existing = segmentMap.get(segment) ?? []
      existing.push(alert)
      segmentMap.set(segment, existing)
    }

    // Filter groups by timeWindow
    const groups: ZabbixTrigger[][] = []
    for (const segmentAlerts of segmentMap.values()) {
      const withinWindow = this.filterByTimeWindow(segmentAlerts, rule.timeWindow)
      if (withinWindow.length >= 2) {
        groups.push(withinWindow)
      }
    }

    return groups
  }

  /**
   * Groups alerts that fired within timeWindow seconds of each other.
   * Uses a sliding window approach over sorted timestamps.
   */
  private groupByTime(
    alerts: ZabbixTrigger[],
    rule: CorrelationRuleConfig,
  ): ZabbixTrigger[][] {
    if (alerts.length < 2) return []

    const sorted = [...alerts].sort(
      (a, b) => parseInt(a.lastchange, 10) - parseInt(b.lastchange, 10),
    )

    const groups: ZabbixTrigger[][] = []
    const used = new Set<string>()

    for (let i = 0; i < sorted.length; i++) {
      const anchor = sorted[i]!
      if (used.has(anchor.triggerid)) continue

      const anchorTime = parseInt(anchor.lastchange, 10)
      const group: ZabbixTrigger[] = [anchor]

      for (let j = i + 1; j < sorted.length; j++) {
        const candidate = sorted[j]!
        if (used.has(candidate.triggerid)) continue

        const candidateTime = parseInt(candidate.lastchange, 10)
        if (candidateTime - anchorTime <= rule.timeWindow) {
          group.push(candidate)
        } else {
          break
        }
      }

      if (group.length >= 2) {
        groups.push(group)
        for (const a of group) {
          used.add(a.triggerid)
        }
      }
    }

    return groups
  }

  /**
   * Groups alerts sharing the same tag value for a specified tag key.
   */
  private groupByTags(
    alerts: ZabbixTrigger[],
    rule: CorrelationRuleConfig,
  ): ZabbixTrigger[][] {
    const tagKey = (rule.conditions?.['tagKey'] as string) ?? ''
    if (!tagKey) return []

    const tagMap = new Map<string, ZabbixTrigger[]>()

    for (const alert of alerts) {
      const matchTag = alert.tags?.find((t) => t.tag === tagKey)
      if (!matchTag) continue

      const existing = tagMap.get(matchTag.value) ?? []
      existing.push(alert)
      tagMap.set(matchTag.value, existing)
    }

    return [...tagMap.values()].filter((g) => g.length >= 2)
  }

  /**
   * Filters alerts to only include those within the time window (seconds).
   * Uses the earliest alert as anchor.
   */
  private filterByTimeWindow(alerts: ZabbixTrigger[], windowSec: number): ZabbixTrigger[] {
    if (alerts.length === 0) return []

    const sorted = [...alerts].sort(
      (a, b) => parseInt(a.lastchange, 10) - parseInt(b.lastchange, 10),
    )
    const earliest = parseInt(sorted[0]!.lastchange, 10)

    return sorted.filter((a) => parseInt(a.lastchange, 10) - earliest <= windowSec)
  }

  /**
   * Finds the root cause alert (highest severity/priority) in a group.
   */
  private findRootCause(alerts: ZabbixTrigger[]): ZabbixTrigger | undefined {
    return [...alerts].sort(
      (a, b) => parseInt(b.priority, 10) - parseInt(a.priority, 10),
    )[0]
  }

  /**
   * Calculates confidence score for a correlation.
   */
  private calculateConfidence(
    type: RuleType,
    groupSize: number,
    totalAlerts: number,
  ): number {
    switch (type) {
      case 'TOPOLOGICAL':
        return 0.8
      case 'TEMPORAL':
        return Math.min(1.0, 0.6 + 0.1 * (groupSize / Math.max(totalAlerts, 1)))
      case 'TAG_BASED':
        return 0.7
      default:
        return 0.5
    }
  }
}
