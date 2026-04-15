import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHosts } from '@/hooks/useHosts'
import { useZabbixInstances } from '@/hooks/useZabbixInstances'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import type { HostStatus, IHost } from '@zabbixpilot/shared-types'
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'DECOMMISSIONED', label: 'Decommissioned' },
]

const OS_LABELS: Record<string, string> = {
  LINUX_RHEL: 'RHEL',
  LINUX_UBUNTU: 'Ubuntu',
  LINUX_DEBIAN: 'Debian',
  LINUX_SUSE: 'SUSE',
  WINDOWS: 'Windows',
  AIX: 'AIX',
  OTHER: 'Other',
}

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
 * Paginated host list with status and instance filters.
 * Dark-mode first. Rows are clickable and navigate to host detail.
 */
export default function HostListPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState('')
  const [instanceFilter, setInstanceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const filters: { status?: string; instanceId?: string; page?: number } = { page }
  if (statusFilter) filters.status = statusFilter
  if (instanceFilter) filters.instanceId = instanceFilter

  const { data: hostsData, isLoading, isError, refetch } = useHosts(filters)

  const { data: instances } = useZabbixInstances()

  const hosts: IHost[] = hostsData?.data ?? []
  const total: number = hostsData?.total ?? hosts.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Client-side search filter (API may also support it)
  const filteredHosts = search
    ? hosts.filter(
        (h) =>
          h.hostname.toLowerCase().includes(search.toLowerCase()) ||
          h.ipAddress.includes(search)
      )
    : hosts

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Hosts</h1>
        <Button
          onClick={() => navigate('/provisioning/new')}
          className="bg-primary hover:bg-primary-hover text-white gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Host
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Status */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-primary focus:outline-none"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Instance */}
        <select
          value={instanceFilter}
          onChange={(e) => {
            setInstanceFilter(e.target.value)
            setPage(1)
          }}
          className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-primary focus:outline-none"
        >
          <option value="">All Instances</option>
          {Array.isArray(instances) &&
            instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.label}
              </option>
            ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            type="text"
            placeholder="Search hostname or IP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Spinner />
        </div>
      ) : isError ? (
        <div className="text-center py-16">
          <p className="text-red-400 mb-4">Failed to load hosts.</p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            className="border-gray-700 text-gray-300"
          >
            Retry
          </Button>
        </div>
      ) : filteredHosts.length === 0 ? (
        <EmptyState
          title="No hosts found"
          description={
            search || statusFilter || instanceFilter
              ? 'Try adjusting your filters.'
              : 'Add your first host to get started with provisioning.'
          }
        />
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800/60 text-gray-400 text-left">
                  <th className="py-3 px-4 font-medium">Hostname</th>
                  <th className="py-3 px-4 font-medium">IP Address</th>
                  <th className="py-3 px-4 font-medium">OS</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Instance</th>
                  <th className="py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHosts.map((host, idx) => {
                  const instanceLabel = Array.isArray(instances)
                    ? instances.find((i) => i.id === host.zabbixInstanceId)?.label ?? '-'
                    : '-'

                  return (
                    <tr
                      key={host.id}
                      onClick={() => navigate(`/provisioning/${host.id}`)}
                      className={cn(
                        'border-b border-gray-800/50 cursor-pointer transition-colors duration-fast',
                        'hover:bg-gray-800/40',
                        idx % 2 === 1 ? 'bg-gray-900/40' : ''
                      )}
                    >
                      <td className="py-3 px-4 text-white font-medium">
                        {host.hostname}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-300 text-xs">
                        {host.ipAddress}
                      </td>
                      <td className="py-3 px-4 text-gray-300 text-xs">
                        {host.os ? OS_LABELS[host.os] ?? host.os : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={hostStatusToBadge(host.status)} />
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-xs">
                        {instanceLabel}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-gray-400 hover:text-white text-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/provisioning/${host.id}`)
                            }}
                          >
                            View
                          </Button>
                          {host.status === 'ONBOARDING' && (
                            <Button
                              size="sm"
                              className="bg-primary/20 text-primary hover:bg-primary/30 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/provisioning/${host.id}`)
                              }}
                            >
                              Provision
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span>
                Showing {(page - 1) * pageSize + 1} -{' '}
                {Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="border-gray-700 text-gray-300 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-gray-300">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="border-gray-700 text-gray-300 disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
