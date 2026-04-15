import { useState, useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNocStore } from '@/stores/noc.store'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  MessageSquare,
  PauseCircle,
  Monitor,
  Wifi,
  WifiOff,
  Filter,
  ShieldAlert,
  Flame,
  Activity,
  Info,
  Server,
  MapPin,
  Tag,
  ChevronDown,
  Send,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 0 | 1 | 2 | 3 | 4 | 5

interface MockAlert {
  id: string
  description: string
  severity: Severity
  host: string
  ip: string
  os: string
  status: string
  lastchange: number // unix timestamp in seconds
  value: '0' | '1'
  acknowledged: boolean
  acknowledgedBy?: string | undefined
  acknowledgedMessage?: string | undefined
  tags: { tag: string; value: string }[]
  expression?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; border: string; bg: string; text: string; icon: typeof Flame; dotColor: string }
> = {
  5: {
    label: 'Disaster',
    border: 'border-l-red-600',
    bg: 'bg-red-600/20',
    text: 'text-red-400',
    icon: Flame,
    dotColor: 'bg-red-600',
  },
  4: {
    label: 'High',
    border: 'border-l-red-500',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    icon: ShieldAlert,
    dotColor: 'bg-red-500',
  },
  3: {
    label: 'Average',
    border: 'border-l-orange-500',
    bg: 'bg-orange-500/20',
    text: 'text-orange-400',
    icon: AlertTriangle,
    dotColor: 'bg-orange-500',
  },
  2: {
    label: 'Warning',
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    icon: AlertTriangle,
    dotColor: 'bg-amber-500',
  },
  1: {
    label: 'Information',
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/20',
    text: 'text-blue-400',
    icon: Info,
    dotColor: 'bg-blue-500',
  },
  0: {
    label: 'Not classified',
    border: 'border-l-gray-500',
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    icon: Activity,
    dotColor: 'bg-gray-500',
  },
}

const SUPPRESS_DURATIONS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '8h', minutes: 480 },
]

// ---------------------------------------------------------------------------
// Mock data: realistic Zabbix-like alerts
// ---------------------------------------------------------------------------

const now = Date.now() / 1000

const MOCK_ALERTS: MockAlert[] = [
  {
    id: '1',
    description: 'Disk space critically low on /var (98.2% used)',
    severity: 5,
    host: 'app-prod-03',
    ip: '10.0.2.33',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 45,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'availability' }, { tag: 'service', value: 'e-commerce' }],
    expression: 'last(/linux_os/vfs.fs.size[/var,pused])>95',
  },
  {
    id: '2',
    description: 'High CPU utilization (95.3%) for 10 minutes',
    severity: 4,
    host: 'db-prod-01',
    ip: '10.0.1.15',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 300,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'service', value: 'database' }],
    expression: 'avg(/linux_os/system.cpu.util,10m)>90',
  },
  {
    id: '3',
    description: 'MySQL replication lag exceeds 120 seconds',
    severity: 4,
    host: 'db-replica-02',
    ip: '10.0.1.22',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 180,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'app', value: 'mysql' }],
    expression: 'last(/mysql_custom/mysql.replication.lag)>120',
  },
  {
    id: '4',
    description: 'HTTPS certificate expires in 7 days',
    severity: 3,
    host: 'lb-prod-01',
    ip: '10.0.0.10',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 600,
    value: '1',
    acknowledged: true,
    acknowledgedBy: 'admin@acme.com',
    acknowledgedMessage: 'Renewal request submitted to CA',
    tags: [{ tag: 'scope', value: 'security' }],
    expression: 'last(/tls_cert/net.tcp.ssl.expire,443)<7',
  },
  {
    id: '5',
    description: 'Swap utilization above 80%',
    severity: 3,
    host: 'app-prod-01',
    ip: '10.0.2.31',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 900,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }],
    expression: 'last(/linux_os/system.swap.size[,pused])>80',
  },
  {
    id: '6',
    description: 'Zabbix agent unreachable for 5 minutes',
    severity: 4,
    host: 'mon-agent-07',
    ip: '10.0.5.47',
    os: 'WINDOWS',
    status: 'ACTIVE',
    lastchange: now - 330,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'availability' }],
    expression: 'nodata(/zabbix_agent/agent.ping,5m)=1',
  },
  {
    id: '7',
    description: 'Network interface errors detected on eth0',
    severity: 3,
    host: 'net-switch-04',
    ip: '10.0.0.54',
    os: 'OTHER',
    status: 'ACTIVE',
    lastchange: now - 1200,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'network' }],
    expression: 'change(/snmp_if/net.if.in.errors[eth0])>0',
  },
  {
    id: '8',
    description: 'High memory utilization (92%) on application server',
    severity: 4,
    host: 'app-prod-05',
    ip: '10.0.2.35',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 480,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'service', value: 'api-gateway' }],
    expression: 'last(/linux_os/vm.memory.utilization)>90',
  },
  {
    id: '9',
    description: 'Disk I/O wait time exceeds 50ms',
    severity: 2,
    host: 'db-prod-01',
    ip: '10.0.1.15',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 2400,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }],
    expression: 'avg(/linux_os/system.io.await,5m)>50',
  },
  {
    id: '10',
    description: 'NTP time offset exceeds 500ms',
    severity: 2,
    host: 'app-prod-02',
    ip: '10.0.2.32',
    os: 'LINUX_DEBIAN',
    status: 'ACTIVE',
    lastchange: now - 3600,
    value: '1',
    acknowledged: true,
    acknowledgedBy: 'ops@acme.com',
    acknowledgedMessage: 'NTP server being reconfigured',
    tags: [{ tag: 'scope', value: 'system' }],
    expression: 'abs(last(/linux_os/system.localtime)-last(/linux_os/system.localtime.utc))>0.5',
  },
  {
    id: '11',
    description: 'HTTP response time above 3 seconds',
    severity: 3,
    host: 'web-prod-01',
    ip: '10.0.3.11',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 1500,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'service', value: 'website' }],
    expression: 'last(/http_check/web.test.time[homepage])>3',
  },
  {
    id: '12',
    description: 'Process "nginx" not running',
    severity: 5,
    host: 'web-prod-02',
    ip: '10.0.3.12',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 120,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'availability' }, { tag: 'service', value: 'website' }],
    expression: 'last(/linux_os/proc.num[nginx])=0',
  },
  {
    id: '13',
    description: 'Backup job failed on db-backup-01',
    severity: 4,
    host: 'db-backup-01',
    ip: '10.0.1.50',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 7200,
    value: '1',
    acknowledged: true,
    acknowledgedBy: 'dba@acme.com',
    acknowledgedMessage: 'Investigating storage space issue',
    tags: [{ tag: 'scope', value: 'backup' }, { tag: 'app', value: 'postgresql' }],
    expression: 'last(/backup_custom/backup.status)=0',
  },
  {
    id: '14',
    description: 'Too many open files (85% of limit)',
    severity: 2,
    host: 'app-prod-04',
    ip: '10.0.2.34',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 5400,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'system' }],
    expression: 'last(/linux_os/vfs.file.nr[open])>85',
  },
  {
    id: '15',
    description: 'Redis memory usage above 90%',
    severity: 3,
    host: 'cache-prod-01',
    ip: '10.0.4.10',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 4800,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'app', value: 'redis' }],
    expression: 'last(/redis_custom/redis.memory.pused)>90',
  },
  {
    id: '16',
    description: 'Kubernetes pod restart count high (15 in 1h)',
    severity: 3,
    host: 'k8s-worker-03',
    ip: '10.0.6.13',
    os: 'LINUX_UBUNTU',
    status: 'ACTIVE',
    lastchange: now - 2700,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'availability' }, { tag: 'service', value: 'microservices' }],
    expression: 'sum(/k8s_custom/k8s.pod.restarts,1h)>10',
  },
  {
    id: '17',
    description: 'DNS resolution time exceeds 1 second',
    severity: 1,
    host: 'dns-prod-01',
    ip: '10.0.0.2',
    os: 'LINUX_DEBIAN',
    status: 'ACTIVE',
    lastchange: now - 10800,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'network' }],
    expression: 'last(/dns_custom/dns.resolve.time)>1',
  },
  {
    id: '18',
    description: 'RabbitMQ queue depth above 10000 messages',
    severity: 4,
    host: 'mq-prod-01',
    ip: '10.0.4.20',
    os: 'LINUX_RHEL',
    status: 'ACTIVE',
    lastchange: now - 900,
    value: '1',
    acknowledged: false,
    tags: [{ tag: 'scope', value: 'performance' }, { tag: 'app', value: 'rabbitmq' }],
    expression: 'last(/rabbitmq_custom/rabbitmq.queue.depth)>10000',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(unixTs: number): string {
  const diffSec = Math.floor(Date.now() / 1000 - unixTs)
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

function formatTimestamp(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })
}

type SeverityFilter = 'all' | 5 | 4 | 3

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = SEVERITY_CONFIG[severity]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', config.bg, config.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotColor, severity === 5 && 'animate-pulse')} />
      {config.label}
    </span>
  )
}

function CounterBadge({
  label,
  count,
  colorClass,
}: {
  label: string
  count: number
  colorClass: string
}) {
  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-3 py-1.5', colorClass)}>
      <span className="text-lg font-bold text-white">{count}</span>
      <span className="text-xs font-medium text-white/80">{label}</span>
    </div>
  )
}

function AlertListItem({
  alert,
  selected,
  onClick,
}: {
  alert: MockAlert
  selected: boolean
  onClick: () => void
}) {
  const config = SEVERITY_CONFIG[alert.severity]
  const Icon = config.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left border-l-4 rounded-r-md border border-gray-700/50 px-3 py-2 transition-all duration-150',
        config.border,
        selected
          ? 'bg-primary/10 border-r-primary ring-1 ring-primary/30'
          : 'bg-brand-card hover:bg-brand-surface',
        alert.acknowledged && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', config.text, alert.severity === 5 && 'animate-pulse')} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-100 truncate leading-tight">
            {alert.description}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="font-mono text-gray-400">{alert.host}</span>
            <span className="flex items-center gap-0.5 text-gray-500">
              <Clock className="h-2.5 w-2.5" />
              {timeAgo(alert.lastchange)}
            </span>
            {alert.acknowledged && (
              <CheckCircle className="h-3 w-3 text-green-500" />
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function AlertDetail({
  alert,
  relatedAlerts,
  onAcknowledge,
  onSuppress,
}: {
  alert: MockAlert
  relatedAlerts: MockAlert[]
  onAcknowledge: (id: string, message: string) => void
  onSuppress: (id: string, minutes: number) => void
}) {
  const [ackMessage, setAckMessage] = useState('')
  const [showAckForm, setShowAckForm] = useState(false)
  const [showSuppressForm, setShowSuppressForm] = useState(false)
  const config = SEVERITY_CONFIG[alert.severity]

  return (
    <div className="space-y-4 overflow-y-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <SeverityBadge severity={alert.severity} />
          {alert.acknowledged && (
            <Badge className="bg-green-500/20 text-green-400 text-[10px]">Acknowledged</Badge>
          )}
        </div>
        <h2 className="text-lg font-semibold text-white leading-tight">{alert.description}</h2>
      </div>

      {/* Host info */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4 text-gray-400" />
            Host Information
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Hostname</p>
              <p className="font-mono text-sm text-gray-100">{alert.host}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">IP Address</p>
              <p className="font-mono text-sm text-gray-100">{alert.ip}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">OS</p>
              <p className="text-sm text-gray-100">{alert.os}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Status</p>
              <p className="text-sm text-gray-100">{alert.status}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trigger details */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-400" />
            Trigger Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {alert.expression && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Expression</p>
              <div className="rounded-md bg-[#1e1e1e] px-3 py-2 border border-gray-700">
                <code className="font-mono text-xs text-gray-200 break-all">{alert.expression}</code>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Priority</p>
              <SeverityBadge severity={alert.severity} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Duration</p>
              <p className="text-sm text-gray-100">{timeAgo(alert.lastchange)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className={cn('h-2 w-2 rounded-full', config.dotColor)} />
              <div>
                <p className="text-xs text-gray-100">Triggered</p>
                <p className="font-mono text-[11px] text-gray-500">{formatTimestamp(alert.lastchange)}</p>
              </div>
            </div>
            {alert.acknowledged && (
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <div>
                  <p className="text-xs text-gray-100">
                    Acknowledged by <span className="font-mono text-gray-300">{alert.acknowledgedBy}</span>
                  </p>
                  {alert.acknowledgedMessage && (
                    <p className="text-[11px] text-gray-400 italic">"{alert.acknowledgedMessage}"</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      {alert.tags.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
            <Tag className="h-3 w-3" /> Tags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {alert.tags.map((t, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-md bg-brand-surface px-2 py-0.5 text-[11px] text-gray-300 border border-gray-700"
              >
                <span className="text-gray-500">{t.tag}:</span>
                <span className="ml-1 font-medium">{t.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Actions</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Acknowledge */}
          {!alert.acknowledged && (
            <div>
              {!showAckForm ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowAckForm(true)}
                  className="w-full"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Acknowledge
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border border-gray-700 bg-brand-surface p-3">
                  <p className="text-xs font-medium text-gray-300">Acknowledge this alert</p>
                  <textarea
                    value={ackMessage}
                    onChange={(e) => setAckMessage(e.target.value)}
                    placeholder="Add a message (optional)..."
                    rows={2}
                    className="w-full rounded-md border border-gray-600 bg-brand-dark px-3 py-2 text-xs text-gray-200 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        onAcknowledge(alert.id, ackMessage)
                        setShowAckForm(false)
                        setAckMessage('')
                      }}
                    >
                      <Send className="mr-1 h-3 w-3" /> Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAckForm(false)
                        setAckMessage('')
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Suppress */}
          <div>
            {!showSuppressForm ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSuppressForm(true)}
                className="w-full"
              >
                <PauseCircle className="mr-2 h-4 w-4" />
                Suppress
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-gray-700 bg-brand-surface p-3">
                <p className="text-xs font-medium text-gray-300">Suppress for:</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {SUPPRESS_DURATIONS.map((d) => (
                    <Button
                      key={d.minutes}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onSuppress(alert.id, d.minutes)
                        setShowSuppressForm(false)
                      }}
                      className="text-xs"
                    >
                      {d.label}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSuppressForm(false)}
                  className="w-full"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Related alerts from same host */}
      {relatedAlerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Monitor className="h-4 w-4 text-gray-400" />
              Related Alerts on {alert.host}
              <Badge className="bg-gray-700 text-gray-300 text-[10px]">{relatedAlerts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {relatedAlerts.map((r) => (
              <div
                key={r.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border-l-2 px-2 py-1.5',
                  SEVERITY_CONFIG[r.severity].border,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', SEVERITY_CONFIG[r.severity].dotColor)} />
                <span className="text-xs text-gray-300 truncate flex-1">{r.description}</span>
                <span className="text-[10px] text-gray-500 shrink-0">{timeAgo(r.lastchange)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function NocPage() {
  const { connected } = useNocStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<SeverityFilter>('all')
  const [alerts, setAlerts] = useState<MockAlert[]>(MOCK_ALERTS)

  // Compute counts
  const counts = useMemo(() => {
    return {
      disaster: alerts.filter((a) => a.severity === 5).length,
      high: alerts.filter((a) => a.severity === 4).length,
      medium: alerts.filter((a) => a.severity === 3).length,
      low: alerts.filter((a) => a.severity <= 2).length,
    }
  }, [alerts])

  // Filtered and sorted alerts
  const filteredAlerts = useMemo(() => {
    let list = alerts
    if (filter !== 'all') {
      if (filter === 3) {
        list = list.filter((a) => a.severity >= 2 && a.severity <= 3)
      } else {
        list = list.filter((a) => a.severity === filter)
      }
    }
    // Sort by severity desc, then by lastchange desc (most recent first)
    return [...list].sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity
      return b.lastchange - a.lastchange
    })
  }, [alerts, filter])

  const selectedAlert = useMemo(
    () => alerts.find((a) => a.id === selectedId) ?? null,
    [alerts, selectedId],
  )

  const relatedAlerts = useMemo(() => {
    if (!selectedAlert) return []
    return alerts.filter((a) => a.host === selectedAlert.host && a.id !== selectedAlert.id)
  }, [alerts, selectedAlert])

  const handleAcknowledge = useCallback((id: string, message: string) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, acknowledged: true, acknowledgedBy: 'operator@acme.com', acknowledgedMessage: message || undefined }
          : a,
      ),
    )
  }, [])

  const handleSuppress = useCallback((id: string, _minutes: number) => {
    // In a real app this would call the API. For mock, remove from list.
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    setSelectedId(null)
  }, [])

  // Simulated connection state: true for mock
  const isConnected = true

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-brand-dark">
      {/* Top Bar: counters + connection + filter */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-brand-surface px-4 py-2">
        <div className="flex items-center gap-2">
          <CounterBadge label="DISASTER" count={counts.disaster} colorClass="bg-red-600" />
          <CounterBadge label="HIGH" count={counts.high} colorClass="bg-red-500" />
          <CounterBadge label="AVERAGE" count={counts.medium} colorClass="bg-orange-500" />
          <CounterBadge label="LOW" count={counts.low} colorClass="bg-blue-500" />
        </div>

        <div className="flex items-center gap-3">
          {/* Filter toggles */}
          <div className="flex items-center gap-1 rounded-lg bg-brand-dark p-0.5">
            {([
              { key: 'all' as const, label: 'All' },
              { key: 5 as const, label: 'Disaster' },
              { key: 4 as const, label: 'High' },
              { key: 3 as const, label: 'Medium' },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                  filter === f.key
                    ? 'bg-brand-card text-white'
                    : 'text-gray-400 hover:text-gray-200',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Connection indicator */}
          <div className="flex items-center gap-1.5">
            {isConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-green-400">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs text-red-400">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Alert queue */}
        <div className="w-[35%] border-r border-gray-700 flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-700/50 px-3 py-2 bg-brand-surface/50">
            <span className="text-xs font-medium text-gray-400">
              {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Activity className="h-3 w-3" />
              Auto-refresh
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredAlerts.map((alert) => (
              <AlertListItem
                key={alert.id}
                alert={alert}
                selected={selectedId === alert.id}
                onClick={() => setSelectedId(alert.id)}
              />
            ))}
            {filteredAlerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-8 w-8 text-green-500/50 mb-2" />
                <p className="text-sm text-gray-400">No alerts matching filter</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Alert detail */}
        <div className="w-[65%] overflow-y-auto p-4">
          {selectedAlert ? (
            <AlertDetail
              alert={selectedAlert}
              relatedAlerts={relatedAlerts}
              onAcknowledge={handleAcknowledge}
              onSuppress={handleSuppress}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 rounded-full bg-brand-surface p-4">
                <Monitor className="h-10 w-10 text-gray-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-300">Select an alert</h3>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                Click on an alert in the queue to view its details, take action, or investigate.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
