import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'

// ─── Mocks ───────────────────────────────────────────────
vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    zabbixInstance: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    managedHost: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    provisioningJob: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    tenant: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('../../shared/cache/redis.js', () => ({
  getRedis: () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() }),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
}))

vi.mock('../../shared/queue/bullmq.js', () => ({
  getQueue: vi.fn().mockReturnValue({
    add: vi.fn().mockResolvedValue({ id: 'bullmq-job-1' }),
  }),
  QUEUE_NAMES: { PROVISIONING: 'provisioning', NOTIFICATIONS: 'notifications', SLA_REPORTS: 'sla-reports' },
}))

vi.mock('../../integrations/zabbix/ZabbixApiService.js', () => ({
  ZabbixApiService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.4.0' }),
    getHosts: vi.fn().mockResolvedValue([]),
    getActiveAlerts: vi.fn().mockResolvedValue([]),
    createHost: vi.fn().mockResolvedValue('10001'),
    updateHost: vi.fn(),
    getItemCurrentValue: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('../audit/audit.service.js', () => ({
  logAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../shared/crypto/encryption.js', () => ({
  encrypt: vi.fn().mockReturnValue('encrypted:token:value'),
  decrypt: vi.fn().mockReturnValue('decrypted-api-token'),
}))

import { prisma } from '../../shared/database/prisma.js'
import { getQueue } from '../../shared/queue/bullmq.js'
import { parseOsFromUname } from './os-detection/os-detector.js'
import { generateScript } from './os-detection/script-generator.js'
import {
  createHost,
  listHosts,
  getHost,
  transitionStatus,
  startProvisioning,
  cancelJob,
} from './provisioning.service.js'
import { buildApp } from '../../app.js'

// ─── Token helpers ───────────────────────────────────────
function createTestToken(payload: { sub: string; tenantId: string; role: string; email: string }): string {
  return jwt.sign(payload, process.env['JWT_SECRET']!, { algorithm: 'HS256', expiresIn: 900 })
}

let ADMIN_TOKEN: string
let ENGINEER_TOKEN: string

beforeAll(() => {
  ADMIN_TOKEN = createTestToken({ sub: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN', email: 'admin@test.com' })
  ENGINEER_TOKEN = createTestToken({ sub: 'eng-1', tenantId: 'tenant-1', role: 'MONITORING_ENGINEER', email: 'eng@test.com' })
})

// ─── Fixtures ────────────────────────────────────────────
const HOST_FIXTURE = {
  id: 'host-1',
  tenantId: 'tenant-1',
  zabbixInstanceId: 'inst-1',
  zabbixHostId: null,
  hostname: 'web-server-01',
  ipAddress: '10.0.1.100',
  os: 'LINUX_RHEL',
  osVersion: '9.2',
  agentVersion: null,
  agentPort: 10050,
  declaredRole: 'webserver',
  status: 'ONBOARDING' as const,
  location: 'DC-01',
  tags: [],
  hostGroupIds: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

const JOB_FIXTURE = {
  id: 'job-1',
  hostId: 'host-1',
  status: 'PENDING' as const,
  currentStep: 'Initialisation',
  detectedOs: null,
  generatedScript: null,
  steps: [],
  errorCode: null,
  errorMessage: null,
  startedAt: new Date(),
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ═══════════════════════════════════════════════════════════
//  OS DETECTOR — PURE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════

describe('OS Detector', () => {
  describe('parseOsFromUname', () => {
    it('detects LINUX_RHEL from Red Hat uname', () => {
      const result = parseOsFromUname(
        'Linux server01.example.com 5.14.0-284.30.1.el9_2.x86_64 #1 SMP RHEL release 9.2',
      )
      expect(result.os).toBe('LINUX_RHEL')
      expect(result.version).toBe('9.2')
    })

    it('detects LINUX_RHEL from CentOS uname', () => {
      const result = parseOsFromUname(
        'Linux centos8.local 4.18.0-305.el8.x86_64 #1 SMP CentOS Stream release 8',
      )
      expect(result.os).toBe('LINUX_RHEL')
    })

    it('detects LINUX_RHEL from Rocky uname', () => {
      const result = parseOsFromUname(
        'Linux server02.internal 5.14.0-284.30.1.el9_2.x86_64 Rocky release 9.2',
      )
      expect(result.os).toBe('LINUX_RHEL')
      expect(result.version).toBe('9.2')
    })

    it('detects LINUX_UBUNTU from Ubuntu uname', () => {
      const result = parseOsFromUname(
        'Linux ubuntu-server 5.15.0-88-generic #98 Ubuntu 22.04 LTS x86_64',
      )
      expect(result.os).toBe('LINUX_UBUNTU')
      expect(result.version).toBe('22.04')
    })

    it('detects LINUX_DEBIAN from Debian uname', () => {
      const result = parseOsFromUname(
        'Linux debian-host 6.1.0-13-amd64 #1 SMP Debian 12.1 x86_64 GNU/Linux',
      )
      expect(result.os).toBe('LINUX_DEBIAN')
      expect(result.version).toBe('12.1')
    })

    it('detects LINUX_SUSE from SUSE uname', () => {
      const result = parseOsFromUname(
        'Linux suse-host 5.14.21-150500.55.7-default SUSE Linux Enterprise Server 15 SP5',
      )
      expect(result.os).toBe('LINUX_SUSE')
      expect(result.version).toBe('15')
    })

    it('detects WINDOWS from Windows uname', () => {
      const result = parseOsFromUname('Windows Server 2022 10.0.20348')
      expect(result.os).toBe('WINDOWS')
      expect(result.version).toBe('2022')
    })

    it('detects AIX from AIX uname', () => {
      const result = parseOsFromUname('AIX hostname 3 7 00F9C1964C00')
      expect(result.os).toBe('AIX')
      expect(result.version).toBe('3.7')
    })

    it('returns OTHER for unknown uname', () => {
      const result = parseOsFromUname('SomeUnknownOS 1.0')
      expect(result.os).toBe('OTHER')
    })

    it('returns OTHER with kernel version for generic Linux', () => {
      const result = parseOsFromUname('Linux generic-host 5.15.0-88-generic #98 x86_64')
      expect(result.os).toBe('OTHER')
      expect(result.version).toBe('5.15.0-88-generic')
    })

    it('extracts version string from RHEL', () => {
      const result = parseOsFromUname('RHEL release 8.8 (Ootpa)')
      expect(result.os).toBe('LINUX_RHEL')
      expect(result.version).toBe('8.8')
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  SCRIPT GENERATOR — PURE FUNCTION TESTS
// ═══════════════════════════════════════════════════════════

describe('Script Generator', () => {
  const params = {
    zabbixServerIp: '10.0.0.1',
    zabbixActiveIp: '10.0.0.2',
    hostname: 'web-server-01',
    agentPort: 10050,
  }

  describe('generateScript', () => {
    it('generates RHEL script with correct placeholders replaced', () => {
      const script = generateScript('LINUX_RHEL', params)

      expect(script).toContain('10.0.0.1')
      expect(script).toContain('10.0.0.2')
      expect(script).toContain('web-server-01')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
      expect(script).not.toContain('{{ZABBIX_ACTIVE}}')
      expect(script).not.toContain('{{HOSTNAME}}')
      expect(script).not.toContain('{{AGENT_PORT}}')
      expect(script).toContain('#!/bin/bash')
    })

    it('generates Ubuntu script', () => {
      const script = generateScript('LINUX_UBUNTU', params)

      expect(script).toContain('10.0.0.1')
      expect(script).toContain('web-server-01')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
      expect(script).toContain('#!/bin/bash')
    })

    it('generates Windows PowerShell script', () => {
      const script = generateScript('WINDOWS', params)

      expect(script).toContain('10.0.0.1')
      expect(script).toContain('web-server-01')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
      expect(script).not.toContain('{{HOSTNAME}}')
    })

    it('generates Debian script', () => {
      const script = generateScript('LINUX_DEBIAN', params)

      expect(script).toContain('10.0.0.1')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
    })

    it('generates SUSE script', () => {
      const script = generateScript('LINUX_SUSE', params)

      expect(script).toContain('10.0.0.1')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
    })

    it('generates AIX script', () => {
      const script = generateScript('AIX', params)

      expect(script).toContain('10.0.0.1')
      expect(script).not.toContain('{{ZABBIX_SERVER}}')
    })

    it('throws PROV_003 on OTHER os type', () => {
      expect(() => generateScript('OTHER', params)).toThrow()

      try {
        generateScript('OTHER', params)
      } catch (err: any) {
        expect(err.code).toBe('PROV_003')
        expect(err.statusCode).toBe(400)
      }
    })

    it('replaces all placeholders correctly', () => {
      const customParams = {
        zabbixServerIp: '192.168.1.100',
        zabbixActiveIp: '192.168.1.101',
        hostname: 'db-server-prod',
        agentPort: 10055,
      }

      const script = generateScript('LINUX_RHEL', customParams)

      expect(script).toContain('192.168.1.100')
      expect(script).toContain('192.168.1.101')
      expect(script).toContain('db-server-prod')
      expect(script).toContain('10055')

      // Verify no unreplaced placeholders remain
      expect(script).not.toMatch(/\{\{[A-Z_]+\}\}/)
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  PROVISIONING SERVICE — UNIT TESTS
// ═══════════════════════════════════════════════════════════

describe('Provisioning Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createHost', () => {
    it('creates host with valid data', async () => {
      vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({ maxHosts: 500 } as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({ id: 'inst-1', tenantId: 'tenant-1' } as any)
      vi.mocked(prisma.managedHost.create).mockResolvedValue(HOST_FIXTURE as any)

      const result = await createHost(
        'tenant-1',
        {
          hostname: 'web-server-01',
          ipAddress: '10.0.1.100',
          zabbixInstanceId: 'inst-1',
          declaredRole: 'webserver',
        },
        'admin-1',
        '127.0.0.1',
      )

      expect(result.id).toBe('host-1')
      expect(result.status).toBe('ONBOARDING')
      expect(prisma.managedHost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-1',
            hostname: 'web-server-01',
            ipAddress: '10.0.1.100',
            status: 'ONBOARDING',
          }),
        }),
      )
    })

    it('throws TNT_004 when host limit reached', async () => {
      vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({ maxHosts: 10 } as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(10)

      await expect(
        createHost(
          'tenant-1',
          { hostname: 'overflow', ipAddress: '10.0.1.200', zabbixInstanceId: 'inst-1' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'TNT_004', statusCode: 403 })
    })

    it('validates instance belongs to tenant', async () => {
      vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({ maxHosts: 500 } as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(null) // Instance not found for this tenant

      await expect(
        createHost(
          'tenant-1',
          { hostname: 'test', ipAddress: '10.0.1.1', zabbixInstanceId: 'inst-other-tenant' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'ZBX_001', statusCode: 404 })
    })
  })

  describe('listHosts', () => {
    it('returns paginated hosts for tenant', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([HOST_FIXTURE] as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(1)

      const result = await listHosts('tenant-1', { page: 1, limit: 20 })

      expect(result.hosts).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
    })

    it('filters by status', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([])
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)

      await listHosts('tenant-1', { page: 1, limit: 20, status: 'ACTIVE' })

      expect(prisma.managedHost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', status: 'ACTIVE' }),
        }),
      )
    })

    it('filters by zabbixInstanceId', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([])
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)

      await listHosts('tenant-1', { page: 1, limit: 20, zabbixInstanceId: 'inst-1' })

      expect(prisma.managedHost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1', zabbixInstanceId: 'inst-1' }),
        }),
      )
    })

    it('caps limit at MAX_LIMIT', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([])
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)

      await listHosts('tenant-1', { page: 1, limit: 500 })

      expect(prisma.managedHost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      )
    })
  })

  describe('getHost', () => {
    it('returns host with relations', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({
        ...HOST_FIXTURE,
        provisioningJob: null,
        assignedTemplates: [],
        instance: { id: 'inst-1', label: 'Prod', apiUrl: 'https://zbx.test', version: '6.4.0' },
      } as any)

      const result = await getHost('tenant-1', 'host-1')

      expect(result.id).toBe('host-1')
      expect(prisma.managedHost.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'host-1', tenantId: 'tenant-1' },
          include: expect.objectContaining({ provisioningJob: true }),
        }),
      )
    })

    it('throws HOST_001 when not found', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(null)

      await expect(getHost('tenant-1', 'nonexistent')).rejects.toMatchObject({
        code: 'HOST_001',
        statusCode: 404,
      })
    })
  })

  describe('transitionStatus', () => {
    it('allows ONBOARDING -> ACTIVE', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ONBOARDING' } as any)
      vi.mocked(prisma.managedHost.update).mockResolvedValue({ ...HOST_FIXTURE, status: 'ACTIVE' } as any)

      const result = await transitionStatus('tenant-1', 'host-1', 'ACTIVE', 'admin-1', '127.0.0.1')
      expect(result.status).toBe('ACTIVE')
    })

    it('allows ACTIVE -> MAINTENANCE', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ACTIVE' } as any)
      vi.mocked(prisma.managedHost.update).mockResolvedValue({ ...HOST_FIXTURE, status: 'MAINTENANCE' } as any)

      const result = await transitionStatus('tenant-1', 'host-1', 'MAINTENANCE', 'admin-1', '127.0.0.1')
      expect(result.status).toBe('MAINTENANCE')
    })

    it('allows ACTIVE -> DECOMMISSIONED', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ACTIVE' } as any)
      vi.mocked(prisma.managedHost.update).mockResolvedValue({ ...HOST_FIXTURE, status: 'DECOMMISSIONED' } as any)

      const result = await transitionStatus('tenant-1', 'host-1', 'DECOMMISSIONED', 'admin-1', '127.0.0.1')
      expect(result.status).toBe('DECOMMISSIONED')
    })

    it('allows MAINTENANCE -> ACTIVE', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'MAINTENANCE' } as any)
      vi.mocked(prisma.managedHost.update).mockResolvedValue({ ...HOST_FIXTURE, status: 'ACTIVE' } as any)

      const result = await transitionStatus('tenant-1', 'host-1', 'ACTIVE', 'admin-1', '127.0.0.1')
      expect(result.status).toBe('ACTIVE')
    })

    it('rejects DECOMMISSIONED -> ACTIVE', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'DECOMMISSIONED' } as any)

      await expect(
        transitionStatus('tenant-1', 'host-1', 'ACTIVE', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'HOST_003', statusCode: 400 })
    })

    it('rejects ONBOARDING -> DECOMMISSIONED', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ONBOARDING' } as any)

      await expect(
        transitionStatus('tenant-1', 'host-1', 'DECOMMISSIONED', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'HOST_003', statusCode: 400 })
    })

    it('rejects ONBOARDING -> MAINTENANCE', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ONBOARDING' } as any)

      await expect(
        transitionStatus('tenant-1', 'host-1', 'MAINTENANCE', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'HOST_003', statusCode: 400 })
    })

    it('throws HOST_001 when host not found', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(null)

      await expect(
        transitionStatus('tenant-1', 'nonexistent', 'ACTIVE', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'HOST_001', statusCode: 404 })
    })
  })

  describe('startProvisioning', () => {
    it('creates job and enqueues BullMQ job', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(HOST_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue(null) // No existing job
      vi.mocked(prisma.provisioningJob.create).mockResolvedValue(JOB_FIXTURE as any)

      const result = await startProvisioning(
        'tenant-1',
        'host-1',
        { zabbixServerIp: '10.0.0.1', zabbixActiveIp: '10.0.0.2' },
        'admin-1',
        '127.0.0.1',
      )

      expect(result.id).toBe('job-1')
      expect(result.status).toBe('PENDING')

      const queue = getQueue('provisioning')
      expect(queue.add).toHaveBeenCalledWith(
        'provision-host',
        expect.objectContaining({
          hostId: 'host-1',
          tenantId: 'tenant-1',
          zabbixServerIp: '10.0.0.1',
          zabbixActiveIp: '10.0.0.2',
        }),
      )
    })

    it('throws PROV_004 when job already running', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(HOST_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue({
        ...JOB_FIXTURE,
        status: 'DETECTING',
      } as any)

      await expect(
        startProvisioning(
          'tenant-1',
          'host-1',
          { zabbixServerIp: '10.0.0.1', zabbixActiveIp: '10.0.0.2' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'PROV_004', statusCode: 409 })
    })

    it('replaces a previously FAILED job', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(HOST_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue({
        ...JOB_FIXTURE,
        status: 'FAILED',
        errorMessage: 'Previous failure',
      } as any)
      vi.mocked(prisma.provisioningJob.update).mockResolvedValue({
        ...JOB_FIXTURE,
        status: 'PENDING',
      } as any)

      const result = await startProvisioning(
        'tenant-1',
        'host-1',
        { zabbixServerIp: '10.0.0.1', zabbixActiveIp: '10.0.0.2' },
        'admin-1',
        '127.0.0.1',
      )

      expect(result.status).toBe('PENDING')
      // Should update existing rather than create new
      expect(prisma.provisioningJob.update).toHaveBeenCalled()
      expect(prisma.provisioningJob.create).not.toHaveBeenCalled()
    })

    it('throws HOST_001 when host not found', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(null)

      await expect(
        startProvisioning(
          'tenant-1',
          'nonexistent',
          { zabbixServerIp: '10.0.0.1', zabbixActiveIp: '10.0.0.2' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'HOST_001', statusCode: 404 })
    })
  })

  describe('cancelJob', () => {
    it('sets job status to FAILED with cancellation message', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ id: 'host-1' } as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue(JOB_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.update).mockResolvedValue({
        ...JOB_FIXTURE,
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
        completedAt: new Date(),
      } as any)

      const result = await cancelJob('tenant-1', 'host-1', 'admin-1', '127.0.0.1')

      expect(result.status).toBe('FAILED')
      expect(result.errorMessage).toBe('Cancelled by user')
      expect(prisma.provisioningJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'Cancelled by user',
          }),
        }),
      )
    })

    it('throws HOST_001 when host not found', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(null)

      await expect(
        cancelJob('tenant-1', 'nonexistent', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'HOST_001', statusCode: 404 })
    })

    it('throws PROV_001 when no job found', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ id: 'host-1' } as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue(null)

      await expect(
        cancelJob('tenant-1', 'host-1', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'PROV_001', statusCode: 404 })
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  PROVISIONING ROUTES — INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════

describe('Provisioning Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: tenant middleware passes
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-1',
      isActive: true,
      slug: 'acme',
      plan: 'ENTERPRISE',
    } as any)
  })

  describe('POST /api/tenants/:tenantId/hosts', () => {
    it('returns 201 on valid host creation', async () => {
      vi.mocked(prisma.tenant.findUniqueOrThrow).mockResolvedValue({ maxHosts: 500 } as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({ id: 'inst-1', tenantId: 'tenant-1' } as any)
      vi.mocked(prisma.managedHost.create).mockResolvedValue(HOST_FIXTURE as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          hostname: 'web-server-01',
          ipAddress: '10.0.1.100',
          zabbixInstanceId: 'inst-1',
          declaredRole: 'webserver',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.hostname).toBe('web-server-01')
    })

    it('returns 401 without token', async () => {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts',
        payload: {
          hostname: 'test',
          ipAddress: '10.0.1.1',
          zabbixInstanceId: 'inst-1',
        },
      })

      expect(res.statusCode).toBe(401)
    })

    it('returns 400 on invalid IP address', async () => {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          hostname: 'test',
          ipAddress: 'not-an-ip',
          zabbixInstanceId: 'inst-1',
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/tenants/:tenantId/hosts', () => {
    it('returns host list', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([HOST_FIXTURE] as any)
      vi.mocked(prisma.managedHost.count).mockResolvedValue(1)

      const app = await buildApp()
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-1/hosts',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.hosts).toHaveLength(1)
      expect(body.total).toBe(1)
    })

    it('accepts query filters', async () => {
      vi.mocked(prisma.managedHost.findMany).mockResolvedValue([])
      vi.mocked(prisma.managedHost.count).mockResolvedValue(0)

      const app = await buildApp()
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-1/hosts?status=ACTIVE&page=1&limit=10',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/tenants/:tenantId/hosts/:hostId', () => {
    it('returns host detail', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({
        ...HOST_FIXTURE,
        provisioningJob: null,
        assignedTemplates: [],
        instance: { id: 'inst-1', label: 'Prod', apiUrl: 'https://zbx.test', version: '6.4.0' },
      } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-1/hosts/host-1',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().hostname).toBe('web-server-01')
    })
  })

  describe('POST /api/tenants/:tenantId/hosts/:hostId/status', () => {
    it('transitions status successfully', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'ONBOARDING' } as any)
      vi.mocked(prisma.managedHost.update).mockResolvedValue({ ...HOST_FIXTURE, status: 'ACTIVE' } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts/host-1/status',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { status: 'ACTIVE' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ACTIVE')
    })

    it('returns 400 on invalid transition', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ ...HOST_FIXTURE, status: 'DECOMMISSIONED' } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts/host-1/status',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { status: 'ACTIVE' },
      })

      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error.code).toBe('HOST_003')
    })
  })

  describe('POST /api/tenants/:tenantId/hosts/:hostId/provision', () => {
    it('returns 202 on provisioning start', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue(HOST_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.provisioningJob.create).mockResolvedValue(JOB_FIXTURE as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/hosts/host-1/provision',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          zabbixServerIp: '10.0.0.1',
          zabbixActiveIp: '10.0.0.2',
        },
      })

      expect(res.statusCode).toBe(202)
      expect(res.json().status).toBe('PENDING')
    })
  })

  describe('DELETE /api/tenants/:tenantId/hosts/:hostId/provision', () => {
    it('cancels a running job', async () => {
      vi.mocked(prisma.managedHost.findFirst).mockResolvedValue({ id: 'host-1' } as any)
      vi.mocked(prisma.provisioningJob.findUnique).mockResolvedValue(JOB_FIXTURE as any)
      vi.mocked(prisma.provisioningJob.update).mockResolvedValue({
        ...JOB_FIXTURE,
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
      } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/tenants/tenant-1/hosts/host-1/provision',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('FAILED')
    })
  })
})
