export type AlertSeverity = 0 | 1 | 2 | 3 | 4 | 5 // Zabbix severity levels

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  0: 'Not classified',
  1: 'Information',
  2: 'Warning',
  3: 'Average',
  4: 'High',
  5: 'Disaster',
}

export interface IAlert {
  id: string
  tenantId: string
  zabbixInstanceId: string
  zabbixTriggerId: string
  zabbixEventId: string
  hostname: string
  ipAddress?: string
  triggerName: string
  severity: AlertSeverity
  status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED'
  correlationGroupId?: string | null
  score?: number | null
  tags: Record<string, string>
  firstOccurrence: Date
  lastOccurrence: Date
  acknowledgedAt?: Date | null
  acknowledgedBy?: string | null
}

export interface ICorrelationGroup {
  id: string
  tenantId: string
  rootCause?: IAlert
  members: IAlert[]
  score: number
  type: 'TOPOLOGICAL' | 'TEMPORAL' | 'TAG_BASED' | 'CUSTOM'
  createdAt: Date
}
