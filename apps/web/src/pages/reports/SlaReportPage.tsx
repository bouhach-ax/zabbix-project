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
import { ArrowLeft, Download, CheckCircle, XCircle, Clock } from 'lucide-react'

const MOCK_REPORT_DETAILS: Record<string, {
  id: string
  serviceName: string
  periodFrom: string
  periodTo: string
  availability: number
  slaTarget: number
  isCompliant: boolean
  generatedAt: string
  summary: string
  dailyAvailability: number[]
  incidents: {
    id: string
    timestamp: string
    duration: string
    description: string
    severity: 'warning' | 'high' | 'disaster'
    impactMinutes: number
  }[]
}> = {
  '1': {
    id: '1',
    serviceName: 'E-Commerce Platform',
    periodFrom: '2026-03-01',
    periodTo: '2026-03-31',
    availability: 99.95,
    slaTarget: 99.9,
    isCompliant: true,
    generatedAt: '2026-04-01T10:00:00Z',
    summary: 'The E-Commerce Platform maintained excellent availability during March 2026, exceeding the SLA target of 99.9%. Two minor incidents were recorded: a brief search engine latency spike on March 10th and a Redis cache pool exhaustion on March 5th. Both were resolved within 15 minutes. Total downtime was 22 minutes, well within the 44-minute monthly budget. No customer-facing impact was reported for either incident.',
    dailyAvailability: [
      100, 100, 100, 100, 99.8, 100, 100, 100, 100, 99.7,
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    ],
    incidents: [
      { id: 'i1', timestamp: '2026-03-10T14:32:00Z', duration: '12m', description: 'Search engine high latency - query time > 2s', severity: 'warning', impactMinutes: 12 },
      { id: 'i2', timestamp: '2026-03-05T03:15:00Z', duration: '10m', description: 'Redis cache connection pool exhaustion', severity: 'high', impactMinutes: 10 },
    ],
  },
  '2': {
    id: '2',
    serviceName: 'Payment Gateway',
    periodFrom: '2026-03-01',
    periodTo: '2026-03-31',
    availability: 99.8,
    slaTarget: 99.99,
    isCompliant: false,
    generatedAt: '2026-04-01T10:05:00Z',
    summary: 'The Payment Gateway did not meet its SLA target of 99.99% in March 2026. Actual availability was 99.8%, resulting in an SLA breach. The primary cause was a 45-minute outage on March 12th due to an OOM crash on Payment API node 2. A secondary incident on March 8th (fraud detection timeout, 8 minutes) also contributed. Corrective actions include increasing memory limits and implementing circuit breakers.',
    dailyAvailability: [
      100, 100, 100, 100, 100, 100, 100, 99.4, 100, 100,
      100, 98.7, 100, 100, 100, 100, 100, 100, 100, 100,
      100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    ],
    incidents: [
      { id: 'i1', timestamp: '2026-03-12T09:45:00Z', duration: '45m', description: 'Payment API node 2 - OOM crash, auto-restarted', severity: 'disaster', impactMinutes: 45 },
      { id: 'i2', timestamp: '2026-03-08T16:20:00Z', duration: '8m', description: 'Fraud detection service timeout', severity: 'high', impactMinutes: 8 },
      { id: 'i3', timestamp: '2026-03-22T02:00:00Z', duration: '2m', description: 'HSM gateway cert renewal delay', severity: 'warning', impactMinutes: 2 },
    ],
  },
}

const SEVERITY_BADGE: Record<string, 'warning' | 'danger'> = {
  warning: 'warning',
  high: 'danger',
  disaster: 'danger',
}

export default function SlaReportPage() {
  const { reportId } = useParams<{ reportId: string }>()
  const report = MOCK_REPORT_DETAILS[reportId ?? ''] ?? MOCK_REPORT_DETAILS['1']!

  if (!report) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        Report not found.
      </div>
    )
  }

  const totalDowntimeMinutes = report.incidents.reduce((sum, i) => sum + i.impactMinutes, 0)
  const totalMinutesInPeriod = 31 * 24 * 60
  const budgetMinutes = Math.round(totalMinutesInPeriod * (1 - report.slaTarget / 100))

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/reports">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{report.serviceName}</h1>
            <Badge variant={report.isCompliant ? 'success' : 'danger'}>
              {report.isCompliant ? 'Compliant' : 'SLA Breach'}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-gray-400">
            {report.periodFrom} to {report.periodTo}
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Availability</p>
            <p className={cn(
              'mt-1 font-mono text-3xl font-bold',
              report.isCompliant ? 'text-green-400' : 'text-red-400'
            )}>
              {report.availability.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">SLA Target</p>
            <p className="mt-1 font-mono text-3xl font-bold text-gray-100">
              {report.slaTarget}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Total Downtime</p>
            <p className="mt-1 font-mono text-3xl font-bold text-gray-100">
              {totalDowntimeMinutes}m
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              of {budgetMinutes}m budget
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Status</p>
            <div className="mt-2 flex items-center gap-2">
              {report.isCompliant ? (
                <CheckCircle className="h-6 w-6 text-green-400" />
              ) : (
                <XCircle className="h-6 w-6 text-red-400" />
              )}
              <span className={cn(
                'text-lg font-semibold',
                report.isCompliant ? 'text-green-400' : 'text-red-400'
              )}>
                {report.isCompliant ? 'Compliant' : 'Breach'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily availability bar chart (CSS-based) */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
            {report.dailyAvailability.map((val, idx) => {
              const height = Math.max(2, ((val - 95) / 5) * 100)
              const isBelow = val < report.slaTarget
              return (
                <div
                  key={idx}
                  className="group relative flex-1"
                  style={{ height: '100%' }}
                >
                  <div
                    className={cn(
                      'absolute bottom-0 w-full rounded-t-sm transition-colors',
                      isBelow ? 'bg-red-500' : val === 100 ? 'bg-green-500/80' : 'bg-amber-500'
                    )}
                    style={{ height: `${height}%` }}
                  />
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-brand-dark px-2 py-1 text-xs text-gray-200 opacity-0 shadow-lg group-hover:opacity-100">
                    Day {idx + 1}: {val.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
          {/* SLA target line label */}
          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
            <span>Day 1</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-px w-4 bg-gray-500" />
              SLA Target: {report.slaTarget}%
            </span>
            <span>Day {report.dailyAvailability.length}</span>
          </div>
        </CardContent>
      </Card>

      {/* Incidents table */}
      <Card>
        <CardHeader>
          <CardTitle>Incidents ({report.incidents.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.incidents.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell className="font-mono text-xs text-gray-400">
                    {formatDate(incident.timestamp)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_BADGE[incident.severity] ?? 'warning'}>
                      {incident.severity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-200">{incident.description}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 text-sm text-gray-300">
                      <Clock className="h-3.5 w-3.5 text-gray-500" />
                      {incident.duration}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-gray-300">
                    {incident.impactMinutes}m
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-gray-300">{report.summary}</p>
          <p className="mt-3 text-xs text-gray-500">
            Generated on {formatDate(report.generatedAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
