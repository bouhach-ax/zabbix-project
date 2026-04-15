import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────
const mockPost = vi.fn()

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockPost,
      defaults: { headers: { common: {} } },
    })),
  },
}))

vi.mock('../../shared/cache/redis.js', () => ({
  getRedis: () => ({ get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() }),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
  cacheDelPattern: vi.fn(),
}))

import { cacheGet, cacheSet, cacheDelPattern } from '../../shared/cache/redis.js'
import { ZabbixApiService } from './ZabbixApiService.js'

// ═══════════════════════════════════════════════════════════
//  ZabbixApiService TESTS
// ═══════════════════════════════════════════════════════════

describe('ZabbixApiService', () => {
  let service: ZabbixApiService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ZabbixApiService(
      'https://zabbix.example.com',
      'test-api-token',
      'inst-1',
      '6.4',
    )
  })

  describe('healthCheck', () => {
    it('returns reachable with version on success', async () => {
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: '6.4.0', id: 1 },
      })

      const result = await service.healthCheck()

      expect(result.reachable).toBe(true)
      expect(result.version).toBe('6.4.0')
      expect(result.error).toBeUndefined()
    })

    it('returns unreachable on network error', async () => {
      mockPost.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await service.healthCheck()

      expect(result.reachable).toBe(false)
      expect(result.version).toBeNull()
      expect(result.error).toContain('ECONNREFUSED')
    })

    it('returns unreachable on Zabbix API error', async () => {
      mockPost.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params', data: 'No permissions' },
          id: 1,
        },
      })

      const result = await service.healthCheck()

      expect(result.reachable).toBe(false)
      expect(result.error).toContain('Invalid params')
    })
  })

  describe('getHosts', () => {
    it('returns cached hosts on cache hit', async () => {
      const cachedHosts = [
        { hostid: '10001', host: 'web01', name: 'Web Server 01' },
        { hostid: '10002', host: 'db01', name: 'DB Server 01' },
      ]
      vi.mocked(cacheGet).mockResolvedValueOnce(cachedHosts)

      const result = await service.getHosts()

      expect(result).toEqual(cachedHosts)
      expect(mockPost).not.toHaveBeenCalled()
    })

    it('calls Zabbix API on cache miss and caches result', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce(null)
      const apiHosts = [{ hostid: '10001', host: 'web01', name: 'Web Server 01' }]
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: apiHosts, id: 1 },
      })

      const result = await service.getHosts()

      expect(result).toEqual(apiHosts)
      expect(mockPost).toHaveBeenCalled()
      expect(cacheSet).toHaveBeenCalledWith(
        expect.stringContaining('zbx:inst-1:hosts:'),
        apiHosts,
        30,
      )
    })
  })

  describe('getActiveAlerts', () => {
    it('returns cached alerts on cache hit', async () => {
      const cachedAlerts = [
        { triggerid: '1', description: 'High CPU', priority: '4' },
      ]
      vi.mocked(cacheGet).mockResolvedValueOnce(cachedAlerts)

      const result = await service.getActiveAlerts()

      expect(result).toEqual(cachedAlerts)
      expect(mockPost).not.toHaveBeenCalled()
    })

    it('calls Zabbix API on cache miss', async () => {
      vi.mocked(cacheGet).mockResolvedValueOnce(null)
      const apiAlerts = [{ triggerid: '1', description: 'Disk full', priority: '5' }]
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: apiAlerts, id: 1 },
      })

      const result = await service.getActiveAlerts()

      expect(result).toEqual(apiAlerts)
      expect(cacheSet).toHaveBeenCalledWith(
        expect.stringContaining('zbx:inst-1:alerts:'),
        apiAlerts,
        30,
      )
    })
  })

  describe('getItemCurrentValue', () => {
    it('never uses cache', async () => {
      mockPost.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: [{ lastvalue: '42.5', lastclock: '1700000000', key_: 'system.cpu.load' }],
          id: 1,
        },
      })

      const result = await service.getItemCurrentValue('10001', 'system.cpu.load')

      expect(result).toBe('42.5')
      expect(cacheGet).not.toHaveBeenCalled()
      expect(cacheSet).not.toHaveBeenCalled()
    })

    it('returns null when no items found', async () => {
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: [], id: 1 },
      })

      const result = await service.getItemCurrentValue('10001', 'nonexistent.key')

      expect(result).toBeNull()
    })
  })

  describe('createTemplate', () => {
    it('invalidates template cache after creation', async () => {
      mockPost.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: { templateids: ['50001'] },
          id: 1,
        },
      })

      const result = await service.createTemplate({
        host: 'Custom_Template',
        groups: [{ groupid: '1' }],
        name: 'Custom Template',
      })

      expect(result).toBe('50001')
      expect(cacheDelPattern).toHaveBeenCalledWith('zbx:inst-1:templates:*')
    })
  })

  describe('createHost', () => {
    it('invalidates host cache after creation', async () => {
      mockPost.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: { hostids: ['10099'] },
          id: 1,
        },
      })

      const result = await service.createHost({
        host: 'new-host',
        interfaces: [{ type: 1, main: 1, useip: 1, ip: '10.0.0.1', dns: '', port: '10050' }],
        groups: [{ groupid: '2' }],
      })

      expect(result).toBe('10099')
      expect(cacheDelPattern).toHaveBeenCalledWith('zbx:inst-1:hosts:*')
    })
  })

  describe('getApiVersion', () => {
    it('returns version string', async () => {
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: '7.0.0', id: 1 },
      })

      const result = await service.getApiVersion()

      expect(result).toBe('7.0.0')
    })
  })

  describe('authentication handling', () => {
    it('uses Bearer header for version >= 6.4', async () => {
      const service64 = new ZabbixApiService(
        'https://zabbix.example.com',
        'my-token',
        'inst-2',
        '6.4',
      )

      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: [], id: 1 },
      })

      await service64.getHosts()

      // For version >= 6.4, auth token should be in Authorization header rather than body
      const callBody = mockPost.mock.calls[0]![1]
      expect(callBody).not.toHaveProperty('auth')
    })

    it('uses auth field in body for versions < 6.4', async () => {
      const service60 = new ZabbixApiService(
        'https://zabbix.example.com',
        'my-token',
        'inst-3',
        '6.0',
      )

      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: [], id: 1 },
      })

      await service60.getHosts()

      const callBody = mockPost.mock.calls[0]![1]
      expect(callBody).toHaveProperty('auth', 'my-token')
    })
  })

  describe('deleteTemplate', () => {
    it('invalidates template cache after deletion', async () => {
      mockPost.mockResolvedValue({
        data: { jsonrpc: '2.0', result: { templateids: ['50001'] }, id: 1 },
      })

      await service.deleteTemplate('50001')

      expect(cacheDelPattern).toHaveBeenCalledWith('zbx:inst-1:templates:*')
    })
  })
})
