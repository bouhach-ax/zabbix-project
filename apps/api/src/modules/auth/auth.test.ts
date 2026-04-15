import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

// ---- Mocks (hoisted) ----

// Use hardcoded secrets matching setup.ts — evaluated at module scope before setup runs
const TEST_JWT_SECRET = 'test_jwt_secret_minimum_32_chars_long_xxxxxxx'
const TEST_JWT_REFRESH_SECRET = 'test_refresh_secret_minimum_32_chars_long_xxx'

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
import { login, refresh, logout } from './auth.service.js'
import { prisma } from '../../shared/database/prisma.js'
import { buildApp } from '../../app.js'

// ---- Helpers ----

function createTestToken(payload: {
  sub: string
  tenantId: string
  role: string
  email: string
}): string {
  return jwt.sign(payload, TEST_JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 })
}

function createTestRefreshToken(payload: {
  sub: string
  tenantId: string
  jti: string
}): string {
  return jwt.sign(payload, TEST_JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '30d',
  })
}

const ADMIN_TOKEN = createTestToken({
  sub: 'cuid_admin_001',
  tenantId: 'cuid_tenant_001',
  role: 'ADMIN',
  email: 'admin@acme-corp.com',
})

const USER_TOKEN = createTestToken({
  sub: 'cuid_user_001',
  tenantId: 'cuid_tenant_001',
  role: 'NOC_OPERATOR',
  email: 'operator@acme-corp.com',
})

const MOCK_USER = {
  id: 'cuid_user_login_001',
  tenantId: 'cuid_tenant_001',
  email: 'engineer@acme-corp.com',
  passwordHash: '$2a$12$hashedPasswordPlaceholder',
  firstName: 'Jean',
  lastName: 'Dupont',
  role: 'MONITORING_ENGINEER' as const,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2025-01-15T10:00:00Z'),
  tenant: { id: 'cuid_tenant_001', isActive: true },
}

const MOCK_ME_USER = {
  id: 'cuid_admin_001',
  email: 'admin@acme-corp.com',
  firstName: 'Admin',
  lastName: 'Root',
  role: 'ADMIN' as const,
  tenantId: 'cuid_tenant_001',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2025-01-10T08:00:00Z'),
}

// ---- Auth Service Unit Tests ----

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('returns tokens and user on valid credentials', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
      vi.mocked(prisma.user.update).mockResolvedValue(MOCK_USER as never)

      const result = await login(
        'engineer@acme-corp.com',
        'SecurePass123!',
        '192.168.1.100',
      )

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('user')
      expect(result.user.email).toBe('engineer@acme-corp.com')
      expect(result.user.firstName).toBe('Jean')
      expect(result.user.lastName).toBe('Dupont')
      expect(result.user.role).toBe('MONITORING_ENGINEER')
      expect(result.user.tenantId).toBe('cuid_tenant_001')
      // Verify tokens are valid JWTs
      const decoded = jwt.verify(result.accessToken, TEST_JWT_SECRET) as Record<string, unknown>
      expect(decoded['sub']).toBe('cuid_user_login_001')
    })

    it('throws AUTH_001 on wrong email', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      await expect(
        login('nonexistent@acme-corp.com', 'AnyPassword1!', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_001',
        statusCode: 401,
      })
    })

    it('throws AUTH_001 on wrong password', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)

      await expect(
        login('engineer@acme-corp.com', 'WrongPassword99!', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_001',
        statusCode: 401,
      })
    })

    it('throws AUTH_006 on disabled user', async () => {
      const disabledUser = { ...MOCK_USER, isActive: false }
      vi.mocked(prisma.user.findFirst).mockResolvedValue(disabledUser as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)

      await expect(
        login('engineer@acme-corp.com', 'SecurePass123!', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_006',
        statusCode: 403,
      })
    })

    it('throws AUTH_006 on disabled tenant', async () => {
      const userWithInactiveTenant = {
        ...MOCK_USER,
        tenant: { id: 'cuid_tenant_001', isActive: false },
      }
      vi.mocked(prisma.user.findFirst).mockResolvedValue(userWithInactiveTenant as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)

      await expect(
        login('engineer@acme-corp.com', 'SecurePass123!', '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_006',
        statusCode: 403,
      })
    })

    it('updates lastLoginAt on successful login', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
      vi.mocked(prisma.user.update).mockResolvedValue(MOCK_USER as never)

      await login('engineer@acme-corp.com', 'SecurePass123!', '10.0.0.1')

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cuid_user_login_001' },
          data: { lastLoginAt: expect.any(Date) },
        }),
      )
    })
  })

  describe('refresh', () => {
    it('returns new token pair on valid refresh token', async () => {
      const jti = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      mockRedis.get.mockResolvedValue(null) // not blacklisted
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        email: 'engineer@acme-corp.com',
        role: 'MONITORING_ENGINEER',
        isActive: true,
      } as never)

      const result = await refresh(refreshToken, '192.168.1.100')

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(typeof result.accessToken).toBe('string')
      expect(typeof result.refreshToken).toBe('string')
    })

    it('throws AUTH_004 on blacklisted token', async () => {
      const jti = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      mockRedis.get.mockResolvedValue('1') // blacklisted

      await expect(
        refresh(refreshToken, '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_004',
        statusCode: 401,
      })
    })

    it('throws AUTH_004 on expired/invalid token', async () => {
      const expiredToken = jwt.sign(
        { sub: 'cuid_user_login_001', tenantId: 'cuid_tenant_001', jti: 'old-jti' },
        TEST_JWT_REFRESH_SECRET,
        { algorithm: 'HS256', expiresIn: '-10s' },
      )

      await expect(
        refresh(expiredToken, '10.0.0.1'),
      ).rejects.toMatchObject({
        code: 'AUTH_004',
        statusCode: 401,
      })
    })

    it('blacklists the old token jti after rotation', async () => {
      const jti = 'c9d8e7f6-5a4b-3c2d-1e0f-abcdef123456'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      mockRedis.get.mockResolvedValue(null)
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        email: 'engineer@acme-corp.com',
        role: 'MONITORING_ENGINEER',
        isActive: true,
      } as never)

      await refresh(refreshToken, '192.168.1.100')

      // Verify old jti was blacklisted in Redis
      expect(mockRedis.set).toHaveBeenCalledWith(
        `blacklist:refresh:${jti}`,
        '1',
        'EX',
        expect.any(Number),
      )
      // Verify old refresh marker was deleted
      expect(mockRedis.del).toHaveBeenCalledWith(
        `refresh:user:cuid_user_login_001:${jti}`,
      )
    })
  })

  describe('logout', () => {
    it('blacklists the refresh token', async () => {
      const jti = 'd4e5f6a7-b8c9-0d1e-2f3a-456789abcdef'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      await logout(
        refreshToken,
        'cuid_user_login_001',
        'cuid_tenant_001',
        '192.168.1.100',
      )

      expect(mockRedis.set).toHaveBeenCalledWith(
        `blacklist:refresh:${jti}`,
        '1',
        'EX',
        expect.any(Number),
      )
      expect(mockRedis.del).toHaveBeenCalledWith(
        `refresh:user:cuid_user_login_001:${jti}`,
      )
    })

    it('succeeds silently on already-invalid token', async () => {
      const invalidToken = 'this.is.not.a.valid.jwt'

      // Should not throw
      await expect(
        logout(invalidToken, 'cuid_user_login_001', 'cuid_tenant_001', '10.0.0.1'),
      ).resolves.toBeUndefined()
    })
  })
})

// ---- Auth Routes Integration Tests ----

describe('Auth Routes — Integration', () => {
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

  describe('POST /api/auth/login', () => {
    it('returns 200 with tokens on valid login', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_USER as never)
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
      vi.mocked(prisma.user.update).mockResolvedValue(MOCK_USER as never)

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'engineer@acme-corp.com',
          password: 'SecurePass123!',
        },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('accessToken')
      expect(body).toHaveProperty('refreshToken')
      expect(body).toHaveProperty('user')
      expect(body.user.email).toBe('engineer@acme-corp.com')
    })

    it('returns 401 on invalid credentials', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'nobody@acme-corp.com',
          password: 'WrongPass123!',
        },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('AUTH_001')
    })

    it('returns 400 on missing email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          password: 'SomePassword1!',
        },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.error.code).toBe('VAL_001')
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with new tokens', async () => {
      const jti = 'e5f6a7b8-c9d0-1e2f-3a4b-567890abcdef'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      mockRedis.get.mockResolvedValue(null) // not blacklisted
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'cuid_user_login_001',
        tenantId: 'cuid_tenant_001',
        email: 'engineer@acme-corp.com',
        role: 'MONITORING_ENGINEER',
        isActive: true,
      } as never)

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body).toHaveProperty('accessToken')
      expect(body).toHaveProperty('refreshToken')
    })

    it('returns 401 on invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: 'completely.invalid.token' },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json()
      expect(body.error.code).toBe('AUTH_004')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('returns 204 on successful logout', async () => {
      const jti = 'f6a7b8c9-d0e1-2f3a-4b5c-67890abcdef0'
      const refreshToken = createTestRefreshToken({
        sub: 'cuid_admin_001',
        tenantId: 'cuid_tenant_001',
        jti,
      })

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        payload: { refreshToken },
      })

      expect(response.statusCode).toBe(204)
    })

    it('returns 401 without auth header', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: 'some-token' },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns current user with valid token', async () => {
      // tenantMiddleware calls prisma.tenant.findUnique
      vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
        id: 'cuid_tenant_001',
        isActive: true,
        slug: 'acme-corp',
        plan: 'ENTERPRISE',
      } as never)

      // /me route calls prisma.user.findFirst
      vi.mocked(prisma.user.findFirst).mockResolvedValue(MOCK_ME_USER as never)

      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.id).toBe('cuid_admin_001')
      expect(body.email).toBe('admin@acme-corp.com')
      expect(body.role).toBe('ADMIN')
      expect(body).not.toHaveProperty('passwordHash')
    })

    it('returns 401 without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
      })

      expect(response.statusCode).toBe(401)
    })
  })
})
