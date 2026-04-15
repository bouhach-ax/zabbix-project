import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../shared/database/prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('../../shared/cache/redis.js', () => ({
  getRedis: () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() }),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
}))

vi.mock('../../shared/crypto/encryption.js', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

import { prisma } from '../../shared/database/prisma.js'
import { logAction } from './audit.service.js'

const mockPrisma = vi.mocked(prisma)

// ===========================================================================
// Audit Service
// ===========================================================================

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('logAction', () => {
    it('creates audit log entry', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({
        id: 'audit-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'host.create',
        entityType: 'ManagedHost',
        entityId: 'host-1',
        before: null,
        after: { hostname: 'srv01' },
        comment: null,
        ipAddress: '192.168.1.100',
        userAgent: null,
        timestamp: new Date(),
      } as any)

      await logAction({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'host.create',
        entityType: 'ManagedHost',
        entityId: 'host-1',
        after: { hostname: 'srv01' },
        ipAddress: '192.168.1.100',
      })

      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
      const callArg = mockPrisma.auditLog.create.mock.calls[0]![0]!
      expect((callArg as any).data.action).toBe('host.create')
      expect((callArg as any).data.tenantId).toBe('tenant-1')
      expect((callArg as any).data.entityType).toBe('ManagedHost')
    })

    it('does not throw on DB error (swallows errors)', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'))

      // Should not throw
      await expect(
        logAction({
          tenantId: 'tenant-1',
          userId: 'user-1',
          action: 'host.create',
          entityType: 'ManagedHost',
          entityId: 'host-1',
          ipAddress: '127.0.0.1',
        }),
      ).resolves.not.toThrow()
    })

    it('stores before/after as JSON', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      const before = { status: 'ACTIVE', hostname: 'srv01' }
      const after = { status: 'DECOMMISSIONED', hostname: 'srv01' }

      await logAction({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'host.decommission',
        entityType: 'ManagedHost',
        entityId: 'host-1',
        before,
        after,
        comment: 'Decommissioned for migration',
        ipAddress: '10.0.0.1',
      })

      expect(mockPrisma.auditLog.create).toHaveBeenCalledOnce()
      const callArg = (mockPrisma.auditLog.create.mock.calls[0]![0] as any).data
      expect(callArg.before).toEqual(before)
      expect(callArg.after).toEqual(after)
      expect(callArg.comment).toBe('Decommissioned for migration')
    })

    it('stores null for missing before/after', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({} as any)

      await logAction({
        tenantId: 'tenant-1',
        userId: 'user-1',
        action: 'template.create',
        entityType: 'ManagedTemplate',
        entityId: 'tpl-1',
        ipAddress: '127.0.0.1',
      })

      const callArg = (mockPrisma.auditLog.create.mock.calls[0]![0] as any).data
      // Prisma.JsonNull is used for null values
      expect(callArg.before).toBeDefined()
      expect(callArg.after).toBeDefined()
    })
  })
})
