import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CorrelationEngine, type CorrelationRuleConfig, type NetworkTopology } from './correlation-engine.js'
import { ScoringEngine, type AlertContext, type AlertHistoryEntry } from './scoring-engine.js'
import type { ZabbixTrigger } from '../../integrations/zabbix/zabbix-types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock ZabbixTrigger for testing. */
function makeTrigger(overrides: Partial<ZabbixTrigger> & { triggerid: string }): ZabbixTrigger {
  return {
    description: `Trigger ${overrides.triggerid}`,
    expression: `last(/template/item.key)=0`,
    priority: '3',
    status: '0',
    value: '1',
    lastchange: String(Math.floor(Date.now() / 1000)),
    hosts: [{ hostid: `host-${overrides.triggerid}`, host: `srv-${overrides.triggerid}`, name: `Server ${overrides.triggerid}` }],
    tags: [],
    ...overrides,
  }
}

/** Creates N alerts in the same /24 subnet within a short time window. */
function makeAlertStorm(count: number, baseTimestamp: number, segment: string): {
  alerts: ZabbixTrigger[]
  topology: NetworkTopology
} {
  const alerts: ZabbixTrigger[] = []
  const segments: Record<string, string> = {}

  for (let i = 0; i < count; i++) {
    const hostId = `host-storm-${i}`
    alerts.push(
      makeTrigger({
        triggerid: `trigger-storm-${i}`,
        priority: i === 0 ? '5' : '3', // First one is DISASTER severity
        lastchange: String(baseTimestamp + i * 2), // 2-second spacing
        hosts: [{ hostid: hostId, host: `srv-${i}.example.com`, name: `Server ${i}` }],
        tags: [{ tag: 'network_segment', value: segment }],
      }),
    )
    segments[hostId] = segment
  }

  return { alerts, topology: { segments } }
}

// ===========================================================================
// Correlation Engine
// ===========================================================================

describe('Correlation Engine', () => {
  let engine: CorrelationEngine

  beforeEach(() => {
    engine = new CorrelationEngine()
  })

  describe('correlate', () => {
    it('groups alerts from same network segment (topological)', () => {
      const baseTime = Math.floor(Date.now() / 1000)
      const topology: NetworkTopology = {
        segments: {
          'h1': '192.168.1',
          'h2': '192.168.1',
          'h3': '192.168.2',
        },
      }

      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime), hosts: [{ hostid: 'h1', host: 'srv1', name: 'srv1' }] }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 10), hosts: [{ hostid: 'h2', host: 'srv2', name: 'srv2' }] }),
        makeTrigger({ triggerid: 't3', lastchange: String(baseTime + 20), hosts: [{ hostid: 'h3', host: 'srv3', name: 'srv3' }] }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true, priority: 10 },
      ]

      const incidents = engine.correlate(alerts, rules, topology)

      // h1 and h2 in same segment should be grouped
      const groupedIncident = incidents.find((inc) => inc.alertIds.length === 2)
      expect(groupedIncident).toBeDefined()
      expect(groupedIncident!.alertIds).toContain('t1')
      expect(groupedIncident!.alertIds).toContain('t2')
      expect(groupedIncident!.correlationType).toBe('TOPOLOGICAL')

      // h3 in different segment should be individual
      const singleIncident = incidents.find((inc) => inc.alertIds.includes('t3'))
      expect(singleIncident).toBeDefined()
      expect(singleIncident!.alertIds).toHaveLength(1)
    })

    it('groups alerts within time window (temporal)', () => {
      const baseTime = 1700000000
      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime) }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 30) }),
        makeTrigger({ triggerid: 't3', lastchange: String(baseTime + 60) }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TEMPORAL', timeWindow: 120, conditions: {}, isActive: true, priority: 5 },
      ]

      const incidents = engine.correlate(alerts, rules)

      // All 3 should be grouped (within 120s)
      const grouped = incidents.find((inc) => inc.alertIds.length === 3)
      expect(grouped).toBeDefined()
      expect(grouped!.correlationType).toBe('TEMPORAL')
    })

    it('groups alerts by matching tags (tag-based)', () => {
      const alerts = [
        makeTrigger({
          triggerid: 't1',
          tags: [{ tag: 'service', value: 'payment-api' }],
        }),
        makeTrigger({
          triggerid: 't2',
          tags: [{ tag: 'service', value: 'payment-api' }],
        }),
        makeTrigger({
          triggerid: 't3',
          tags: [{ tag: 'service', value: 'auth-api' }],
        }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TAG_BASED', timeWindow: 120, conditions: { tagKey: 'service' }, isActive: true, priority: 5 },
      ]

      const incidents = engine.correlate(alerts, rules)

      const paymentGroup = incidents.find(
        (inc) => inc.alertIds.includes('t1') && inc.alertIds.includes('t2'),
      )
      expect(paymentGroup).toBeDefined()
      expect(paymentGroup!.correlationType).toBe('TAG_BASED')

      // auth-api has only 1 alert, so it becomes an individual incident
      const authIncident = incidents.find((inc) => inc.alertIds.includes('t3'))
      expect(authIncident).toBeDefined()
      expect(authIncident!.alertIds).toHaveLength(1)
    })

    it('returns individual incidents for unmatched alerts', () => {
      const alerts = [
        makeTrigger({ triggerid: 't1' }),
        makeTrigger({ triggerid: 't2' }),
      ]

      // No active rules
      const incidents = engine.correlate(alerts, [])

      expect(incidents).toHaveLength(2)
      incidents.forEach((inc) => {
        expect(inc.alertIds).toHaveLength(1)
      })
    })

    it('identifies root cause as highest severity alert', () => {
      const baseTime = 1700000000
      const topology: NetworkTopology = {
        segments: { 'h1': '10.0.1', 'h2': '10.0.1', 'h3': '10.0.1' },
      }

      const alerts = [
        makeTrigger({ triggerid: 't1', priority: '2', lastchange: String(baseTime), hosts: [{ hostid: 'h1', host: 's1', name: 's1' }] }),
        makeTrigger({ triggerid: 't2', priority: '5', lastchange: String(baseTime + 5), hosts: [{ hostid: 'h2', host: 's2', name: 's2' }] }),
        makeTrigger({ triggerid: 't3', priority: '3', lastchange: String(baseTime + 10), hosts: [{ hostid: 'h3', host: 's3', name: 's3' }] }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true, priority: 10 },
      ]

      const incidents = engine.correlate(alerts, rules, topology)
      const grouped = incidents.find((inc) => inc.alertIds.length === 3)
      expect(grouped).toBeDefined()
      // Root cause should be h2 (priority 5 = highest)
      expect(grouped!.rootCause).toBe('h2')
    })

    it('applies rules in priority order', () => {
      const baseTime = 1700000000
      const topology: NetworkTopology = {
        segments: { 'h1': '10.0.1', 'h2': '10.0.1' },
      }

      const alerts = [
        makeTrigger({
          triggerid: 't1',
          lastchange: String(baseTime),
          hosts: [{ hostid: 'h1', host: 's1', name: 's1' }],
          tags: [{ tag: 'service', value: 'db' }],
        }),
        makeTrigger({
          triggerid: 't2',
          lastchange: String(baseTime + 5),
          hosts: [{ hostid: 'h2', host: 's2', name: 's2' }],
          tags: [{ tag: 'service', value: 'db' }],
        }),
      ]

      // Topological has higher priority, should match first
      const rules: CorrelationRuleConfig[] = [
        { type: 'TAG_BASED', timeWindow: 120, conditions: { tagKey: 'service' }, isActive: true, priority: 1 },
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true, priority: 10 },
      ]

      const incidents = engine.correlate(alerts, rules, topology)
      const grouped = incidents.find((inc) => inc.alertIds.length === 2)
      expect(grouped).toBeDefined()
      expect(grouped!.correlationType).toBe('TOPOLOGICAL')
    })

    it('returns empty array for empty alerts', () => {
      const incidents = engine.correlate([], [])
      expect(incidents).toEqual([])
    })

    it('skips inactive rules', () => {
      const baseTime = 1700000000
      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime) }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 5) }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TEMPORAL', timeWindow: 120, conditions: {}, isActive: false, priority: 5 },
      ]

      const incidents = engine.correlate(alerts, rules)
      // All should be individual since the only rule is inactive
      expect(incidents).toHaveLength(2)
      incidents.forEach((inc) => expect(inc.alertIds).toHaveLength(1))
    })
  })

  describe('temporal correlation', () => {
    it('groups alerts within 120s window by default', () => {
      const baseTime = 1700000000
      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime) }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 100) }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TEMPORAL', timeWindow: 120, conditions: {}, isActive: true },
      ]

      const incidents = engine.correlate(alerts, rules)
      const grouped = incidents.find((inc) => inc.alertIds.length === 2)
      expect(grouped).toBeDefined()
    })

    it('does not group alerts outside window', () => {
      const baseTime = 1700000000
      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime) }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 300) }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TEMPORAL', timeWindow: 120, conditions: {}, isActive: true },
      ]

      const incidents = engine.correlate(alerts, rules)
      // Both should be individual since they are 300s apart
      expect(incidents).toHaveLength(2)
      incidents.forEach((inc) => expect(inc.alertIds).toHaveLength(1))
    })
  })

  describe('topological correlation', () => {
    it('groups alerts in same /24 segment', () => {
      const baseTime = 1700000000
      const topology: NetworkTopology = {
        segments: { 'h1': '192.168.1', 'h2': '192.168.1' },
      }

      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime), hosts: [{ hostid: 'h1', host: 'a', name: 'a' }] }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 10), hosts: [{ hostid: 'h2', host: 'b', name: 'b' }] }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true },
      ]

      const incidents = engine.correlate(alerts, rules, topology)
      const grouped = incidents.find((inc) => inc.alertIds.length === 2)
      expect(grouped).toBeDefined()
    })

    it('does not group alerts in different segments', () => {
      const baseTime = 1700000000
      const topology: NetworkTopology = {
        segments: { 'h1': '192.168.1', 'h2': '10.0.2' },
      }

      const alerts = [
        makeTrigger({ triggerid: 't1', lastchange: String(baseTime), hosts: [{ hostid: 'h1', host: 'a', name: 'a' }] }),
        makeTrigger({ triggerid: 't2', lastchange: String(baseTime + 10), hosts: [{ hostid: 'h2', host: 'b', name: 'b' }] }),
      ]

      const rules: CorrelationRuleConfig[] = [
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true },
      ]

      const incidents = engine.correlate(alerts, rules, topology)
      expect(incidents).toHaveLength(2)
      incidents.forEach((inc) => expect(inc.alertIds).toHaveLength(1))
    })
  })

  // -----------------------------------------------------------------------
  // Alert Storm Scenario: 20 alerts in same subnet within 60s
  // -----------------------------------------------------------------------
  describe('alert storm scenario', () => {
    it('groups 20 alerts from same /24 subnet into 1 correlated incident', () => {
      const baseTime = 1700000000
      const { alerts, topology } = makeAlertStorm(20, baseTime, '192.168.10')

      const rules: CorrelationRuleConfig[] = [
        { type: 'TOPOLOGICAL', timeWindow: 120, conditions: {}, isActive: true, priority: 10 },
      ]

      const incidents = engine.correlate(alerts, rules, topology)

      // All 20 alerts should be in a single correlated incident
      const grouped = incidents.find((inc) => inc.alertIds.length === 20)
      expect(grouped).toBeDefined()
      expect(grouped!.correlationType).toBe('TOPOLOGICAL')
      expect(grouped!.confidence).toBe(0.8) // Topological confidence

      // Root cause should be the DISASTER severity alert (first one, priority 5)
      expect(grouped!.rootCause).toBe('host-storm-0')
    })
  })
})

// ===========================================================================
// Scoring Engine
// ===========================================================================

describe('Scoring Engine', () => {
  let engine: ScoringEngine

  beforeEach(() => {
    engine = new ScoringEngine()
  })

  describe('score', () => {
    it('returns severity-only score during cold start (< 14 days)', () => {
      const recentTenant = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
      const context: AlertContext = {
        tenantCreatedAt: recentTenant,
        triggerHistory: [],
        serviceImportance: 0.8,
      }

      const alert = makeTrigger({ triggerid: 't1', priority: '5' })
      const score = engine.score(alert, context)
      // During cold start: (5/5) * 100 = 100
      expect(score).toBe(100)
    })

    it('returns severity-only score during cold start with low priority', () => {
      const recentTenant = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      const context: AlertContext = {
        tenantCreatedAt: recentTenant,
        triggerHistory: [],
        serviceImportance: 0.5,
      }

      const alert = makeTrigger({ triggerid: 't1', priority: '2' })
      const score = engine.score(alert, context)
      // During cold start: (2/5) * 100 = 40
      expect(score).toBe(40)
    })

    it('calculates weighted score: severity 40%, importance 30%, frequency 30%', () => {
      const oldTenant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      const context: AlertContext = {
        tenantCreatedAt: oldTenant,
        triggerHistory: [], // No history = high inverse frequency
        serviceImportance: 1.0,
      }

      const alert = makeTrigger({ triggerid: 't1', priority: '5' })
      const score = engine.score(alert, context)
      // severity: 100 * 0.4 = 40
      // importance: 100 * 0.3 = 30
      // frequency: 100 * 0.3 = 30 (no history means inverseFreq = 100)
      expect(score).toBe(100)
    })

    it('gives highest score to severity 5 disaster alerts', () => {
      const oldTenant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const context: AlertContext = {
        tenantCreatedAt: oldTenant,
        triggerHistory: [],
        serviceImportance: 0.5,
      }

      const sev5 = makeTrigger({ triggerid: 't5', priority: '5' })
      const sev1 = makeTrigger({ triggerid: 't1', priority: '1' })

      const score5 = engine.score(sev5, context)
      const score1 = engine.score(sev1, context)
      expect(score5).toBeGreaterThan(score1)
    })

    it('lowers score for frequently firing triggers', () => {
      const oldTenant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const now = new Date()

      // Create many history entries for a specific trigger
      const frequentHistory: AlertHistoryEntry[] = Array.from({ length: 8 }, (_, i) => ({
        triggerId: 't-frequent',
        firedAt: new Date(now.getTime() - i * 12 * 60 * 60 * 1000), // every 12 hours
        resolved: true,
      }))

      const context: AlertContext = {
        tenantCreatedAt: oldTenant,
        triggerHistory: frequentHistory,
        serviceImportance: 0.5,
      }

      const frequentAlert = makeTrigger({ triggerid: 't-frequent', priority: '3' })

      const contextNoHistory: AlertContext = {
        tenantCreatedAt: oldTenant,
        triggerHistory: [],
        serviceImportance: 0.5,
      }
      const rareAlert = makeTrigger({ triggerid: 't-rare', priority: '3' })

      const frequentScore = engine.score(frequentAlert, context)
      const rareScore = engine.score(rareAlert, contextNoHistory)

      expect(frequentScore).toBeLessThan(rareScore)
    })

    it('returns 0 for severity 0 with no context', () => {
      const oldTenant = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const context: AlertContext = {
        tenantCreatedAt: oldTenant,
        triggerHistory: [],
        serviceImportance: 0, // No importance
      }

      const alert = makeTrigger({ triggerid: 't1', priority: '0' })
      const score = engine.score(alert, context)
      // severity: 0 * 0.4 = 0
      // importance: 0 * 0.3 = 0
      // frequency inverse: 100 * 0.3 = 30
      expect(score).toBe(30)
    })
  })

  describe('findNoisyTriggers', () => {
    it('identifies triggers firing more than threshold in 7 days', () => {
      const now = new Date()
      const history: AlertHistoryEntry[] = []

      // Trigger 'noisy-1' fires 15 times in 7 days
      for (let i = 0; i < 15; i++) {
        history.push({
          triggerId: 'noisy-1',
          firedAt: new Date(now.getTime() - i * 6 * 60 * 60 * 1000),
          resolved: true,
        })
      }

      // Trigger 'quiet-1' fires 3 times
      for (let i = 0; i < 3; i++) {
        history.push({
          triggerId: 'quiet-1',
          firedAt: new Date(now.getTime() - i * 24 * 60 * 60 * 1000),
          resolved: false,
        })
      }

      const noisy = engine.findNoisyTriggers(history, 10)
      expect(noisy).toHaveLength(1)
      expect(noisy[0]!.triggerId).toBe('noisy-1')
      expect(noisy[0]!.fireCount).toBe(15)
      expect(noisy[0]!.suggestion).toBeDefined()
      expect(noisy[0]!.suggestion.length).toBeGreaterThan(0)
    })

    it('returns empty for low-frequency triggers', () => {
      const now = new Date()
      const history: AlertHistoryEntry[] = [
        { triggerId: 't1', firedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), resolved: true },
        { triggerId: 't2', firedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000), resolved: true },
      ]

      const noisy = engine.findNoisyTriggers(history, 10)
      expect(noisy).toHaveLength(0)
    })

    it('excludes old entries outside the 7-day window', () => {
      const now = new Date()
      const history: AlertHistoryEntry[] = []

      // 15 entries, but all older than 7 days
      for (let i = 0; i < 15; i++) {
        history.push({
          triggerId: 'old-trigger',
          firedAt: new Date(now.getTime() - (8 + i) * 24 * 60 * 60 * 1000),
          resolved: true,
        })
      }

      const noisy = engine.findNoisyTriggers(history, 10)
      expect(noisy).toHaveLength(0)
    })

    it('sorts noisy triggers by fire count descending', () => {
      const now = new Date()
      const history: AlertHistoryEntry[] = []

      for (let i = 0; i < 12; i++) {
        history.push({
          triggerId: 'medium-noisy',
          firedAt: new Date(now.getTime() - i * 8 * 60 * 60 * 1000),
          resolved: true,
        })
      }

      for (let i = 0; i < 20; i++) {
        history.push({
          triggerId: 'very-noisy',
          firedAt: new Date(now.getTime() - i * 4 * 60 * 60 * 1000),
          resolved: false,
        })
      }

      const noisy = engine.findNoisyTriggers(history, 10)
      expect(noisy).toHaveLength(2)
      expect(noisy[0]!.triggerId).toBe('very-noisy')
      expect(noisy[1]!.triggerId).toBe('medium-noisy')
    })
  })

  describe('isColdStart', () => {
    it('returns true for tenant created less than 14 days ago', () => {
      const recentDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
      expect(engine.isColdStart(recentDate)).toBe(true)
    })

    it('returns false for tenant created more than 14 days ago', () => {
      const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
      expect(engine.isColdStart(oldDate)).toBe(false)
    })

    it('returns true at exactly 0 days', () => {
      expect(engine.isColdStart(new Date())).toBe(true)
    })
  })
})

// ===========================================================================
// Alerting Service (mocked DB/Zabbix calls)
// ===========================================================================

vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    correlationRule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    zabbixInstance: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('../../shared/crypto/encryption.js', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

vi.mock('../../shared/cache/redis.js', () => ({
  getRedis: () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() }),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
}))

import { prisma } from '../../shared/database/prisma.js'
import {
  createCorrelationRule,
  listCorrelationRules,
  updateCorrelationRule,
  deleteCorrelationRule,
} from './alerting.service.js'

const mockPrisma = vi.mocked(prisma)

describe('Alerting Service — Correlation Rules CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCorrelationRule', () => {
    it('creates correlation rule', async () => {
      const fakeRule = {
        id: 'rule-1',
        tenantId: 'tenant-1',
        name: 'Network storm rule',
        type: 'TOPOLOGICAL' as const,
        conditions: { subnet: '192.168.1' },
        timeWindow: 120,
        priority: 5,
        isActive: true,
        createdAt: new Date(),
      }

      mockPrisma.correlationRule.create.mockResolvedValue(fakeRule)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await createCorrelationRule(
        'tenant-1',
        {
          name: 'Network storm rule',
          type: 'TOPOLOGICAL',
          conditions: { subnet: '192.168.1' },
          timeWindow: 120,
          priority: 5,
        },
        'user-1',
        '127.0.0.1',
      )

      expect(result).toEqual(fakeRule)
      expect(mockPrisma.correlationRule.create).toHaveBeenCalledOnce()
      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
    })
  })

  describe('listCorrelationRules', () => {
    it('lists correlation rules', async () => {
      const fakeRules = [
        { id: 'rule-1', tenantId: 'tenant-1', name: 'Rule A', type: 'TEMPORAL', priority: 10 },
        { id: 'rule-2', tenantId: 'tenant-1', name: 'Rule B', type: 'TOPOLOGICAL', priority: 5 },
      ]

      mockPrisma.correlationRule.findMany.mockResolvedValue(fakeRules as any)

      const result = await listCorrelationRules('tenant-1')
      expect(result).toEqual(fakeRules)
      expect(mockPrisma.correlationRule.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1' },
        orderBy: { priority: 'desc' },
      })
    })
  })

  describe('updateCorrelationRule', () => {
    it('updates correlation rule', async () => {
      const existing = {
        id: 'rule-1',
        tenantId: 'tenant-1',
        name: 'Old name',
        type: 'TEMPORAL',
        conditions: {},
        timeWindow: 120,
        priority: 5,
        isActive: true,
        createdAt: new Date(),
      }
      const updated = { ...existing, name: 'New name' }

      mockPrisma.correlationRule.findFirst.mockResolvedValue(existing as any)
      mockPrisma.correlationRule.update.mockResolvedValue(updated as any)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await updateCorrelationRule(
        'tenant-1',
        'rule-1',
        { name: 'New name' },
        'user-1',
        '127.0.0.1',
      )

      expect(result.name).toBe('New name')
      expect(mockPrisma.correlationRule.update).toHaveBeenCalledOnce()
    })

    it('throws when rule not found', async () => {
      mockPrisma.correlationRule.findFirst.mockResolvedValue(null)

      await expect(
        updateCorrelationRule('tenant-1', 'nonexistent', { name: 'X' }, 'user-1', '127.0.0.1'),
      ).rejects.toThrow('Correlation rule not found')
    })
  })

  describe('deleteCorrelationRule', () => {
    it('deletes correlation rule', async () => {
      const existing = {
        id: 'rule-1',
        tenantId: 'tenant-1',
        name: 'Rule to delete',
        type: 'TEMPORAL',
        conditions: {},
        timeWindow: 120,
        priority: 5,
        isActive: true,
        createdAt: new Date(),
      }

      mockPrisma.correlationRule.findFirst.mockResolvedValue(existing as any)
      mockPrisma.correlationRule.delete.mockResolvedValue(existing as any)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      await expect(
        deleteCorrelationRule('tenant-1', 'rule-1', 'user-1', '127.0.0.1'),
      ).resolves.not.toThrow()

      expect(mockPrisma.correlationRule.delete).toHaveBeenCalledWith({ where: { id: 'rule-1' } })
    })

    it('throws when rule not found', async () => {
      mockPrisma.correlationRule.findFirst.mockResolvedValue(null)

      await expect(
        deleteCorrelationRule('tenant-1', 'nonexistent', 'user-1', '127.0.0.1'),
      ).rejects.toThrow('Correlation rule not found')
    })
  })
})
