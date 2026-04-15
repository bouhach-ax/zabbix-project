/**
 * Core Zabbix API types shared between frontend and backend.
 * Full Zabbix-specific types live in packages/zabbix-schema.
 */

export type ZabbixVersion = '6.0' | '6.4' | '7.0'

export interface IZabbixInstance {
  id: string
  tenantId: string
  label: string
  apiUrl: string
  version?: string | null
  isActive: boolean
  lastHealthCheck?: Date | null
  healthStatus?: string | null
  createdAt: Date
}

export interface IZabbixHealthCheck {
  instanceId: string
  reachable: boolean
  version?: string
  latencyMs?: number
  error?: string
  checkedAt: Date
}

export interface ICreateZabbixInstanceParams {
  label: string
  apiUrl: string
  apiToken: string
}
