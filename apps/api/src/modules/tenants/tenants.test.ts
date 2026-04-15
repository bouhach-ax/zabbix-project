import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ---- Mocks (hoisted) ----

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
}

vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}))

vi.mock('../../shared/cache/redis.js', () => ({
  getRedis: () => mockRedis,
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  cacheDelPattern: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(() => mockRedis),
    default: vi.fn().mockImplementation(() => mockRedis),
  }
})

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3001,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test_jwt_secret_minimum_32_chars_long_xxxxxxx',
    JWT_REFRESH_SECRET: 'test_refresh_secret_minimum_32_chars_long_xxx',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    ENCRYPTION_KEY: 'a'.repeat(64),
    CORS_ORIGIN: 'http://localhost:5173',
    PROVISIONING_CONCURRENCY: 10,
  },
  getEnv: () => ({
    NODE_ENV: 'test',
    PORT: 3001,
    HOST: '0.0.0.0',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test_jwt_secret_minimum_32_chars_long_xxxxxxx',
    JWT_REFRESH_SECRET: 'test_refresh_secret_minimum_32_chars_long_xxx',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '30d',
    ENCRYPTION_KEY: 'a'.repeat(64),
    CORS_ORIGIN: 'http://localhost:5173',
    PROVISIONING_CONCURRENCY: 10,
  }),
}))

// ---- Imports (after mocks) ----

import jwt from 'jsonwebtoken'
import { createTenant, findAll, findById, updateTenant, deactivateTenant } from './tenants.service.js'
import { prisma } from '../../shared/database/prisma.js'
import { buildApp } from '../../app.js'

// ---- Helpers ----

// Use hardcoded secret matching setup.ts — evaluated at module scope before setup runs
const TEST_JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long_xxxxxxx'

function createTestToken(payload: {
  sub: string
  tenantId: string
  role: string
  email: string
}): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 })
}

const ADMIN_TOKEN = createTestToken({
  sub: 'cuid_admin_001',
  tenantId: 'cuid_tenant_001',
  role: 'ADMIN',
  email: 'admin@acme-corp.com',
})

const NOC_TOKEN = createTestToken({
  sub: 'cuid_noc_001',
  tenantId: 'cuid_tenant_001',
  role: 'NOC_OPERATOR',
  email: 'operator@acme-corp.com',
})

const OTHER_TENANT_TOKEN = createTestToken({
  sub: 'cuid_user_other_001',
  tenantId: 'cuid_tenant_002',
  role: 'NOC_OPERATOR',
  email: 'operator@other-corp.com',
})

const NOW = new Date('2025-06-01T12:00:00Z')

const MOCK_TENANT = {
  id: 'cuid_tenant_001',
  name: 'Acme Corporation',
  slug: 'acme-corp',
  plan: 'ENTERPRISE' as const,
  isActive: true,
  maxHosts: 1000,
  maxInstances: 5,
  createdAt: NOW,
  updatedAt: NOW,
}

const MOCK_TENANT_2 = {
  id: 'cuid_tenant_002',
  name: 'Beta Industries',
  slug: 'beta-industries',
  plan: 'STARTER' as const,
  isActive: true,
  maxHosts: 500,
  maxInstances: 2,
  createdAt: NOW,
  updatedAt: NOW,
}

// ---- Tenants Service Unit Tests ----

describe('Tenants Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createTenant', () => {
    it('creates tenant with valid data', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null) // slug not taken
      vi.mocked(prisma.tenant.create).mockResolvedValue(MOCK_TENANT as never)

      const result = await createTenant(
        { name: 'Acme Corporation', slug: 'acme-corp', plan: 'ENTERPRISE', maxHosts: 1000, maxInstances: 5 },
        'cuid_admin_001',
        '192.168.1.100',
      )

      expect(result.name).toBe('Acme Corporation')
      expect(result.slug).toBe('acme-corp')
      expect(result.plan).toBe('ENTERPRISE')
      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Acme Corporation',
          slug: 'acme-corp',
          plan: 'ENTERPRISE',
        }),
      })
    })

    it('throws TNT_002 on duplicate slug', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)

      await expect(
        createTenant(
          { name: 'Another Corp', slug: 'acme-corp' },
          'cuid_admin_001',
          '10.0.0.1',
        ),
      ).rejects.toMatchObject({
        code: 'TNT_002',
        statusCode: 409,
      })
    })

    it('uses default plan STARTER when not specified', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.tenant.create).mockResolvedValue({
        ...MOCK_TENANT,
        plan: 'STARTER',
      } as never)

      await createTenant(
        { name: 'Minimal Corp', slug: 'minimal-corp' },
        'cuid_admin_001',
        '10.0.0.1',
      )

      expect(prisma.tenant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          plan: 'STARTER',
          maxHosts: 500,
          maxInstances: 2,
        }),
      })
    })
  })

  describe('findAll', () => {
    it('returns all tenants', async () => {
      vi.mocked(prisma.tenant.findMany).mockResolvedValue([MOCK_TENANT, MOCK_TENANT_2] as never)

      const result = await findAll()

      expect(result).toHaveLength(2)
      expect(result[0]!.name).toBe('Acme Corporation')
      expect(result[1]!.name).toBe('Beta Industries')
      expect(prisma.tenant.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('findById', () => {
    it('returns tenant by id', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)

      const result = await findById('cuid_tenant_001')

      expect(result.id).toBe('cuid_tenant_001')
      expect(result.name).toBe('Acme Corporation')
    })

    it('throws TNT_001 when not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null)

      await expect(
        findById('cuid_nonexistent'),
      ).rejects.toMatchObject({
        code: 'TNT_001',
        statusCode: 404,
      })
    })
  })

  describe('updateTenant', () => {
    it('updates tenant fields', async () => {
      vi.mocked(prisma.tenant.findUnique)
        .mockResolvedValueOnce(MOCK_TENANT as never) // before lookup
      const updatedTenant = { ...MOCK_TENANT, name: 'Acme Corp Renamed' }
      vi.mocked(prisma.tenant.update).mockResolvedValue(updatedTenant as never)

      const result = await updateTenant(
        'cuid_tenant_001',
        { name: 'Acme Corp Renamed' },
        'cuid_admin_001',
        '192.168.1.100',
      )

      expect(result.name).toBe('Acme Corp Renamed')
      expect(prisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cuid_tenant_001' },
        }),
      )
    })

    it('throws TNT_001 when not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null)

      await expect(
        updateTenant('cuid_nonexistent', { name: 'Nope' }, 'cuid_admin_001', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'TNT_001',
        statusCode: 404,
      })
    })

    it('throws TNT_002 when new slug is taken', async () => {
      vi.mocked(prisma.tenant.findUnique)
        .mockResolvedValueOnce(MOCK_TENANT as never) // before lookup
        .mockResolvedValueOnce(MOCK_TENANT_2 as never) // slug check — taken

      await expect(
        updateTenant(
          'cuid_tenant_001',
          { slug: 'beta-industries' },
          'cuid_admin_001',
          '10.0.0.1',
        ),
      ).rejects.toMatchObject({
        code: 'TNT_002',
        statusCode: 409,
      })
    })
  })

  describe('deactivateTenant', () => {
    it('sets isActive to false', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)
      const deactivated = { ...MOCK_TENANT, isActive: false }
      vi.mocked(prisma.tenant.update).mockResolvedValue(deactivated as never)

      const result = await deactivateTenant('cuid_tenant_001', 'cuid_admin_001', '192.168.1.100')

      expect(result.isActive).toBe(false)
      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 'cuid_tenant_001' },
        data: { isActive: false },
      })
    })

    it('throws TNT_001 when not found', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null)

      await expect(
        deactivateTenant('cuid_nonexistent', 'cuid_admin_001', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'TNT_001',
        statusCode: 404,
      })
    })
  })
})

// ---- Tenants Routes Integration Tests ----

describe('Tenants Routes — Integration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/tenants', () => {
    it('returns 201 on valid creation — ADMIN only', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null) // slug not taken
      vi.mocked(prisma.tenant.create).mockResolvedValue(MOCK_TENANT as never)

      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          name: 'Acme Corporation',
          slug: 'acme-corp',
          plan: 'ENTERPRISE',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.name).toBe('Acme Corporation')
      expect(body.slug).toBe('acme-corp')
    })

    it('returns 403 for non-ADMIN role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${NOC_TOKEN}` },
        payload: {
          name: 'Unauthorized Corp',
          slug: 'unauthorized-corp',
        },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('AUTH_005')
    })

    it('returns 400 on invalid slug format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          name: 'Bad Slug Corp',
          slug: 'INVALID SLUG WITH SPACES!',
        },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.error.code).toBe('VAL_001')
    })
  })

  describe('GET /api/tenants', () => {
    it('returns list for ADMIN', async () => {
      vi.mocked(prisma.tenant.findMany).mockResolvedValue([MOCK_TENANT, MOCK_TENANT_2] as never)

      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveLength(2)
    })

    it('returns 403 for non-ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants',
        headers: { authorization: `Bearer ${NOC_TOKEN}` },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('GET /api/tenants/:id', () => {
    it('returns tenant for ADMIN', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT_2 as never)

      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants/cuid_tenant_002',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe('cuid_tenant_002')
    })

    it('returns own tenant for non-ADMIN', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)

      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants/cuid_tenant_001',
        headers: { authorization: `Bearer ${NOC_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe('cuid_tenant_001')
    })

    it('returns 403 for other tenant non-ADMIN', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/tenants/cuid_tenant_001',
        headers: { authorization: `Bearer ${OTHER_TENANT_TOKEN}` },
      })

      expect(response.statusCode).toBe(403)
      const body = response.json()
      expect(body.error.code).toBe('AUTH_005')
    })
  })

  describe('PATCH /api/tenants/:id', () => {
    it('updates tenant for ADMIN', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)
      const updated = { ...MOCK_TENANT, name: 'Acme Corp Updated' }
      vi.mocked(prisma.tenant.update).mockResolvedValue(updated as never)

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/tenants/cuid_tenant_001',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { name: 'Acme Corp Updated' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.name).toBe('Acme Corp Updated')
    })
  })

  describe('DELETE /api/tenants/:id', () => {
    it('deactivates tenant for ADMIN', async () => {
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT as never)
      const deactivated = { ...MOCK_TENANT, isActive: false }
      vi.mocked(prisma.tenant.update).mockResolvedValue(deactivated as never)

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/tenants/cuid_tenant_001',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.isActive).toBe(false)
    })
  })
})
