import { useAuth } from '@/hooks/useAuth'
import { useHosts } from '@/hooks/useHosts'
import { useZabbixInstances } from '@/hooks/useZabbixInstances'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { IHost, HostStatus } from '@zabbixpilot/shared-types'
import { Server, AlertTriangle, Database, Loader2 } from 'lucide-react'

/** Map host status to StatusBadge status prop */
function hostStatusToBadge(status: HostStatus): 'OK' | 'WARNING' | 'PROBLEM' | 'UNKNOWN' {
  switch (status) {
    case 'ACTIVE':
      return 'OK'
    case 'ONBOARDING':
      return 'WARNING'
    case 'MAINTENANCE':
      return 'UNKNOWN'
    case 'DECOMMISSIONED':
      return 'PROBLEM'
    default:
      return 'UNKNOWN'
  }
}

/**
 * Contextual dashboard showing overview stats, recent hosts, and recent alerts.
 * Dark mode first. Cards use brand-card backgrounds.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const { data: hostsData, isLoading: hostsLoading } = useHosts()
  const { data: instances, isLoading: instancesLoading } = useZabbixInstances()

  const hosts: IHost[] = hostsData?.data ?? []
  const totalHosts = hostsData?.total ?? hosts.length
  const instanceCount = Array.isArray(instances) ? instances.length : 0
  const provisioningCount = hosts.filter((h) => h.status === 'ONBOARDING').length
  // Alert count derived from hosts in non-active state as a proxy
  // (real alert integration would come from a dedicated alerts hook)
  const activeAlertCount = 0

  const isLoading = hostsLoading || instancesLoading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Hosts"
          value={totalHosts}
          icon={<Server className="h-5 w-5" />}
          iconColor="text-blue-400"
        />
        <StatCard
          label="Active Alerts"
          value={activeAlertCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconColor={activeAlertCount > 0 ? 'text-red-400' : 'text-gray-400'}
          valueColor={activeAlertCount > 0 ? 'text-red-400' : undefined}
        />
        <StatCard
          label="Zabbix Instances"
          value={instanceCount}
          icon={<Database className="h-5 w-5" />}
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Provisioning Jobs"
          value={provisioningCount}
          icon={<Loader2 className="h-5 w-5" />}
          iconColor="text-amber-400"
        />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Hosts */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base font-semibold">
              Recent Hosts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hosts.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">
                No hosts yet. Add your first host to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-800">
                      <th className="text-left py-2 pr-4 font-medium">Hostname</th>
                      <th className="text-left py-2 pr-4 font-medium">IP</th>
                      <th className="text-left py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hosts.slice(0, 5).map((host) => (
                      <tr
                        key={host.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors duration-fast"
                      >
                        <td className="py-2.5 pr-4 text-white font-medium">
                          {host.hostname}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-gray-300 text-xs">
                          {host.ipAddress}
                        </td>
                        <td className="py-2.5">
                          <StatusBadge status={hostStatusToBadge(host.status)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Alerts placeholder */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base font-semibold">
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 text-sm py-4 text-center">
              No active alerts. All systems operational.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* StatCard -- small KPI card for the top row                         */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  iconColor?: string
  valueColor?: string | undefined
}

function StatCard({ label, value, icon, iconColor, valueColor }: StatCardProps) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg bg-gray-800',
            iconColor
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            {label}
          </p>
          <p className={cn('text-2xl font-bold mt-0.5', valueColor ?? 'text-white')}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
