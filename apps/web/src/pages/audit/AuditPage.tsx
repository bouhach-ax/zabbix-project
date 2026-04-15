import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { ChevronDown, ChevronRight, Search, FileText, Shield, Server, Users, Settings } from 'lucide-react'

const ENTITY_TYPES = ['All', 'ManagedHost', 'ZabbixInstance', 'ManagedTemplate', 'User', 'Tenant', 'CorrelationRule'] as const

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  HOST_CREATED: 'success',
  HOST_UPDATED: 'info',
  HOST_DELETED: 'danger',
  INSTANCE_CREATED: 'success',
  INSTANCE_UPDATED: 'info',
  INSTANCE_DELETED: 'danger',
  TEMPLATE_CREATED: 'success',
  TEMPLATE_DEPLOYED: 'info',
  USER_CREATED: 'success',
  USER_DEACTIVATED: 'warning',
  LOGIN_SUCCESS: 'default',
  LOGIN_FAILED: 'danger',
  MAINTENANCE_CREATED: 'warning',
  RULE_CREATED: 'success',
}

const ENTITY_ICONS: Record<string, React.ElementType> = {
  ManagedHost: Server,
  ZabbixInstance: Settings,
  ManagedTemplate: FileText,
  User: Users,
  Tenant: Shield,
}

const MOCK_AUDIT = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'HOST_CREATED',
    entityType: 'ManagedHost',
    entityId: 'clx8f3k2a0001',
    ipAddress: '192.168.1.10',
    before: null,
    after: { hostname: 'web-prod-01', ipAddress: '10.0.1.5', os: 'LINUX_UBUNTU', status: 'ONBOARDING' },
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    userId: 'usr-2',
    user: { firstName: 'John', lastName: 'Doe' },
    action: 'INSTANCE_CREATED',
    entityType: 'ZabbixInstance',
    entityId: 'clx8g4l3b0002',
    ipAddress: '192.168.1.11',
    before: null,
    after: { label: 'Production Zabbix', apiUrl: 'https://zabbix.example.com', version: '6.4.0' },
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'TEMPLATE_CREATED',
    entityType: 'ManagedTemplate',
    entityId: 'clx8h5m4c0003',
    ipAddress: '192.168.1.10',
    before: null,
    after: { name: 'Oracle 19c Monitoring', internalName: 'Custom_Oracle_19c', targetApp: 'Oracle', targetOs: 'LINUX_RHEL' },
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    userId: 'usr-3',
    user: { firstName: 'Sarah', lastName: 'Operator' },
    action: 'HOST_UPDATED',
    entityType: 'ManagedHost',
    entityId: 'clx8f3k2a0001',
    ipAddress: '192.168.1.15',
    before: { status: 'ONBOARDING', tags: [] },
    after: { status: 'ACTIVE', tags: ['env:production', 'team:infra'] },
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 10800000).toISOString(),
    userId: 'usr-2',
    user: { firstName: 'John', lastName: 'Doe' },
    action: 'TEMPLATE_DEPLOYED',
    entityType: 'ManagedTemplate',
    entityId: 'clx8h5m4c0003',
    ipAddress: '192.168.1.11',
    before: { deployedAt: null },
    after: { deployedAt: '2026-04-15T07:30:00Z', zabbixTemplateId: '10421' },
  },
  {
    id: '6',
    timestamp: new Date(Date.now() - 14400000).toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: 'clx8i6n5d0004',
    ipAddress: '192.168.1.10',
    before: null,
    after: { email: 'mike@company.com', firstName: 'Mike', lastName: 'Manager', role: 'MANAGER' },
  },
  {
    id: '7',
    timestamp: new Date(Date.now() - 18000000).toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'LOGIN_SUCCESS',
    entityType: 'User',
    entityId: 'usr-1',
    ipAddress: '192.168.1.10',
    before: null,
    after: { lastLoginAt: new Date(Date.now() - 18000000).toISOString() },
  },
  {
    id: '8',
    timestamp: new Date(Date.now() - 21600000).toISOString(),
    userId: 'usr-4',
    user: { firstName: 'Mike', lastName: 'Manager' },
    action: 'MAINTENANCE_CREATED',
    entityType: 'ManagedHost',
    entityId: 'clx8f3k2a0001',
    ipAddress: '192.168.1.20',
    before: { status: 'ACTIVE' },
    after: { status: 'MAINTENANCE', maintenanceWindow: '2026-04-15T22:00:00Z - 2026-04-16T06:00:00Z' },
  },
  {
    id: '9',
    timestamp: new Date(Date.now() - 43200000).toISOString(),
    userId: 'usr-2',
    user: { firstName: 'John', lastName: 'Doe' },
    action: 'HOST_CREATED',
    entityType: 'ManagedHost',
    entityId: 'clx8j7o6e0005',
    ipAddress: '192.168.1.11',
    before: null,
    after: { hostname: 'db-prod-02', ipAddress: '10.0.2.12', os: 'LINUX_RHEL', status: 'ONBOARDING' },
  },
  {
    id: '10',
    timestamp: new Date(Date.now() - 50400000).toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'RULE_CREATED',
    entityType: 'CorrelationRule',
    entityId: 'clx8k8p7f0006',
    ipAddress: '192.168.1.10',
    before: null,
    after: { name: 'Network Segment Correlation', type: 'TOPOLOGICAL', timeWindow: 120 },
  },
  {
    id: '11',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    userId: 'usr-1',
    user: { firstName: 'Admin', lastName: 'User' },
    action: 'USER_DEACTIVATED',
    entityType: 'User',
    entityId: 'clx8l9q8g0007',
    ipAddress: '192.168.1.10',
    before: { isActive: true },
    after: { isActive: false, reason: 'Employee offboarding' },
  },
  {
    id: '12',
    timestamp: new Date(Date.now() - 90000000).toISOString(),
    userId: 'usr-5',
    user: { firstName: 'Unknown', lastName: 'IP' },
    action: 'LOGIN_FAILED',
    entityType: 'User',
    entityId: 'unknown',
    ipAddress: '203.0.113.42',
    before: null,
    after: { email: 'admin@company.com', reason: 'Invalid credentials' },
  },
]

const PAGE_SIZE = 20

export default function AuditPage() {
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const filtered = MOCK_AUDIT.filter((entry) => {
    if (entityTypeFilter !== 'All' && entry.entityType !== entityTypeFilter) return false
    if (searchQuery && !entry.action.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (dateFrom && new Date(entry.timestamp) < new Date(dateFrom)) return false
    if (dateTo && new Date(entry.timestamp) > new Date(dateTo + 'T23:59:59')) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function truncateId(id: string) {
    if (id.length <= 12) return id
    return id.slice(0, 8) + '...' + id.slice(-4)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="mt-1 text-sm text-gray-400">
          Track all changes across your ZabbixPilot tenant
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <select
                value={entityTypeFilter}
                onChange={(e) => {
                  setEntityTypeFilter(e.target.value)
                  setPage(1)
                }}
                className="h-10 rounded-md border border-gray-600 bg-brand-surface px-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'All' ? 'All Entity Types' : t}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search actions..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>From</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="w-40"
              />
              <span>To</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="text-sm text-gray-400">
        {filtered.length} audit {filtered.length === 1 ? 'entry' : 'entries'} found
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                  No audit entries match the current filters.
                </TableCell>
              </TableRow>
            )}
            {paginated.map((entry) => {
              const isExpanded = expandedRow === entry.id
              const EntityIcon = ENTITY_ICONS[entry.entityType] ?? FileText

              return (
                <tr key={entry.id} className="group">
                  <td colSpan={7} className="p-0">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setExpandedRow(isExpanded ? null : entry.id)
                        }
                      }}
                      className="flex items-center border-b border-gray-700 px-4 py-3 transition-colors hover:bg-brand-card/50 cursor-pointer"
                    >
                      <div className="w-8 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        <span className="font-mono text-xs text-gray-300">
                          {formatDate(entry.timestamp)}
                        </span>
                        <span className="text-sm text-gray-200">
                          {entry.user.firstName} {entry.user.lastName}
                        </span>
                        <div>
                          <Badge variant={ACTION_COLORS[entry.action] ?? 'default'}>
                            {entry.action}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-gray-300">
                          <EntityIcon className="h-3.5 w-3.5 text-gray-500" />
                          {entry.entityType}
                        </div>
                        <span
                          className="font-mono text-xs text-gray-400"
                          title={entry.entityId}
                        >
                          {truncateId(entry.entityId)}
                        </span>
                        <span className="font-mono text-xs text-gray-400">
                          {entry.ipAddress}
                        </span>
                      </div>
                    </div>

                    {/* Expanded diff view */}
                    {isExpanded && (
                      <div className="border-b border-gray-700 bg-brand-surface/50 px-12 py-4">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                              Before
                            </h4>
                            {entry.before ? (
                              <pre className="rounded-md bg-brand-dark p-3 font-mono text-xs text-gray-300 overflow-auto max-h-48">
                                {JSON.stringify(entry.before, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-sm italic text-gray-500">No previous state (new entity)</p>
                            )}
                          </div>
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                              After
                            </h4>
                            {entry.after ? (
                              <pre className="rounded-md bg-brand-dark p-3 font-mono text-xs text-green-400/90 overflow-auto max-h-48">
                                {JSON.stringify(entry.after, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-sm italic text-gray-500">No data</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
