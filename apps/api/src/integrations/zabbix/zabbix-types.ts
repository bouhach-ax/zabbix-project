/**
 * Types for Zabbix JSON-RPC API interaction.
 */

export interface ZabbixApiRequest {
  jsonrpc: '2.0'
  method: string
  params: unknown
  id: number
  auth?: string
}

export interface ZabbixApiError {
  code: number
  data: string
  message: string
}

export interface ZabbixApiResponse<T = unknown> {
  jsonrpc: '2.0'
  result?: T
  error?: ZabbixApiError
  id: number
}

export interface ZabbixHost {
  hostid: string
  host: string
  name: string
  status: string
  available: string
  interfaces?: ZabbixHostInterface[]
  groups?: { groupid: string; name: string }[]
  parentTemplates?: { templateid: string; name: string }[]
  tags?: { tag: string; value: string }[]
}

export interface ZabbixHostInterface {
  interfaceid: string
  hostid: string
  type: string
  ip: string
  dns: string
  port: string
  main: string
}

export interface ZabbixTemplate {
  templateid: string
  host: string
  name: string
  description?: string
  groups?: { groupid: string; name: string }[]
}

export interface ZabbixItem {
  itemid: string
  hostid: string
  name: string
  key_: string
  type: number
  value_type: string
  delay: string
  status: string
  lastvalue?: string
  lastclock?: string
  error?: string
}

export interface ZabbixTrigger {
  triggerid: string
  description: string
  expression: string
  priority: string
  status: string
  value: string
  lastchange: string
  hosts?: { hostid: string; host: string; name: string }[]
  tags?: { tag: string; value: string }[]
}

export interface ZabbixEvent {
  eventid: string
  source: string
  object: string
  objectid: string
  clock: string
  value: string
  acknowledged: string
  severity: string
  name?: string
  hosts?: { hostid: string; host: string; name: string }[]
}

export interface ZabbixMaintenance {
  maintenanceid: string
  name: string
  active_since: string
  active_till: string
  description?: string
  maintenance_type: string
  hostids?: string[]
  groupids?: string[]
  timeperiods?: ZabbixTimePeriod[]
}

export interface ZabbixTimePeriod {
  timeperiod_type: number
  period: number
  start_date?: string
  start_time?: number
  every?: number
  dayofweek?: number
  day?: number
  month?: number
}

export interface ZabbixValueMap {
  valuemapid: string
  name: string
  mappings: { value: string; newvalue: string }[]
}

export interface ZabbixApiCall {
  method: string
  params: unknown
  description: string
}
