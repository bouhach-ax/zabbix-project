import type { OsType } from './hosts.js'

export interface IMacro {
  macro: string
  value: string
  type: 0 | 1 | 2 // 0=text, 1=secret, 2=vault
  description?: string
}

export interface IItem {
  name: string
  key: string
  type: number
  value_type: 0 | 1 | 2 | 3 | 4
  delay: string
  history: string
  trends: string
  units?: string
  description?: string
}

export interface ITrigger {
  name: string
  expression: string
  priority: 0 | 1 | 2 | 3 | 4 | 5
  description?: string
}

export interface ITemplate {
  id: string
  tenantId: string
  zabbixInstanceId: string
  zabbixTemplateId?: string | null
  name: string
  internalName: string
  targetApp: string
  targetOs: OsType
  description?: string | null
  version: number
  prerequisites: unknown[]
  macros: IMacro[]
  items: IItem[]
  triggers: ITrigger[]
  isShared: boolean
  isSystem: boolean
  createdBy: string
  deployedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ICreateTemplateParams {
  name: string
  internalName: string
  targetApp: string
  targetOs: OsType
  description?: string
  macros?: IMacro[]
  items?: IItem[]
  triggers?: ITrigger[]
}
