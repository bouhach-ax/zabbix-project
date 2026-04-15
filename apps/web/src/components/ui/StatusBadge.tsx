import { cn } from '@/lib/utils'

type Status = 'OK' | 'PROBLEM' | 'UNKNOWN' | 'WARNING' | 'DISASTER'

const STATUS_CONFIG: Record<
  Status,
  { bg: string; text: string; dot: string; pulse?: boolean }
> = {
  OK: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500' },
  PROBLEM: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  UNKNOWN: { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  WARNING: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  DISASTER: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-300', dot: 'bg-red-600', pulse: true },
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

/**
 * Zabbix status badge with semantic colors.
 * DISASTER status has a pulsing dot -- only animation exception per design rules.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        'transition-colors duration-fast ease-out-standard',
        config.bg,
        config.text,
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          config.dot,
          config.pulse && 'animate-pulse',
        )}
      />
      {status}
    </span>
  )
}
