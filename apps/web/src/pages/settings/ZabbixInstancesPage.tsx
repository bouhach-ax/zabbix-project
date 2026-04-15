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
import { Spinner } from '@/components/ui/spinner'
import { cn, formatDate } from '@/lib/utils'
import { ArrowLeft, Plus, RefreshCw, Pencil, Trash2, ChevronUp, Server, Wifi, WifiOff } from 'lucide-react'

interface MockInstance {
  id: string
  label: string
  apiUrl: string
  version: string | null
  isActive: boolean
  healthStatus: string
  lastHealthCheck: string | null
}

const INITIAL_INSTANCES: MockInstance[] = [
  { id: '1', label: 'Production Zabbix', apiUrl: 'https://zabbix.prod.example.com/api_jsonrpc.php', version: '6.4.0', isActive: true, healthStatus: 'healthy', lastHealthCheck: new Date(Date.now() - 300000).toISOString() },
  { id: '2', label: 'Staging Zabbix', apiUrl: 'https://zabbix.staging.example.com/api_jsonrpc.php', version: '7.0.0', isActive: true, healthStatus: 'healthy', lastHealthCheck: new Date(Date.now() - 600000).toISOString() },
  { id: '3', label: 'Legacy Zabbix', apiUrl: 'https://zabbix-old.example.com/api_jsonrpc.php', version: '6.0.0', isActive: false, healthStatus: 'unreachable', lastHealthCheck: new Date(Date.now() - 86400000).toISOString() },
]

const HEALTH_BADGE: Record<string, { variant: 'success' | 'danger' | 'default'; label: string }> = {
  healthy: { variant: 'success', label: 'Healthy' },
  unreachable: { variant: 'danger', label: 'Unreachable' },
  unknown: { variant: 'default', label: 'Never Checked' },
}

export default function ZabbixInstancesPage() {
  const [instances, setInstances] = useState(INITIAL_INSTANCES)
  const [showForm, setShowForm] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [formLabel, setFormLabel] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formToken, setFormToken] = useState('')

  function handleAddInstance() {
    if (!formLabel || !formUrl || !formToken) return
    const newInstance: MockInstance = {
      id: String(Date.now()),
      label: formLabel,
      apiUrl: formUrl,
      version: null,
      isActive: true,
      healthStatus: 'unknown',
      lastHealthCheck: null,
    }
    setInstances((prev) => [newInstance, ...prev])
    setFormLabel('')
    setFormUrl('')
    setFormToken('')
    setShowForm(false)
  }

  function handleTestConnectivity(instanceId: string) {
    setTestingId(instanceId)
    // Simulate async test
    setTimeout(() => {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === instanceId
            ? { ...inst, healthStatus: 'healthy', lastHealthCheck: new Date().toISOString(), version: inst.version ?? '7.0.0' }
            : inst
        )
      )
      setTestingId(null)
    }, 1500)
  }

  function handleDelete(instanceId: string) {
    setInstances((prev) => prev.filter((i) => i.id !== instanceId))
  }

  function truncateUrl(url: string) {
    if (url.length <= 45) return url
    return url.slice(0, 42) + '...'
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Zabbix Instances</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              Manage Zabbix server connections
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add Instance
            </>
          )}
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              New Zabbix Instance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Label
                </label>
                <Input
                  placeholder="e.g. Production Zabbix"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  API URL
                </label>
                <Input
                  placeholder="https://zabbix.example.com/api_jsonrpc.php"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  API Token
                </label>
                <Input
                  type="password"
                  placeholder="Zabbix API token"
                  value={formToken}
                  onChange={(e) => setFormToken(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleAddInstance}
                disabled={!formLabel || !formUrl || !formToken}
              >
                Add Instance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instances table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>API URL</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Last Check</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-gray-400">
                  No Zabbix instances configured yet.
                </TableCell>
              </TableRow>
            )}
            {instances.map((inst) => {
              const healthInfo = HEALTH_BADGE[inst.healthStatus] ?? { variant: 'default' as const, label: 'Unknown' }
              const isTesting = testingId === inst.id

              return (
                <TableRow key={inst.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {inst.healthStatus === 'healthy' ? (
                        <Wifi className="h-4 w-4 text-green-400" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="font-medium text-gray-100">{inst.label}</span>
                      {!inst.isActive && (
                        <Badge variant="default" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className="font-mono text-xs text-gray-400"
                      title={inst.apiUrl}
                    >
                      {truncateUrl(inst.apiUrl)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-gray-300">
                    {inst.version ?? '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={healthInfo.variant}>
                      {healthInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-gray-400">
                    {inst.lastHealthCheck ? formatDate(inst.lastHealthCheck) : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestConnectivity(inst.id)}
                        disabled={isTesting}
                      >
                        {isTesting ? (
                          <Spinner size="sm" className="mr-1.5" />
                        ) : (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Test
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:text-red-300"
                        onClick={() => handleDelete(inst.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
