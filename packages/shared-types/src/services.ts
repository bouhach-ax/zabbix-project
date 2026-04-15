export interface IBusinessService {
  id: string
  tenantId: string
  zabbixInstanceId: string
  zabbixServiceId?: string | null
  name: string
  description?: string | null
  slaTarget: number
  weightedHealth: boolean
  healthScore?: number
  components: IServiceComponent[]
  createdAt: Date
}

export interface IServiceComponent {
  id: string
  serviceId: string
  zabbixHostId: string
  zabbixItemIds: string[]
  weight: number
  label?: string | null
}

export interface ISlaReport {
  id: string
  tenantId: string
  serviceId: string
  periodFrom: Date
  periodTo: Date
  availability: number
  slaTarget: number
  isCompliant: boolean
  incidents: IIncident[]
  summary?: string | null
  pdfPath?: string | null
  generatedAt: Date
}

export interface IIncident {
  startTime: Date
  endTime?: Date
  duration: number // seconds
  description: string
  severity: number
}
