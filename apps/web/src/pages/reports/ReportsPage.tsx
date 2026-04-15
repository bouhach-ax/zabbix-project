import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { cn, formatDate, formatAvailability } from '@/lib/utils'
import { Plus, FileText, Download, Eye, ChevronUp, ChevronDown, BarChart3 } from 'lucide-react'

const MOCK_REPORTS = [
  { id: '1', serviceName: 'E-Commerce Platform', periodFrom: '2026-03-01', periodTo: '2026-03-31', availability: 99.95, slaTarget: 99.9, isCompliant: true, generatedAt: '2026-04-01T10:00:00Z' },
  { id: '2', serviceName: 'Payment Gateway', periodFrom: '2026-03-01', periodTo: '2026-03-31', availability: 99.8, slaTarget: 99.99, isCompliant: false, generatedAt: '2026-04-01T10:05:00Z' },
  { id: '3', serviceName: 'Customer Portal', periodFrom: '2026-03-01', periodTo: '2026-03-31', availability: 99.62, slaTarget: 99.5, isCompliant: true, generatedAt: '2026-04-01T10:10:00Z' },
  { id: '4', serviceName: 'Internal API', periodFrom: '2026-03-01', periodTo: '2026-03-31', availability: 99.99, slaTarget: 99.0, isCompliant: true, generatedAt: '2026-04-01T10:15:00Z' },
  { id: '5', serviceName: 'E-Commerce Platform', periodFrom: '2026-02-01', periodTo: '2026-02-28', availability: 99.87, slaTarget: 99.9, isCompliant: false, generatedAt: '2026-03-01T10:00:00Z' },
  { id: '6', serviceName: 'Payment Gateway', periodFrom: '2026-02-01', periodTo: '2026-02-28', availability: 99.995, slaTarget: 99.99, isCompliant: true, generatedAt: '2026-03-01T10:05:00Z' },
  { id: '7', serviceName: 'Email Service', periodFrom: '2026-03-01', periodTo: '2026-03-31', availability: 99.7, slaTarget: 99.5, isCompliant: true, generatedAt: '2026-04-01T10:20:00Z' },
]

const MOCK_SERVICE_OPTIONS = [
  'E-Commerce Platform',
  'Payment Gateway',
  'Customer Portal',
  'Internal API',
  'Email Service',
  'CDN & Media',
]

export default function ReportsPage() {
  const [showForm, setShowForm] = useState(false)
  const [formService, setFormService] = useState('')
  const [formFrom, setFormFrom] = useState('')
  const [formTo, setFormTo] = useState('')

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SLA Reports</h1>
          <p className="mt-1 text-sm text-gray-400">
            Generate and review service level agreement reports
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Hide Form
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Generate Report
            </>
          )}
        </Button>
      </div>

      {/* Generate report form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Generate New Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Service
                </label>
                <select
                  value={formService}
                  onChange={(e) => setFormService(e.target.value)}
                  className="h-10 w-full rounded-md border border-gray-600 bg-brand-surface px-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a service...</option>
                  {MOCK_SERVICE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="w-44">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Period From
                </label>
                <Input
                  type="date"
                  value={formFrom}
                  onChange={(e) => setFormFrom(e.target.value)}
                />
              </div>
              <div className="w-44">
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Period To
                </label>
                <Input
                  type="date"
                  value={formTo}
                  onChange={(e) => setFormTo(e.target.value)}
                />
              </div>
              <Button disabled={!formService || !formFrom || !formTo}>
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reports table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Availability</TableHead>
              <TableHead className="text-right">SLA Target</TableHead>
              <TableHead>Compliant</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_REPORTS.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="font-medium text-gray-100">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    {report.serviceName}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">
                  {report.periodFrom} - {report.periodTo}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn(
                    'font-mono text-sm font-semibold',
                    report.isCompliant ? 'text-green-400' : 'text-red-400'
                  )}>
                    {formatAvailability(report.availability)}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-gray-300">
                  {report.slaTarget}%
                </TableCell>
                <TableCell>
                  <Badge variant={report.isCompliant ? 'success' : 'danger'}>
                    {report.isCompliant ? 'Compliant' : 'Breach'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">
                  {formatDate(report.generatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link to={`/reports/${report.id}`}>
                      <Button variant="ghost" size="sm">
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </Button>
                    </Link>
                    <Button variant="ghost" size="sm">
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      PDF
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
