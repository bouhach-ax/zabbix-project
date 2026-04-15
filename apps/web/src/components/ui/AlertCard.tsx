import { CheckCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SeverityIcon } from './SeverityIcon'
import type { AlertSeverity } from '@zabbixpilot/shared-types'

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  0: 'border-l-gray-400',
  1: 'border-l-blue-500',
  2: 'border-l-amber-500',
  3: 'border-l-orange-500',
  4: 'border-l-red-500',
  5: 'border-l-red-600',
}

interface AlertCardProps {
  alert: {
    id: string
    severity: AlertSeverity
    triggerName: string
    hostname: string
    firstOccurrence: Date | string
    status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED'
  }
  compact?: boolean
  selected?: boolean
  onClick?: (id: string) => void
  className?: string
}

/**
 * Formats a relative time string (e.g. "5m ago", "2h ago").
 */
function timeAgo(date: Date | string): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

/**
 * Card showing an alert/incident with severity color border.
 * Compact mode is designed for the NOC work queue list.
 */
export function AlertCard({ alert, compact = false, selected = false, onClick, className }: AlertCardProps) {
  const isAcknowledged = alert.status === 'ACKNOWLEDGED'

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(alert.id)}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(alert.id)
        }
      }}
      className={cn(
        'border-l-4 rounded-r-lg border bg-white dark:bg-brand-card dark:border-gray-700',
        'transition-all duration-fast ease-out-standard',
        SEVERITY_BORDER[alert.severity],
        onClick && 'cursor-pointer hover:shadow-md',
        selected && 'ring-2 ring-primary/50',
        isAcknowledged && 'opacity-60',
        compact ? 'px-3 py-2' : 'p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SeverityIcon severity={alert.severity} />
            <span
              className={cn(
                'truncate font-medium text-gray-900 dark:text-gray-100',
                compact ? 'text-xs' : 'text-sm',
              )}
            >
              {alert.triggerName}
            </span>
          </div>
          <div className={cn('flex items-center gap-2 mt-1', compact ? 'text-[11px]' : 'text-xs')}>
            <span className="text-gray-500 dark:text-gray-400">{alert.hostname}</span>
            <span className="flex items-center gap-0.5 text-gray-400 dark:text-gray-500">
              <Clock className="h-3 w-3" />
              {timeAgo(alert.firstOccurrence)}
            </span>
          </div>
        </div>
        {isAcknowledged && (
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
        )}
      </div>
    </div>
  )
}
