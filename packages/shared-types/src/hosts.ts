export type OsType =
  | 'LINUX_RHEL'
  | 'LINUX_UBUNTU'
  | 'LINUX_DEBIAN'
  | 'LINUX_SUSE'
  | 'WINDOWS'
  | 'AIX'
  | 'OTHER'

export type HostStatus = 'ONBOARDING' | 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED'

export type JobStatus =
  | 'PENDING'
  | 'DETECTING'
  | 'SCRIPT_GENERATED'
  | 'AGENT_DEPLOYED'
  | 'HOST_DECLARED'
  | 'OS_TEMPLATE_APPLIED'
  | 'OS_VALIDATED'
  | 'WAITING_APP_DECLARATION'
  | 'APPS_CONFIGURING'
  | 'SUCCESS'
  | 'FAILED'

export interface IHost {
  id: string
  tenantId: string
  zabbixInstanceId: string
  zabbixHostId?: string | null
  hostname: string
  ipAddress: string
  os?: OsType | null
  osVersion?: string | null
  agentVersion?: string | null
  agentPort: number
  declaredRole?: string | null
  status: HostStatus
  location?: string | null
  tags: unknown[]
  hostGroupIds: unknown[]
  createdAt: Date
  updatedAt: Date
}

export interface IProvisioningJob {
  id: string
  hostId: string
  status: JobStatus
  currentStep: string
  detectedOs?: unknown | null
  generatedScript?: string | null
  steps: unknown[]
  errorCode?: string | null
  errorMessage?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ICreateHostParams {
  hostname: string
  ipAddress: string
  zabbixInstanceId: string
  agentPort?: number
  declaredRole?: string
  location?: string
  tags?: string[]
}
