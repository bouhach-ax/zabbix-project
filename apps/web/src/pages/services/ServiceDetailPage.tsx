import { useParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ArrowLeft, Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'

const MOCK_SERVICES: Record<string, {
  id: string
  name: string
  slaTarget: number
  availability: number
  description: string
  components: {
    id: string
    label: string
    zabbixHostId: string
    hostname: string
    health: 'ok' | 'warning' | 'critical'
    weight: number
  }[]
  incidents: {
    id: string
    timestamp: string
    duration: string
    description: string
    severity: 'warning' | 'high' | 'disaster'
  }[]
}> = {
  '1': {
    id: '1',
    name: 'E-Commerce Platform',
    slaTarget: 99.9,
    availability: 99.95,
    description: 'Primary e-commerce platform serving customer-facing transactions.',
    components: [
      { id: 'c1', label: 'Web Frontend', zabbixHostId: '10201', hostname: 'web-prod-01', health: 'ok', weight: 1.5 },
      { id: 'c2', label: 'Web Frontend 2', zabbixHostId: '10202', hostname: 'web-prod-02', health: 'ok', weight: 1.5 },
      { id: 'c3', label: 'API Gateway', zabbixHostId: '10203', hostname: 'api-gw-01', health: 'ok', weight: 2.0 },
      { id: 'c4', label: 'Product DB Primary', zabbixHostId: '10204', hostname: 'db-prod-01', health: 'ok', weight: 2.5 },
      { id: 'c5', label: 'Product DB Replica', zabbixHostId: '10205', hostname: 'db-prod-02', health: 'ok', weight: 1.0 },
      { id: 'c6', label: 'Redis Cache', zabbixHostId: '10206', hostname: 'cache-prod-01', health: 'ok', weight: 1.0 },
      { id: 'c7', label: 'Search Engine', zabbixHostId: '10207', hostname: 'search-prod-01', health: 'warning', weight: 0.8 },
      { id: 'c8', label: 'CDN Origin', zabbixHostId: '10208', hostname: 'cdn-origin-01', health: 'ok', weight: 0.7 },
    ],
    incidents: [
      { id: 'i1', timestamp: '2026-04-10T14:32:00Z', duration: '12m', description: 'Search engine high latency - query time > 2s', severity: 'warning' },
      { id: 'i2', timestamp: '2026-04-05T03:15:00Z', duration: '3m', description: 'Redis cache connection pool exhaustion', severity: 'high' },
    ],
  },
  '2': {
    id: '2',
    name: 'Payment Gateway',
    slaTarget: 99.99,
    availability: 99.8,
    description: 'Critical payment processing gateway handling all financial transactions.',
    components: [
      { id: 'c1', label: 'Payment API', zabbixHostId: '10301', hostname: 'pay-api-01', health: 'ok', weight: 2.0 },
      { id: 'c2', label: 'Payment API 2', zabbixHostId: '10302', hostname: 'pay-api-02', health: 'critical', weight: 2.0 },
      { id: 'c3', label: 'Transaction DB', zabbixHostId: '10303', hostname: 'pay-db-01', health: 'ok', weight: 3.0 },
      { id: 'c4', label: 'Fraud Detection', zabbixHostId: '10304', hostname: 'fraud-01', health: 'ok', weight: 1.5 },
      { id: 'c5', label: 'HSM Gateway', zabbixHostId: '10305', hostname: 'hsm-gw-01', health: 'ok', weight: 2.0 },
    ],
    incidents: [
      { id: 'i1', timestamp: '2026-04-12T09:45:00Z', duration: '45m', description: 'Payment API node 2 - OOM crash, auto-restarted', severity: 'disaster' },
      { id: 'i2', timestamp: '2026-04-08T16:20:00Z', duration: '8m', description: 'Fraud detection service timeout', severity: 'high' },
      { id: 'i3', timestamp: '2026-04-02T11:00:00Z', duration: '2m', description: 'HSM gateway cert renewal delay', severity: 'warning' },
    ],
  },
  '3': {
    id: '3',
    name: 'Customer Portal',
    slaTarget: 99.5,
    availability: 98.2,
    description: 'Self-service customer portal for account management and support tickets.',
    components: [
      { id: 'c1', label: 'Portal Frontend', zabbixHostId: '10401', hostname: 'portal-web-01', health: 'ok', weight: 1.0 },
      { id: 'c2', label: 'Portal API', zabbixHostId: '10402', hostname: 'portal-api-01', health: 'critical', weight: 2.0 },
      { id: 'c3', label: 'Auth Service', zabbixHostId: '10403', hostname: 'auth-01', health: 'ok', weight: 2.0 },
      { id: 'c4', label: 'Ticket DB', zabbixHostId: '10404', hostname: 'ticket-db-01', health: 'critical', weight: 2.5 },
    ],
    incidents: [
      { id: 'i1', timestamp: '2026-04-14T08:00:00Z', duration: '2h 15m', description: 'Ticket DB disk full - writes blocked', severity: 'disaster' },
      { id: 'i2', timestamp: '2026-04-13T21:30:00Z', duration: '30m', description: 'Portal API memory leak - gradual degradation', severity: 'high' },
    ],
  },
}

const HEALTH_CONFIG = {
  ok: { icon: CheckCircle, label: 'Healthy', class: 'text-green-400' },
  warning: { icon: AlertTriangle, label: 'Warning', class: 'text-amber-400' },
  critical: { icon: XCircle, label: 'Critical', class: 'text-red-400' },
}

const SEVERITY_BADGE: Record<string, 'warning' | 'danger' | 'info'> = {
  warning: 'warning',
  high: 'danger',
  disaster: 'danger',
}

export default function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const service = MOCK_SERVICES[serviceId ?? ''] ?? MOCK_SERVICES['1']!

  if (!service) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        Service not found.
      </div>
    )
  }

  const isCompliant = service.availability >= service.slaTarget

  const circumference = 2 * Math.PI * 44
  const offset = circumference - (service.availability / 100) * circumference
  const strokeColor = isCompliant
    ? 'text-green-500'
    : service.availability >= service.slaTarget - 0.5
      ? 'text-amber-500'
      : 'text-red-500'

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/services">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{service.name}</h1>
            <Badge variant={isCompliant ? 'success' : 'danger'}>
              {isCompliant ? 'Compliant' : 'SLA Breach'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-400">{service.description}</p>
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: Components */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Components ({service.components.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {service.components.map((comp) => {
                    const health = HEALTH_CONFIG[comp.health]
                    const HealthIcon = health.icon
                    return (
                      <TableRow key={comp.id}>
                        <TableCell className="font-medium text-gray-100">
                          {comp.label}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-gray-400">
                          {comp.hostname}
                        </TableCell>
                        <TableCell>
                          <div className={cn('flex items-center gap-1.5 text-sm', health.class)}>
                            <HealthIcon className="h-4 w-4" />
                            {health.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-gray-300">
                          {comp.weight.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right: SLA + Incidents */}
        <div className="lg:col-span-2 space-y-4">
          {/* SLA Card */}
          <Card>
            <CardHeader>
              <CardTitle>SLA Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {/* Circular score */}
                <div className="relative h-28 w-28 shrink-0">
                  <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50" cy="50" r="44"
                      fill="none" stroke="currentColor" strokeWidth="6"
                      className="text-gray-700"
                    />
                    <circle
                      cx="50" cy="50" r="44"
                      fill="none" stroke="currentColor" strokeWidth="6"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      strokeLinecap="round"
                      className={cn('transition-all duration-fast', strokeColor)}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-lg font-bold text-white">
                      {service.availability.toFixed(2)}%
                    </span>
                    <span className="text-[10px] text-gray-500">availability</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500">SLA Target</p>
                    <p className="font-mono text-sm font-semibold text-gray-200">
                      {service.slaTarget}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Status</p>
                    <Badge variant={isCompliant ? 'success' : 'danger'} className="mt-0.5">
                      {isCompliant ? 'Compliant' : 'Breach'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Margin</p>
                    <p className={cn(
                      'font-mono text-sm font-semibold',
                      isCompliant ? 'text-green-400' : 'text-red-400'
                    )}>
                      {isCompliant ? '+' : ''}{(service.availability - service.slaTarget).toFixed(3)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Incidents */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Incidents ({service.incidents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {service.incidents.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-500">No recent incidents</p>
              ) : (
                <div className="space-y-3">
                  {service.incidents.map((incident) => (
                    <div
                      key={incident.id}
                      className="rounded-md border border-gray-700 bg-brand-surface p-3"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant={SEVERITY_BADGE[incident.severity] ?? 'warning'}>
                          {incident.severity.toUpperCase()}
                        </Badge>
                        <span className="font-mono text-xs text-gray-500">
                          {incident.duration}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-300">{incident.description}</p>
                      <p className="mt-1 font-mono text-xs text-gray-500">
                        {formatDate(incident.timestamp)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
