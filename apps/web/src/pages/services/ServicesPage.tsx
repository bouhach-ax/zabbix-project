import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Plus, Activity, Layers, Filter, ArrowRight } from 'lucide-react'

type HealthFilter = 'all' | 'healthy' | 'degraded' | 'critical'

const MOCK_SERVICES = [
  { id: '1', name: 'E-Commerce Platform', slaTarget: 99.9, availability: 99.95, componentCount: 8, status: 'healthy' as const },
  { id: '2', name: 'Payment Gateway', slaTarget: 99.99, availability: 99.8, componentCount: 5, status: 'degraded' as const },
  { id: '3', name: 'Customer Portal', slaTarget: 99.5, availability: 98.2, componentCount: 12, status: 'critical' as const },
  { id: '4', name: 'Internal API', slaTarget: 99.0, availability: 99.99, componentCount: 3, status: 'healthy' as const },
  { id: '5', name: 'Email Service', slaTarget: 99.5, availability: 99.7, componentCount: 4, status: 'healthy' as const },
  { id: '6', name: 'CDN & Media', slaTarget: 99.9, availability: 99.91, componentCount: 6, status: 'healthy' as const },
]

const FILTER_OPTIONS: { label: string; value: HealthFilter }[] = [
  { label: 'All Services', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Critical', value: 'critical' },
]

function getHealthColors(availability: number, slaTarget: number) {
  if (availability >= slaTarget) return { stroke: 'text-green-500', badge: 'success' as const }
  if (availability >= slaTarget - 0.5) return { stroke: 'text-amber-500', badge: 'warning' as const }
  return { stroke: 'text-red-500', badge: 'danger' as const }
}

function CircularScore({ availability, slaTarget }: { availability: number; slaTarget: number }) {
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (availability / 100) * circumference
  const colors = getHealthColors(availability, slaTarget)

  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-gray-700"
        />
        <circle
          cx="40"
          cy="40"
          r="36"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('transition-all duration-fast', colors.stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-sm font-bold text-white">
          {availability.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function ServiceCard({ service }: { service: typeof MOCK_SERVICES[number] }) {
  const colors = getHealthColors(service.availability, service.slaTarget)
  const isCompliant = service.availability >= service.slaTarget

  return (
    <Link
      to={`/services/${service.id}`}
      className="group block rounded-lg border border-gray-700 bg-brand-card p-5 transition-all duration-fast hover:border-primary/50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-center gap-5">
        <CircularScore availability={service.availability} slaTarget={service.slaTarget} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-white">
              {service.name}
            </h3>
            <ArrowRight className="h-4 w-4 text-gray-500 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={isCompliant ? 'success' : 'danger'}>
              {isCompliant ? 'Compliant' : 'SLA Breach'}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Activity className="h-3.5 w-3.5" />
              Target: {service.slaTarget}%
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
            <Layers className="h-3.5 w-3.5" />
            {service.componentCount} component{service.componentCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function ServicesPage() {
  const [filter, setFilter] = useState<HealthFilter>('all')

  const filtered = MOCK_SERVICES.filter((s) => {
    if (filter === 'all') return true
    return s.status === filter
  })

  const counts = {
    all: MOCK_SERVICES.length,
    healthy: MOCK_SERVICES.filter((s) => s.status === 'healthy').length,
    degraded: MOCK_SERVICES.filter((s) => s.status === 'degraded').length,
    critical: MOCK_SERVICES.filter((s) => s.status === 'critical').length,
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Services</h1>
          <p className="mt-1 text-sm text-gray-400">
            Business services health and SLA compliance
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={filter === opt.value ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
            <span className="ml-1.5 rounded-full bg-brand-dark/50 px-1.5 py-0.5 text-xs">
              {counts[opt.value]}
            </span>
          </Button>
        ))}
      </div>

      {/* Services grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity className="mb-3 h-10 w-10 text-gray-500" />
          <p className="text-gray-400">No services match the selected filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      )}
    </div>
  )
}
