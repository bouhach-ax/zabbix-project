export interface IAuditLog {
  id: string
  tenantId: string
  userId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown | null
  after?: unknown | null
  comment?: string | null
  ipAddress: string
  userAgent?: string | null
  timestamp: Date
}

export interface ICreateAuditLogParams {
  tenantId: string
  userId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
  comment?: string
  ipAddress: string
  userAgent?: string
}
