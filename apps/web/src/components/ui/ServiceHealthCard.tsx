import { Activity, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ServiceHealthCardProps {
  service: {
    id: string
    name: string
    slaTarget: number
    availability: number
    componentCount: number
  }
  onClick?: (id: string) => void
  className?: string
}

/**
 * Returns Tailwind classes for health color based on availability vs SLA target.
 */
function healthColor(availability: number, slaTarget: number) {
  if (availability >= slaTarget) {
    return { ring: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950', badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' }
  }
  if (availability >= slaTarget - 1) {
    return { ring: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' }
  }
  return { ring: 'text-red-500', bg: 'bg-red-50 dark:bg-red-950', badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' }
}

/**
 * Card showing a business service health score with SLA compliance.
 * Includes a circular progress indicator for health visualization.
 */
export function ServiceHealthCard({ service, onClick, className }: ServiceHealthCardProps) {
  const colors = healthColor(service.availability, service.slaTarget)
  const isCompliant = service.availability >= service.slaTarget
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (service.availability / 100) * circumference

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(service.id)}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(service.id)
        }
      }}
      className={cn(
        'rounded-lg border p-4',
        'bg-brand-card border-gray-700',
        'shadow-sm transition-all duration-fast ease-out-standard',
        onClick && 'cursor-pointer hover:shadow-md hover:border-primary/50 dark:hover:border-primary/50',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {/* Circular health indicator */}
        <div className="relative h-20 w-20 shrink-0">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-gray-200 dark:text-gray-700"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className={cn('transition-all duration-fast ease-out-standard', colors.ring)}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-900">
              {service.availability.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {service.name}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                colors.badge,
              )}
            >
              {isCompliant ? 'SLA Compliant' : 'SLA Breach'}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Activity className="h-3.5 w-3.5" />
              Target: {service.slaTarget}%
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
            <Layers className="h-3.5 w-3.5" />
            {service.componentCount} component{service.componentCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
