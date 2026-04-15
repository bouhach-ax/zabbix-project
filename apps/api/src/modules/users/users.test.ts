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
import bcrypt from 'bcryptjs'
import { createUser, findAll, findById, updateUser, deactivateUser } from './users.service.js'
import { prisma } from '../../shared/database/prisma.js'
import { buildApp } from '../../app.js'

// ---- Helpers ----

// Use hardcoded secret matching setup.ts — evaluated at module scope before setup runs
const TEST_JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long_xxxxxxx'
const TENANT_ID = 'cuid_tenant_001'

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
  tenantId: TENANT_ID,
  role: 'ADMIN',
  email: 'admin@acme-corp.com',
})

const NOC_TOKEN = createTestToken({
  sub: 'cuid_noc_001',
  tenantId: TENANT_ID,
  role: 'NOC_OPERATOR',
  email: 'operator@acme-corp.com',
})

const NOW = new Date('2025-06-15T09:30:00Z')

const MOCK_USER_RESPONSE = {
  id: 'cuid_user_new_001',
  tenantId: TENANT_ID,
  email: 'marie.curie@acme-corp.com',
  firstName: 'Marie',
  lastName: 'Curie',
  role: 'MONITORING_ENGINEER' as const,
  isActive: true,
  lastLoginAt: null,
  createdAt: NOW,
}

const MOCK_USER_2 = {
  id: 'cuid_user_new_002',
  tenantId: TENANT_ID,
  email: 'louis.pasteur@acme-corp.com',
  firstName: 'Louis',
  lastName: 'Pasteur',
  role: 'NOC_OPERATOR' as const,
  isActive: true,
  lastLoginAt: null,
  createdAt: NOW,
}

const MOCK_TENANT_FOR_MIDDLEWARE = {
  id: TENANT_ID,
  isActive: true,
  slug: 'acme-corp',
  plan: 'ENTERPRISE',
}

// ---- Users Service Unit Tests ----

describe('Users Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createUser', () => {
    it('creates user with hashed password', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null) // email not taken
      vi.mocked(prisma.user.create).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$mockedHashValue' as never)

      const result = await createUser(
        TENANT_ID,
        {
          email: 'marie.curie@acme-corp.com',
          password: 'Radium226!Secure',
          firstName: 'Marie',
          lastName: 'Curie',
          role: 'MONITORING_ENGINEER',
        },
        'cuid_admin_001',
        '192.168.1.100',
      )

      expect(result.email).toBe('marie.curie@acme-corp.com')
      expect(result.firstName).toBe('Marie')
      expect(result.role).toBe('MONITORING_ENGINEER')
      expect(bcrypt.hash).toHaveBeenCalledWith('Radium226!Secure', 12)
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            email: 'marie.curie@acme-corp.com',
            passwordHash: '$2a$12$mockedHashValue',
          }),
        }),
      )
    })

    it('throws USR_002 on duplicate email within tenant', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER_RESPONSE as never)

      await expect(
        createUser(
          TENANT_ID,
          {
            email: 'marie.curie@acme-corp.com',
            password: 'AnyPassword1!',
            firstName: 'Marie',
            lastName: 'Duplicate',
          },
          'cuid_admin_001',
          '10.0.0.1',
        ),
      ).rejects.toMatchObject({
        code: 'USR_002',
        statusCode: 409,
      })
    })

    it('uses default role NOC_OPERATOR when not specified', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.user.create).mockResolvedValue({
        ...MOCK_USER_RESPONSE,
        role: 'NOC_OPERATOR',
      } as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$defaultRoleHash' as never)

      await createUser(
        TENANT_ID,
        {
          email: 'default.role@acme-corp.com',
          password: 'DefaultRole1!',
          firstName: 'Default',
          lastName: 'User',
        },
        'cuid_admin_001',
        '10.0.0.1',
      )

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            role: 'NOC_OPERATOR',
          }),
        }),
      )
    })

    it('never returns passwordHash', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.user.create).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$anyHash' as never)

      const result = await createUser(
        TENANT_ID,
        {
          email: 'no.hash@acme-corp.com',
          password: 'NoHashReturn1!',
          firstName: 'No',
          lastName: 'Hash',
        },
        'cuid_admin_001',
        '10.0.0.1',
      )

      expect(result).not.toHaveProperty('passwordHash')
      // Verify the select clause was used
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
          }),
        }),
      )
    })
  })

  describe('findAll', () => {
    it('returns users for tenant without passwords', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        MOCK_USER_RESPONSE,
        MOCK_USER_2,
      ] as never)

      const result = await findAll(TENANT_ID)

      expect(result).toHaveLength(2)
      expect(result[0]!.email).toBe('marie.curie@acme-corp.com')
      expect(result[1]!.email).toBe('louis.pasteur@acme-corp.com')
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID },
          select: expect.objectContaining({ id: true, email: true }),
          orderBy: { createdAt: 'desc' },
        }),
      )
      // Verify passwordHash is not in select
      const callArgs = vi.mocked(prisma.user.findMany).mock.calls[0]![0]!
      expect((callArgs as Record<string, unknown>)['select']).not.toHaveProperty('passwordHash')
    })
  })

  describe('findById', () => {
    it('returns user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)

      const result = await findById(TENANT_ID, 'cuid_user_new_001')

      expect(result.id).toBe('cuid_user_new_001')
      expect(result.email).toBe('marie.curie@acme-corp.com')
    })

    it('throws USR_001 when not found', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      await expect(
        findById(TENANT_ID, 'cuid_nonexistent'),
      ).rejects.toMatchObject({
        code: 'USR_001',
        statusCode: 404,
      })
    })
  })

  describe('updateUser', () => {
    it('updates user fields', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      const updated = { ...MOCK_USER_RESPONSE, firstName: 'Maria' }
      vi.mocked(prisma.user.update).mockResolvedValue(updated as never)

      const result = await updateUser(
        TENANT_ID,
        'cuid_user_new_001',
        { firstName: 'Maria' },
        'cuid_admin_001',
        '192.168.1.100',
      )

      expect(result.firstName).toBe('Maria')
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cuid_user_new_001' },
          data: expect.objectContaining({ firstName: 'Maria' }),
        }),
      )
    })

    it('re-hashes password if newPassword provided', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.mocked(prisma.user.update).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$newPasswordHash' as never)

      await updateUser(
        TENANT_ID,
        'cuid_user_new_001',
        { newPassword: 'NewSecure456!' },
        'cuid_admin_001',
        '192.168.1.100',
      )

      expect(bcrypt.hash).toHaveBeenCalledWith('NewSecure456!', 12)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: '$2a$12$newPasswordHash',
          }),
        }),
      )
    })

    it('throws USR_001 when not found', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      await expect(
        updateUser(TENANT_ID, 'cuid_nonexistent', { firstName: 'Nope' }, 'cuid_admin_001', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'USR_001',
        statusCode: 404,
      })
    })

    it('throws USR_002 when new email is taken', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(MOCK_USER_2 as never) // email taken

      await expect(
        updateUser(
          TENANT_ID,
          'cuid_user_new_001',
          { email: 'louis.pasteur@acme-corp.com' },
          'cuid_admin_001',
          '10.0.0.1',
        ),
      ).rejects.toMatchObject({
        code: 'USR_002',
        statusCode: 409,
      })
    })
  })

  describe('deactivateUser', () => {
    it('sets isActive to false', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      const deactivated = { ...MOCK_USER_RESPONSE, isActive: false }
      vi.mocked(prisma.user.update).mockResolvedValue(deactivated as never)

      const result = await deactivateUser(TENANT_ID, 'cuid_user_new_001', 'cuid_admin_001', '192.168.1.100')

      expect(result.isActive).toBe(false)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cuid_user_new_001' },
          data: { isActive: false },
        }),
      )
    })
  })
})

// ---- Users Routes Integration Tests ----

describe('Users Routes — Integration', () => {
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
    // tenantMiddleware always calls prisma.tenant.findUnique — mock it for all route tests
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(MOCK_TENANT_FOR_MIDDLEWARE as never)
  })

  describe('POST /api/tenants/:tenantId/users', () => {
    it('returns 201 on valid creation', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null) // email not taken
      vi.mocked(prisma.user.create).mockResolvedValue(MOCK_USER_RESPONSE as never)
      vi.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$12$routeTestHash' as never)

      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${TENANT_ID}/users`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: {
          email: 'marie.curie@acme-corp.com',
          password: 'Radium226!Secure',
          firstName: 'Marie',
          lastName: 'Curie',
          role: 'MONITORING_ENGINEER',
        },
      })

      expect(response.statusCode).toBe(201)
      const body = response.json()
      expect(body.email).toBe('marie.curie@acme-corp.com')
      expect(body.firstName).toBe('Marie')
      expect(body).not.toHaveProperty('passwordHash')
    })

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/tenants/${TENANT_ID}/users`,
        payload: {
          email: 'no.auth@acme-corp.com',
          password: 'NoAuth123!',
          firstName: 'No',
          lastName: 'Auth',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/tenants/:tenantId/users', () => {
    it('returns user list', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        MOCK_USER_RESPONSE,
        MOCK_USER_2,
      ] as never)

      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${TENANT_ID}/users`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveLength(2)
      expect(body[0].email).toBe('marie.curie@acme-corp.com')
    })
  })

  describe('GET /api/tenants/:tenantId/users/:userId', () => {
    it('returns single user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)

      const response = await app.inject({
        method: 'GET',
        url: `/api/tenants/${TENANT_ID}/users/cuid_user_new_001`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe('cuid_user_new_001')
      expect(body.email).toBe('marie.curie@acme-corp.com')
    })
  })

  describe('PATCH /api/tenants/:tenantId/users/:userId', () => {
    it('updates user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      const updated = { ...MOCK_USER_RESPONSE, firstName: 'Maria' }
      vi.mocked(prisma.user.update).mockResolvedValue(updated as never)

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/tenants/${TENANT_ID}/users/cuid_user_new_001`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { firstName: 'Maria' },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.firstName).toBe('Maria')
    })
  })

  describe('DELETE /api/tenants/:tenantId/users/:userId', () => {
    it('deactivates user', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER_RESPONSE as never)
      const deactivated = { ...MOCK_USER_RESPONSE, isActive: false }
      vi.mocked(prisma.user.update).mockResolvedValue(deactivated as never)

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/tenants/${TENANT_ID}/users/cuid_user_new_001`,
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.isActive).toBe(false)
    })
  })
})
