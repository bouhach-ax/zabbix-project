import { Monitor, Cpu, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBadge } from './StatusBadge'
import type { HostStatus, OsType } from '@zabbixpilot/shared-types'

const OS_LABELS: Record<OsType, string> = {
  LINUX_RHEL: 'RHEL',
  LINUX_UBUNTU: 'Ubuntu',
  LINUX_DEBIAN: 'Debian',
  LINUX_SUSE: 'SUSE',
  WINDOWS: 'Windows',
  AIX: 'AIX',
  OTHER: 'Other',
}

const HOST_STATUS_TO_BADGE: Record<HostStatus, 'OK' | 'PROBLEM' | 'WARNING' | 'UNKNOWN'> = {
  ACTIVE: 'OK',
  ONBOARDING: 'WARNING',
  MAINTENANCE: 'UNKNOWN',
  DECOMMISSIONED: 'PROBLEM',
}

interface HostCardProps {
  host: {
    id: string
    hostname: string
    ipAddress: string
    os?: OsType | null
    status: HostStatus
    agentVersion?: string | null
  }
  onClick?: (id: string) => void
  className?: string
}

/**
 * Card showing a host summary.
 * Displays hostname, IP, OS, status badge, and agent version.
 */
export function HostCard({ host, onClick, className }: HostCardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(host.id)}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick(host.id)
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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 shrink-0 text-gray-500" />
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {host.hostname}
            </h3>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <Network className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="font-mono text-xs text-gray-500">
              {host.ipAddress}
            </span>
          </div>
        </div>
        <StatusBadge status={HOST_STATUS_TO_BADGE[host.status] ?? 'UNKNOWN'} />
      </div>

      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
        {host.os && (
          <span className="flex items-center gap-1">
            <Cpu className="h-3.5 w-3.5" />
            {OS_LABELS[host.os]}
          </span>
        )}
        {host.agentVersion && (
          <span className="font-mono">{host.agentVersion}</span>
        )}
      </div>
    </div>
  )
}
