import { cn } from '@/lib/utils'
import type { AlertSeverity } from '@zabbixpilot/shared-types'

const SEVERITY_CONFIG: Record<
  AlertSeverity,
  { color: string; label: string }
> = {
  0: { color: 'bg-gray-400', label: 'Not classified' },
  1: { color: 'bg-blue-500', label: 'Information' },
  2: { color: 'bg-amber-500', label: 'Warning' },
  3: { color: 'bg-orange-500', label: 'Average' },
  4: { color: 'bg-red-500', label: 'High' },
  5: { color: 'bg-red-600', label: 'Disaster' },
}

interface SeverityIconProps {
  severity: AlertSeverity
  showLabel?: boolean
  className?: string
}

/**
 * Zabbix severity indicator (0-5).
 * Renders a small colored circle with optional label text.
 * Severity 5 (Disaster) pulses per design rules.
 */
export function SeverityIcon({ severity, showLabel = false, className }: SeverityIconProps) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG[0]

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn(
          'h-2.5 w-2.5 rounded-full shrink-0',
          config.color,
          severity === 5 && 'animate-pulse',
        )}
      />
      {showLabel && (
        <span className="text-xs font-medium text-gray-700">
          {config.label}
        </span>
      )}
    </span>
  )
}
