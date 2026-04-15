import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import jwt from 'jsonwebtoken'

// ─── Mocks ───────────────────────────────────────────────
vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    zabbixInstance: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: { findUnique: vi.fn() },
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

vi.mock('../../integrations/zabbix/ZabbixApiService.js', () => ({
  ZabbixApiService: vi.fn().mockImplementation(() => ({
    healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.4.0' }),
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
import { encrypt, decrypt } from '../../shared/crypto/encryption.js'
import { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import {
  createInstance,
  findAll,
  findById,
  updateInstance,
  deleteInstance,
  testConnectivity,
} from './zabbix-instances.service.js'
import { buildApp } from '../../app.js'

// ─── Token helpers ───────────────────────────────────────
function createTestToken(payload: { sub: string; tenantId: string; role: string; email: string }): string {
  return jwt.sign(payload, process.env['JWT_SECRET']!, { algorithm: 'HS256', expiresIn: 900 })
}

let ADMIN_TOKEN: string

beforeAll(() => {
  ADMIN_TOKEN = createTestToken({ sub: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN', email: 'admin@test.com' })
})

// ─── Fixtures ────────────────────────────────────────────
const INSTANCE_FIXTURE = {
  id: 'inst-1',
  tenantId: 'tenant-1',
  label: 'Zabbix Production',
  apiUrl: 'https://zabbix.example.com',
  version: '6.4.0',
  isActive: true,
  lastHealthCheck: new Date(),
  healthStatus: 'OK',
  createdAt: new Date(),
}

// ═══════════════════════════════════════════════════════════
//  SERVICE UNIT TESTS
// ═══════════════════════════════════════════════════════════

describe('Zabbix Instances Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createInstance', () => {
    it('creates instance with encrypted token', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        maxInstances: 5,
      } as any)
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.create).mockResolvedValue(INSTANCE_FIXTURE as any)

      const result = await createInstance(
        'tenant-1',
        { label: 'Zabbix Prod', apiUrl: 'https://zabbix.example.com', apiToken: 'my-secret-token' },
        'admin-1',
        '127.0.0.1',
      )

      expect(encrypt).toHaveBeenCalledWith('my-secret-token')
      expect(result.id).toBe('inst-1')
      expect(result).not.toHaveProperty('apiTokenEncrypted')
    })

    it('throws TNT_005 when tenant instance limit reached', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        maxInstances: 2,
      } as any)
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(2)

      await expect(
        createInstance(
          'tenant-1',
          { label: 'Another', apiUrl: 'https://zabbix2.example.com', apiToken: 'tok' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'TNT_005', statusCode: 409 })
    })

    it('stores version from health check', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ maxInstances: 10 } as any)
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.create).mockResolvedValue(INSTANCE_FIXTURE as any)

      await createInstance(
        'tenant-1',
        { label: 'Test', apiUrl: 'https://zbx.test', apiToken: 'tok' },
        'admin-1',
        '127.0.0.1',
      )

      const createCall = vi.mocked(prisma.zabbixInstance.create).mock.calls[0]![0]
      expect((createCall as any).data.version).toBe('6.4.0')
    })

    it('never returns apiTokenEncrypted in response', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ maxInstances: 10 } as any)
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.create).mockResolvedValue(INSTANCE_FIXTURE as any)

      const result = await createInstance(
        'tenant-1',
        { label: 'Test', apiUrl: 'https://zbx.test', apiToken: 'tok' },
        'admin-1',
        '127.0.0.1',
      )

      expect(result).not.toHaveProperty('apiTokenEncrypted')
    })

    it('throws ZBX_002 when Zabbix API is unreachable', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ maxInstances: 10 } as any)
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(0)

      // Override ZabbixApiService mock for this test
      vi.mocked(ZabbixApiService).mockImplementationOnce(
        () =>
          ({
            healthCheck: vi.fn().mockResolvedValue({ reachable: false, version: null, error: 'timeout' }),
          }) as any,
      )

      await expect(
        createInstance(
          'tenant-1',
          { label: 'Down', apiUrl: 'https://unreachable.test', apiToken: 'tok' },
          'admin-1',
          '127.0.0.1',
        ),
      ).rejects.toMatchObject({ code: 'ZBX_002', statusCode: 502 })
    })
  })

  describe('findAll', () => {
    it('returns instances without apiTokenEncrypted', async () => {
      vi.mocked(prisma.zabbixInstance.findMany).mockResolvedValue([INSTANCE_FIXTURE] as any)

      const result = await findAll('tenant-1')

      expect(result).toHaveLength(1)
      expect(result[0]).not.toHaveProperty('apiTokenEncrypted')
      expect(prisma.zabbixInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      )
    })

    it('filters by tenantId', async () => {
      vi.mocked(prisma.zabbixInstance.findMany).mockResolvedValue([])

      await findAll('tenant-2')

      expect(prisma.zabbixInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-2' } }),
      )
    })
  })

  describe('findById', () => {
    it('returns instance without token', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)

      const result = await findById('tenant-1', 'inst-1')

      expect(result.id).toBe('inst-1')
      expect(result).not.toHaveProperty('apiTokenEncrypted')
    })

    it('throws ZBX_001 when not found', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(null)

      await expect(findById('tenant-1', 'nonexistent')).rejects.toMatchObject({
        code: 'ZBX_001',
        statusCode: 404,
      })
    })
  })

  describe('updateInstance', () => {
    it('re-encrypts token when apiToken provided', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue(INSTANCE_FIXTURE as any)

      await updateInstance('tenant-1', 'inst-1', { apiToken: 'new-token' }, 'admin-1', '127.0.0.1')

      expect(encrypt).toHaveBeenCalledWith('new-token')
      const updateCall = vi.mocked(prisma.zabbixInstance.update).mock.calls[0]![0]
      expect((updateCall as any).data.apiTokenEncrypted).toBe('encrypted:token:value')
    })

    it('throws ZBX_001 when not found', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(null)

      await expect(
        updateInstance('tenant-1', 'nonexistent', { label: 'New' }, 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'ZBX_001', statusCode: 404 })
    })

    it('updates label without re-encrypting token', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({
        ...INSTANCE_FIXTURE,
        label: 'Updated Label',
      } as any)

      await updateInstance('tenant-1', 'inst-1', { label: 'Updated Label' }, 'admin-1', '127.0.0.1')

      expect(encrypt).not.toHaveBeenCalled()
      const updateCall = vi.mocked(prisma.zabbixInstance.update).mock.calls[0]![0]
      expect((updateCall as any).data.label).toBe('Updated Label')
      expect((updateCall as any).data).not.toHaveProperty('apiTokenEncrypted')
    })
  })

  describe('deleteInstance', () => {
    it('soft-deletes instance by setting isActive=false', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({
        ...INSTANCE_FIXTURE,
        isActive: false,
      } as any)

      const result = await deleteInstance('tenant-1', 'inst-1', 'admin-1', '127.0.0.1')

      expect(result.isActive).toBe(false)
      expect(prisma.zabbixInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      )
    })

    it('throws ZBX_001 when not found', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(null)

      await expect(
        deleteInstance('tenant-1', 'nonexistent', 'admin-1', '127.0.0.1'),
      ).rejects.toMatchObject({ code: 'ZBX_001', statusCode: 404 })
    })
  })

  describe('testConnectivity', () => {
    it('returns healthy status when reachable', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({
        id: 'inst-1',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'encrypted:token:value',
        version: '6.4.0',
      } as any)

      vi.mocked(ZabbixApiService).mockImplementationOnce(
        () =>
          ({
            healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.4.0' }),
          }) as any,
      )

      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({} as any)

      const result = await testConnectivity('tenant-1', 'inst-1')

      expect(result.reachable).toBe(true)
      expect(result.version).toBe('6.4.0')
      expect(decrypt).toHaveBeenCalledWith('encrypted:token:value')
    })

    it('returns unhealthy status when unreachable', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({
        id: 'inst-1',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'encrypted:token:value',
        version: '6.4.0',
      } as any)

      vi.mocked(ZabbixApiService).mockImplementationOnce(
        () =>
          ({
            healthCheck: vi.fn().mockResolvedValue({
              reachable: false,
              version: null,
              error: 'Connection refused',
            }),
          }) as any,
      )

      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({} as any)

      const result = await testConnectivity('tenant-1', 'inst-1')

      expect(result.reachable).toBe(false)
      expect(result.error).toBe('Connection refused')
    })

    it('updates lastHealthCheck in DB', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({
        id: 'inst-1',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'encrypted:token:value',
        version: '6.4.0',
      } as any)

      vi.mocked(ZabbixApiService).mockImplementationOnce(
        () =>
          ({
            healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.4.0' }),
          }) as any,
      )

      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({} as any)

      await testConnectivity('tenant-1', 'inst-1')

      expect(prisma.zabbixInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inst-1' },
          data: expect.objectContaining({
            lastHealthCheck: expect.any(Date),
            healthStatus: 'OK',
          }),
        }),
      )
    })

    it('throws ZBX_001 when instance not found', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(null)

      await expect(testConnectivity('tenant-1', 'nonexistent')).rejects.toMatchObject({
        code: 'ZBX_001',
        statusCode: 404,
      })
    })

    it('throws ZBX_005 when token decryption fails', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({
        id: 'inst-1',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'corrupted-data',
        version: '6.4.0',
      } as any)

      vi.mocked(decrypt).mockImplementationOnce(() => {
        throw new Error('decryption failed')
      })

      await expect(testConnectivity('tenant-1', 'inst-1')).rejects.toMatchObject({
        code: 'ZBX_005',
        statusCode: 500,
      })
    })
  })
})

// ═══════════════════════════════════════════════════════════
//  ROUTE INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════

describe('Zabbix Instances Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: tenant middleware passes
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
      id: 'tenant-1',
      isActive: true,
      slug: 'acme',
      plan: 'ENTERPRISE',
      maxInstances: 10,
    } as any)
  })

  describe('POST /api/tenants/:tenantId/zabbix-instances', () => {
    it('returns 201 on valid creation', async () => {
      vi.mocked(prisma.zabbixInstance.count).mockResolvedValue(0)
      vi.mocked(prisma.zabbixInstance.create).mockResolvedValue(INSTANCE_FIXTURE as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/zabbix-instances',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          label: 'Zabbix Prod',
          apiUrl: 'https://zabbix.example.com',
          apiToken: 'my-secret-token',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBe('inst-1')
      expect(body).not.toHaveProperty('apiTokenEncrypted')
    })

    it('returns 401 without token', async () => {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/zabbix-instances',
        payload: {
          label: 'Zabbix Prod',
          apiUrl: 'https://zabbix.example.com',
          apiToken: 'tok',
        },
      })

      expect(res.statusCode).toBe(401)
    })

    it('returns 400 on invalid body (missing apiUrl)', async () => {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/zabbix-instances',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          label: 'Zabbix Prod',
          apiToken: 'tok',
        },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/tenants/:tenantId/zabbix-instances', () => {
    it('returns instance list', async () => {
      vi.mocked(prisma.zabbixInstance.findMany).mockResolvedValue([INSTANCE_FIXTURE] as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-1/zabbix-instances',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body).toHaveLength(1)
    })
  })

  describe('GET /api/tenants/:tenantId/zabbix-instances/:instanceId', () => {
    it('returns single instance', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'GET',
        url: '/api/tenants/tenant-1/zabbix-instances/inst-1',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe('inst-1')
    })
  })

  describe('POST /api/tenants/:tenantId/zabbix-instances/:instanceId/test-connectivity', () => {
    it('returns connectivity result', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue({
        id: 'inst-1',
        apiUrl: 'https://zabbix.example.com',
        apiTokenEncrypted: 'encrypted:token:value',
        version: '6.4.0',
      } as any)

      vi.mocked(ZabbixApiService).mockImplementationOnce(
        () =>
          ({
            healthCheck: vi.fn().mockResolvedValue({ reachable: true, version: '6.4.0' }),
          }) as any,
      )
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({} as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/tenants/tenant-1/zabbix-instances/inst-1/test-connectivity',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.reachable).toBe(true)
      expect(body.version).toBe('6.4.0')
    })
  })

  describe('PATCH /api/tenants/:tenantId/zabbix-instances/:instanceId', () => {
    it('returns updated instance', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({
        ...INSTANCE_FIXTURE,
        label: 'Updated',
      } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/tenants/tenant-1/zabbix-instances/inst-1',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { label: 'Updated' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().label).toBe('Updated')
    })
  })

  describe('DELETE /api/tenants/:tenantId/zabbix-instances/:instanceId', () => {
    it('soft-deletes and returns deactivated instance', async () => {
      vi.mocked(prisma.zabbixInstance.findFirst).mockResolvedValue(INSTANCE_FIXTURE as any)
      vi.mocked(prisma.zabbixInstance.update).mockResolvedValue({
        ...INSTANCE_FIXTURE,
        isActive: false,
      } as any)

      const app = await buildApp()
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/tenants/tenant-1/zabbix-instances/inst-1',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().isActive).toBe(false)
    })
  })
})
