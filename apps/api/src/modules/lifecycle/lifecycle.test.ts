import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    managedHost: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    zabbixInstance: {
      findFirst: vi.fn(),
    },
    hostTemplate: {
      count: vi.fn(),
    },
    provisioningJob: {
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

// Mock ZabbixApiService
const mockUpdateHost = vi.fn()
vi.mock('../../integrations/zabbix/ZabbixApiService.js', () => ({
  ZabbixApiService: vi.fn().mockImplementation(() => ({
    updateHost: mockUpdateHost,
    healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.0' }),
  })),
}))

import { prisma } from '../../shared/database/prisma.js'
import {
  decommissionHost,
  getDecommissionPreview,
  detectGhostHosts,
} from './lifecycle.service.js'

const mockPrisma = vi.mocked(prisma)

// ===========================================================================
// Lifecycle Service
// ===========================================================================

describe('Lifecycle Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateHost.mockResolvedValue(undefined)
  })

  // -----------------------------------------------------------------------
  // decommissionHost
  // -----------------------------------------------------------------------
  describe('decommissionHost', () => {
    it('sets host status to DECOMMISSIONED', async () => {
      const activeHost = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        zabbixHostId: null,
        hostname: 'srv01.example.com',
        ipAddress: '192.168.1.10',
        status: 'ACTIVE',
        os: null,
        osVersion: null,
        agentVersion: null,
        agentPort: 10050,
        declaredRole: null,
        location: null,
        tags: [],
        hostGroupIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(activeHost as any)
      mockPrisma.managedHost.update.mockResolvedValue({
        ...activeHost,
        status: 'DECOMMISSIONED',
      } as any)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await decommissionHost('tenant-1', 'host-1', 'user-1', '127.0.0.1')

      expect(result.status).toBe('DECOMMISSIONED')
      expect(mockPrisma.managedHost.update).toHaveBeenCalledWith({
        where: { id: 'host-1' },
        data: { status: 'DECOMMISSIONED' },
      })
    })

    it('disables host in Zabbix when zabbixHostId exists', async () => {
      const hostWithZabbix = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        zabbixHostId: 'zbx-host-42',
        hostname: 'srv01.example.com',
        ipAddress: '192.168.1.10',
        status: 'ACTIVE',
        os: null,
        osVersion: null,
        agentVersion: null,
        agentPort: 10050,
        declaredRole: null,
        location: null,
        tags: [],
        hostGroupIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Mock zabbix instance lookup for getZabbixServiceForInstance
      mockPrisma.zabbixInstance.findFirst.mockResolvedValue({
        id: 'inst-1',
        tenantId: 'tenant-1',
        label: 'Production',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'encrypted:token123',
        version: '6.0',
        isActive: true,
        lastHealthCheck: null,
        healthStatus: null,
        createdAt: new Date(),
      } as any)

      mockPrisma.managedHost.findFirst.mockResolvedValue(hostWithZabbix as any)
      mockPrisma.managedHost.update.mockResolvedValue({
        ...hostWithZabbix,
        status: 'DECOMMISSIONED',
      } as any)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      await decommissionHost('tenant-1', 'host-1', 'user-1', '127.0.0.1')

      // Should have tried to disable in Zabbix (status: 1)
      expect(mockUpdateHost).toHaveBeenCalledWith({
        hostid: 'zbx-host-42',
        status: 1,
      })
    })

    it('throws HOST_003 for already decommissioned host', async () => {
      const decommissionedHost = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        zabbixHostId: null,
        hostname: 'srv01',
        ipAddress: '192.168.1.10',
        status: 'DECOMMISSIONED',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(decommissionedHost as any)

      await expect(
        decommissionHost('tenant-1', 'host-1', 'user-1', '127.0.0.1'),
      ).rejects.toThrow(/Cannot decommission/)
    })

    it('throws HOST_003 for ONBOARDING host', async () => {
      const onboardingHost = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        zabbixHostId: null,
        hostname: 'srv01',
        ipAddress: '192.168.1.10',
        status: 'ONBOARDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(onboardingHost as any)

      await expect(
        decommissionHost('tenant-1', 'host-1', 'user-1', '127.0.0.1'),
      ).rejects.toThrow(/Cannot decommission/)
    })

    it('throws HOST_001 when host not found', async () => {
      mockPrisma.managedHost.findFirst.mockResolvedValue(null)

      await expect(
        decommissionHost('tenant-1', 'nonexistent', 'user-1', '127.0.0.1'),
      ).rejects.toThrow('Host not found')
    })

    it('allows decommission from MAINTENANCE status', async () => {
      const maintenanceHost = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        zabbixHostId: null,
        hostname: 'srv01',
        ipAddress: '192.168.1.10',
        status: 'MAINTENANCE',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(maintenanceHost as any)
      mockPrisma.managedHost.update.mockResolvedValue({
        ...maintenanceHost,
        status: 'DECOMMISSIONED',
      } as any)
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const result = await decommissionHost('tenant-1', 'host-1', 'user-1', '127.0.0.1')
      expect(result.status).toBe('DECOMMISSIONED')
    })
  })

  // -----------------------------------------------------------------------
  // getDecommissionPreview
  // -----------------------------------------------------------------------
  describe('getDecommissionPreview', () => {
    it('returns preview with template count and job status', async () => {
      const hostWithRelations = {
        id: 'host-1',
        tenantId: 'tenant-1',
        zabbixInstanceId: 'inst-1',
        hostname: 'srv01',
        ipAddress: '192.168.1.10',
        status: 'ACTIVE',
        assignedTemplates: [
          { id: 'ht-1', hostId: 'host-1', templateId: 'tpl-1', appliedAt: new Date() },
          { id: 'ht-2', hostId: 'host-1', templateId: 'tpl-2', appliedAt: new Date() },
        ],
        provisioningJob: {
          id: 'job-1',
          hostId: 'host-1',
          status: 'SUCCESS',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(hostWithRelations as any)

      const preview = await getDecommissionPreview('tenant-1', 'host-1')

      expect(preview.linkedTemplates).toBe(2)
      expect(preview.hasActiveJob).toBe(false)
      expect(preview.host.id).toBe('host-1')
    })

    it('detects active provisioning job', async () => {
      const hostWithActiveJob = {
        id: 'host-1',
        tenantId: 'tenant-1',
        hostname: 'srv01',
        ipAddress: '192.168.1.10',
        status: 'ONBOARDING',
        assignedTemplates: [],
        provisioningJob: {
          id: 'job-1',
          hostId: 'host-1',
          status: 'DETECTING',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.managedHost.findFirst.mockResolvedValue(hostWithActiveJob as any)

      const preview = await getDecommissionPreview('tenant-1', 'host-1')

      expect(preview.hasActiveJob).toBe(true)
    })

    it('throws when host not found', async () => {
      mockPrisma.managedHost.findFirst.mockResolvedValue(null)

      await expect(
        getDecommissionPreview('tenant-1', 'nonexistent'),
      ).rejects.toThrow('Host not found')
    })
  })

  // -----------------------------------------------------------------------
  // detectGhostHosts
  // -----------------------------------------------------------------------
  describe('detectGhostHosts', () => {
    it('returns decommissioned hosts with zabbixHostId', async () => {
      const ghostHosts = [
        {
          id: 'host-1',
          hostname: 'srv-old-01',
          zabbixHostId: 'zbx-100',
          zabbixInstanceId: 'inst-1',
          updatedAt: new Date('2024-01-15'),
        },
        {
          id: 'host-2',
          hostname: 'srv-old-02',
          zabbixHostId: 'zbx-101',
          zabbixInstanceId: 'inst-1',
          updatedAt: new Date('2024-01-10'),
        },
      ]

      mockPrisma.managedHost.findMany.mockResolvedValue(ghostHosts as any)

      const result = await detectGhostHosts('tenant-1')

      expect(result).toHaveLength(2)
      expect(result[0]!.hostname).toBe('srv-old-01')
      expect(result[0]!.zabbixHostId).toBe('zbx-100')
      expect(result[1]!.hostname).toBe('srv-old-02')

      // Verify the query filters correctly
      expect(mockPrisma.managedHost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            status: 'DECOMMISSIONED',
            zabbixHostId: { not: null },
          },
        }),
      )
    })

    it('returns empty array when no ghost hosts exist', async () => {
      mockPrisma.managedHost.findMany.mockResolvedValue([])

      const result = await detectGhostHosts('tenant-1')
      expect(result).toHaveLength(0)
    })
  })
})
