import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Blocks, Plus, Search } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useZabbixInstances } from '@/hooks/useZabbixInstances'
import { cn, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ITemplate } from '@zabbixpilot/shared-types'

const OS_LABELS: Record<string, string> = {
  LINUX_RHEL: 'RHEL',
  LINUX_UBUNTU: 'Ubuntu',
  LINUX_DEBIAN: 'Debian',
  LINUX_SUSE: 'SUSE',
  WINDOWS: 'Windows',
  AIX: 'AIX',
  OTHER: 'Other',
}

/**
 * Lists all managed templates for the current tenant.
 * Supports filtering by Zabbix instance and search by name.
 */
export default function TemplateListPage() {
  const navigate = useNavigate()
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const { data: instances } = useZabbixInstances()
  const [selectedInstance, setSelectedInstance] = useState<string>('all')
  const [search, setSearch] = useState('')

  const { data: templates, isLoading, error } = useQuery({
    queryKey: ['templates', tenantId, selectedInstance],
    queryFn: async () => {
      const params = selectedInstance !== 'all' ? `?instanceId=${selectedInstance}` : ''
      const res = await api.get<{ data: ITemplate[] }>(
        `/tenants/${tenantId}/templates${params}`,
      )
      return res.data.data
    },
    enabled: !!tenantId,
  })

  const filtered = (templates ?? []).filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.targetApp.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
            <p className="mt-1 text-sm text-gray-400">
              Manage Zabbix monitoring templates
            </p>
          </div>
          <Button onClick={() => navigate('/template-builder/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
            />
          </div>
          {instances && instances.length > 1 && (
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-56 bg-gray-900 border-gray-800 text-white">
                <SelectValue placeholder="All instances" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All instances</SelectItem>
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Spinner size="lg" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-center">
            <p className="text-sm text-red-400">Failed to load templates.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon={Blocks}
            title="No templates yet"
            description="Create your first monitoring template to get started."
            action={
              <Button onClick={() => navigate('/template-builder/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Template
              </Button>
            }
          />
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer bg-gray-900 border-gray-800 hover:border-primary/50 transition-all duration-fast"
                onClick={() => navigate(`/template-builder/${template.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-gray-100 truncate">
                        {template.name}
                      </h3>
                      <p className="mt-0.5 text-xs font-mono text-gray-500">
                        {template.internalName}
                      </p>
                    </div>
                    <Badge variant={template.deployedAt ? 'success' : 'outline'}>
                      {template.deployedAt ? 'Deployed' : 'Draft'}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge variant="info">{template.targetApp}</Badge>
                    <Badge variant="outline">
                      {OS_LABELS[template.targetOs] ?? template.targetOs}
                    </Badge>
                    <span className="text-xs text-gray-500">v{template.version}</span>
                  </div>

                  {template.description && (
                    <p className="mt-3 text-xs text-gray-400 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>{template.items.length} items / {template.triggers.length} triggers</span>
                    <span>{formatDate(template.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
