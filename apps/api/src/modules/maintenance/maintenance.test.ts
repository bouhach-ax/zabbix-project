import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
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

const mockCreateMaintenance = vi.fn()
const mockGetMaintenances = vi.fn()
const mockDeleteMaintenance = vi.fn()
const mockUpdateMaintenance = vi.fn()

vi.mock('../../integrations/zabbix/ZabbixApiService.js', () => ({
  ZabbixApiService: vi.fn().mockImplementation(() => ({
    createMaintenance: mockCreateMaintenance,
    getMaintenances: mockGetMaintenances,
    deleteMaintenance: mockDeleteMaintenance,
    updateMaintenance: mockUpdateMaintenance,
  })),
}))

import { prisma } from '../../shared/database/prisma.js'
import {
  createMaintenance,
  listMaintenances,
  deleteMaintenance,
} from './maintenance.service.js'

const mockPrisma = vi.mocked(prisma)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupInstanceMock() {
  mockPrisma.zabbixInstance.findFirst.mockResolvedValue({
    id: 'inst-1',
    tenantId: 'tenant-1',
    label: 'Production Zabbix',
    apiUrl: 'https://zabbix.example.com',
    apiTokenEncrypted: 'encrypted:secret-token',
    version: '6.4',
    isActive: true,
    lastHealthCheck: null,
    healthStatus: null,
    createdAt: new Date(),
  } as any)
}

// ===========================================================================
// Maintenance Service
// ===========================================================================

describe('Maintenance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupInstanceMock()
    mockPrisma.auditLog.create.mockResolvedValue({} as any)
  })

  // -----------------------------------------------------------------------
  // createMaintenance
  // -----------------------------------------------------------------------
  describe('createMaintenance', () => {
    it('creates maintenance period in Zabbix', async () => {
      mockCreateMaintenance.mockResolvedValue('maint-42')

      const result = await createMaintenance(
        'tenant-1',
        'inst-1',
        {
          name: 'Planned OS Upgrade',
          activeSince: 1700000000,
          activeTill: 1700003600,
          hostIds: ['zbx-host-1', 'zbx-host-2'],
          description: 'Upgrading RHEL 8 to RHEL 9',
          maintenanceType: 0,
        },
        'user-1',
        '10.0.0.1',
      )

      expect(result.maintenanceId).toBe('maint-42')
      expect(mockCreateMaintenance).toHaveBeenCalledOnce()

      const callArgs = mockCreateMaintenance.mock.calls[0]![0]
      expect(callArgs.name).toBe('Planned OS Upgrade')
      expect(callArgs.active_since).toBe(1700000000)
      expect(callArgs.active_till).toBe(1700003600)
      expect(callArgs.hostids).toEqual(['zbx-host-1', 'zbx-host-2'])
      expect(callArgs.timeperiods).toHaveLength(1)
      expect(callArgs.timeperiods[0].period).toBe(3600) // 1 hour
    })

    it('logs audit entry', async () => {
      mockCreateMaintenance.mockResolvedValue('maint-42')

      await createMaintenance(
        'tenant-1',
        'inst-1',
        {
          name: 'Patch window',
          activeSince: 1700000000,
          activeTill: 1700003600,
          hostIds: ['zbx-host-1'],
        },
        'user-1',
        '10.0.0.1',
      )

      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
      const auditData = (mockPrisma.auditLog.create.mock.calls[0]![0] as any).data
      expect(auditData.action).toBe('CREATE_MAINTENANCE')
      expect(auditData.entityType).toBe('maintenance')
      expect(auditData.entityId).toBe('maint-42')
    })

    it('converts ISO date strings to epoch', async () => {
      mockCreateMaintenance.mockResolvedValue('maint-43')

      await createMaintenance(
        'tenant-1',
        'inst-1',
        {
          name: 'Date string test',
          activeSince: '2024-01-15T10:00:00Z',
          activeTill: '2024-01-15T12:00:00Z',
          hostIds: ['zbx-host-1'],
        },
        'user-1',
        '10.0.0.1',
      )

      const callArgs = mockCreateMaintenance.mock.calls[0]![0]
      expect(typeof callArgs.active_since).toBe('number')
      expect(typeof callArgs.active_till).toBe('number')
      expect(callArgs.active_till).toBeGreaterThan(callArgs.active_since)
    })

    it('throws when instance not found', async () => {
      mockPrisma.zabbixInstance.findFirst.mockResolvedValue(null)

      await expect(
        createMaintenance(
          'tenant-1',
          'nonexistent',
          {
            name: 'Test',
            activeSince: 1700000000,
            activeTill: 1700003600,
            hostIds: ['h1'],
          },
          'user-1',
          '127.0.0.1',
        ),
      ).rejects.toThrow('Zabbix instance not found')
    })
  })

  // -----------------------------------------------------------------------
  // listMaintenances
  // -----------------------------------------------------------------------
  describe('listMaintenances', () => {
    it('returns maintenance list from Zabbix', async () => {
      const fakeMaintList = [
        {
          maintenanceid: 'maint-1',
          name: 'Weekly patch window',
          active_since: '1700000000',
          active_till: '1700014400',
          maintenance_type: '0',
        },
        {
          maintenanceid: 'maint-2',
          name: 'Emergency fix',
          active_since: '1700100000',
          active_till: '1700103600',
          maintenance_type: '1',
        },
      ]

      mockGetMaintenances.mockResolvedValue(fakeMaintList)

      const result = await listMaintenances('tenant-1', 'inst-1')

      expect(result).toHaveLength(2)
      expect(result[0]!.name).toBe('Weekly patch window')
      expect(result[1]!.maintenanceid).toBe('maint-2')
      expect(mockGetMaintenances).toHaveBeenCalledOnce()
    })

    it('returns empty array when no maintenances exist', async () => {
      mockGetMaintenances.mockResolvedValue([])

      const result = await listMaintenances('tenant-1', 'inst-1')
      expect(result).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // deleteMaintenance
  // -----------------------------------------------------------------------
  describe('deleteMaintenance', () => {
    it('deletes maintenance from Zabbix', async () => {
      mockGetMaintenances.mockResolvedValue([
        {
          maintenanceid: 'maint-42',
          name: 'Old maintenance',
          active_since: '1700000000',
          active_till: '1700003600',
          maintenance_type: '0',
        },
      ])
      mockDeleteMaintenance.mockResolvedValue(undefined)

      await expect(
        deleteMaintenance('tenant-1', 'inst-1', 'maint-42', 'user-1', '10.0.0.1'),
      ).resolves.not.toThrow()

      expect(mockDeleteMaintenance).toHaveBeenCalledWith('maint-42')
    })

    it('logs audit entry', async () => {
      mockGetMaintenances.mockResolvedValue([
        {
          maintenanceid: 'maint-42',
          name: 'Old maintenance',
          active_since: '1700000000',
          active_till: '1700003600',
        },
      ])
      mockDeleteMaintenance.mockResolvedValue(undefined)

      await deleteMaintenance('tenant-1', 'inst-1', 'maint-42', 'user-1', '10.0.0.1')

      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
      const auditData = (mockPrisma.auditLog.create.mock.calls[0]![0] as any).data
      expect(auditData.action).toBe('DELETE_MAINTENANCE')
      expect(auditData.entityId).toBe('maint-42')
      // before should contain the old maintenance data
      expect(auditData.before).toBeDefined()
    })
  })
})
