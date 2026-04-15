import axios from 'axios'
import type { AxiosInstance } from 'axios'
import { cacheGet, cacheSet, cacheDelPattern } from '../../shared/cache/redis.js'
import { CACHE_TTL, ZABBIX_API_PATH } from '../../config/constants.js'
import type {
  ZabbixApiResponse,
  ZabbixHost,
  ZabbixTemplate,
  ZabbixTrigger,
  ZabbixItem,
  ZabbixMaintenance,
  ZabbixEvent,
} from './zabbix-types.js'

/**
 * Central service for Zabbix JSON-RPC API interaction.
 * One instance per ZabbixInstance (API URL + token pair).
 */
export class ZabbixApiService {
  private readonly client: AxiosInstance
  private readonly cachePrefix: string
  private requestId = 1

  constructor(
    private readonly apiUrl: string,
    private readonly apiToken: string,
    private readonly instanceId: string,
    private readonly version?: string,
  ) {
    const baseURL = apiUrl.endsWith(ZABBIX_API_PATH)
      ? apiUrl
      : `${apiUrl.replace(/\/$/, '')}${ZABBIX_API_PATH}`

    this.client = axios.create({
      baseURL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    })
    this.cachePrefix = `zbx:${instanceId}`
  }

  /**
   * Low-level JSON-RPC call to Zabbix API.
   */
  private async call<T>(method: string, params: unknown): Promise<T> {
    const id = this.requestId++
    const body: Record<string, unknown> = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    }

    if (method !== 'apiinfo.version') {
      if (this.version && parseFloat(this.version) >= 6.4) {
        this.client.defaults.headers.common['Authorization'] = `Bearer ${this.apiToken}`
      } else {
        body['auth'] = this.apiToken
      }
    }

    const response = await this.client.post<ZabbixApiResponse<T>>('', body)
    const data = response.data

    if (data.error) {
      const err = data.error
      throw new Error(`Zabbix API error [${err.code}]: ${err.message} — ${err.data}`)
    }

    return data.result as T
  }

  /** Check API reachability and return version info. */
  async healthCheck(): Promise<{ reachable: boolean; version: string | null; error?: string }> {
    try {
      const version = await this.call<string>('apiinfo.version', [])
      return { reachable: true, version }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { reachable: false, version: null, error: message }
    }
  }

  /** Get API version string. */
  async getApiVersion(): Promise<string> {
    return this.call<string>('apiinfo.version', [])
  }

  /** Get hosts (cached 30s). */
  async getHosts(params?: Record<string, unknown>): Promise<ZabbixHost[]> {
    const cacheKey = `${this.cachePrefix}:hosts:${JSON.stringify(params ?? {})}`
    const cached = await cacheGet<ZabbixHost[]>(cacheKey)
    if (cached) return cached

    const result = await this.call<ZabbixHost[]>('host.get', {
      output: 'extend',
      selectInterfaces: 'extend',
      selectGroups: ['groupid', 'name'],
      selectParentTemplates: ['templateid', 'name'],
      selectTags: 'extend',
      ...params,
    })

    await cacheSet(cacheKey, result, CACHE_TTL.ZABBIX_HOSTS)
    return result
  }

  /** Get templates (cached 30s). */
  async getTemplates(params?: Record<string, unknown>): Promise<ZabbixTemplate[]> {
    const cacheKey = `${this.cachePrefix}:templates:${JSON.stringify(params ?? {})}`
    const cached = await cacheGet<ZabbixTemplate[]>(cacheKey)
    if (cached) return cached

    const result = await this.call<ZabbixTemplate[]>('template.get', {
      output: 'extend',
      ...params,
    })

    await cacheSet(cacheKey, result, CACHE_TTL.ZABBIX_TEMPLATES)
    return result
  }

  /** Get active alerts/triggers (cached 30s). */
  async getActiveAlerts(params?: Record<string, unknown>): Promise<ZabbixTrigger[]> {
    const cacheKey = `${this.cachePrefix}:alerts:${JSON.stringify(params ?? {})}`
    const cached = await cacheGet<ZabbixTrigger[]>(cacheKey)
    if (cached) return cached

    const result = await this.call<ZabbixTrigger[]>('trigger.get', {
      output: 'extend',
      selectHosts: ['hostid', 'host', 'name'],
      selectTags: 'extend',
      filter: { value: 1 },
      sortfield: 'priority',
      sortorder: 'DESC',
      ...params,
    })

    await cacheSet(cacheKey, result, CACHE_TTL.ZABBIX_ALERTS)
    return result
  }

  /** Get events with optional filters. */
  async getEvents(params?: Record<string, unknown>): Promise<ZabbixEvent[]> {
    return this.call<ZabbixEvent[]>('event.get', {
      output: 'extend',
      selectHosts: ['hostid', 'host', 'name'],
      sortfield: ['clock'],
      sortorder: 'DESC',
      ...params,
    })
  }

  /** Acknowledge an event/trigger. */
  async acknowledgeEvent(eventIds: string[], message: string, action = 6): Promise<void> {
    await this.call('event.acknowledge', {
      eventids: eventIds,
      action,
      message,
    })
  }

  /** Get item current value — NOT cached. */
  async getItemCurrentValue(hostId: string, key: string): Promise<string | null> {
    const items = await this.call<ZabbixItem[]>('item.get', {
      output: ['lastvalue', 'lastclock', 'key_'],
      hostids: hostId,
      search: { key_: key },
      limit: 1,
    })
    return items[0]?.lastvalue ?? null
  }

  /** Create a template. Returns the templateid. */
  async createTemplate(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ templateids: string[] }>('template.create', params)
    await this.invalidateCache('templates')
    return result.templateids[0] as string
  }

  /** Create value maps on a template. */
  async createValueMap(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ valuemapids: string[] }>('valuemap.create', params)
    return result.valuemapids[0] as string
  }

  /** Create user macros. */
  async createUserMacro(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ hostmacroids: string[] }>('usermacro.create', params)
    return result.hostmacroids[0] as string
  }

  /** Create items. */
  async createItem(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ itemids: string[] }>('item.create', params)
    return result.itemids[0] as string
  }

  /** Create triggers. */
  async createTrigger(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ triggerids: string[] }>('trigger.create', params)
    return result.triggerids[0] as string
  }

  /** Create a discovery rule. */
  async createDiscoveryRule(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ itemids: string[] }>('discoveryrule.create', params)
    return result.itemids[0] as string
  }

  /** Create a host in Zabbix. */
  async createHost(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ hostids: string[] }>('host.create', params)
    await this.invalidateCache('hosts')
    return result.hostids[0] as string
  }

  /** Update a host. */
  async updateHost(params: Record<string, unknown>): Promise<void> {
    await this.call('host.update', params)
    await this.invalidateCache('hosts')
  }

  /** Delete a template in Zabbix (for rollback). */
  async deleteTemplate(templateId: string): Promise<void> {
    await this.call('template.delete', [templateId])
    await this.invalidateCache('templates')
  }

  /** Create a maintenance period. */
  async createMaintenance(params: Record<string, unknown>): Promise<string> {
    const result = await this.call<{ maintenanceids: string[] }>('maintenance.create', params)
    return result.maintenanceids[0] as string
  }

  /** Get maintenance periods. */
  async getMaintenances(params?: Record<string, unknown>): Promise<ZabbixMaintenance[]> {
    return this.call<ZabbixMaintenance[]>('maintenance.get', {
      output: 'extend',
      selectTimeperiods: 'extend',
      ...params,
    })
  }

  /** Update a maintenance period. */
  async updateMaintenance(params: Record<string, unknown>): Promise<void> {
    await this.call('maintenance.update', params)
  }

  /** Delete a maintenance period. */
  async deleteMaintenance(maintenanceId: string): Promise<void> {
    await this.call('maintenance.delete', [maintenanceId])
  }

  /** Generic API call (for template builder generator). */
  async execute<T = unknown>(method: string, params: unknown): Promise<T> {
    return this.call<T>(method, params)
  }

  private async invalidateCache(category: string): Promise<void> {
    await cacheDelPattern(`${this.cachePrefix}:${category}:*`)
  }
}
