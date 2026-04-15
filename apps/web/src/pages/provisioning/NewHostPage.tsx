import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateHost } from '@/hooks/useHosts'
import { useZabbixInstances } from '@/hooks/useZabbixInstances'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft } from 'lucide-react'
import type { OsType } from '@zabbixpilot/shared-types'

const OS_OPTIONS: Array<{ value: OsType | ''; label: string }> = [
  { value: '', label: 'Auto-detect (recommended)' },
  { value: 'LINUX_RHEL', label: 'Linux RHEL / CentOS' },
  { value: 'LINUX_UBUNTU', label: 'Linux Ubuntu' },
  { value: 'LINUX_DEBIAN', label: 'Linux Debian' },
  { value: 'LINUX_SUSE', label: 'Linux SUSE' },
  { value: 'WINDOWS', label: 'Windows' },
  { value: 'AIX', label: 'AIX' },
]

/** IPv4 validation */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => {
    const n = Number(p)
    return /^\d{1,3}$/.test(p) && n >= 0 && n <= 255
  })
}

/**
 * Form page to create a new managed host.
 * Navigates to host detail on success.
 */
export default function NewHostPage() {
  const navigate = useNavigate()
  const createHost = useCreateHost()
  const { data: instances, isLoading: instancesLoading } = useZabbixInstances()

  const [hostname, setHostname] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [zabbixInstanceId, setZabbixInstanceId] = useState('')
  const [os, setOs] = useState<OsType | ''>('')
  const [agentPort, setAgentPort] = useState('10050')
  const [declaredRole, setDeclaredRole] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Validation
    if (!hostname.trim()) {
      setError('Hostname is required.')
      return
    }
    if (!ipAddress.trim() || !isValidIPv4(ipAddress.trim())) {
      setError('A valid IPv4 address is required.')
      return
    }
    if (!zabbixInstanceId) {
      setError('Please select a Zabbix instance.')
      return
    }
    const port = Number(agentPort)
    if (isNaN(port) || port < 1 || port > 65535) {
      setError('Agent port must be between 1 and 65535.')
      return
    }

    try {
      const result = await createHost.mutateAsync({
        hostname: hostname.trim(),
        ipAddress: ipAddress.trim(),
        zabbixInstanceId,
        agentPort: port,
        declaredRole: declaredRole.trim() || undefined,
        location: location.trim() || undefined,
      })
      // result is { data: IHost }
      const hostId = result.data.id
      navigate(`/provisioning/${hostId}`)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create host. Please try again.'
      setError(message)
    }
  }

  if (instancesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/provisioning')}
          className="text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold text-white">Add New Host</h1>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Host Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Hostname */}
            <FieldGroup label="Hostname" required>
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="srv-web-prod-01"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary font-mono"
              />
            </FieldGroup>

            {/* IP Address */}
            <FieldGroup label="IP Address" required>
              <Input
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="192.168.1.100"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary font-mono"
              />
            </FieldGroup>

            {/* Zabbix Instance */}
            <FieldGroup label="Zabbix Instance" required>
              <select
                value={zabbixInstanceId}
                onChange={(e) => setZabbixInstanceId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-primary focus:outline-none"
              >
                <option value="">Select an instance...</option>
                {Array.isArray(instances) &&
                  instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.label}
                    </option>
                  ))}
              </select>
            </FieldGroup>

            {/* OS */}
            <FieldGroup label="Operating System">
              <select
                value={os}
                onChange={(e) => setOs(e.target.value as OsType | '')}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:border-primary focus:outline-none"
              >
                {OS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Agent Port */}
            <FieldGroup label="Agent Port">
              <Input
                type="number"
                value={agentPort}
                onChange={(e) => setAgentPort(e.target.value)}
                min={1}
                max={65535}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary font-mono w-32"
              />
            </FieldGroup>

            {/* Role/Purpose */}
            <FieldGroup label="Role / Purpose">
              <Input
                value={declaredRole}
                onChange={(e) => setDeclaredRole(e.target.value)}
                placeholder="Web server, Database, Application..."
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary"
              />
            </FieldGroup>

            {/* Location */}
            <FieldGroup label="Location">
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="DC-Paris-01, Rack A12..."
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary"
              />
            </FieldGroup>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/provisioning')}
                className="border-gray-700 text-gray-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createHost.isPending}
                className="bg-primary hover:bg-primary-hover text-white disabled:opacity-60"
              >
                {createHost.isPending ? 'Creating...' : 'Create Host'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* FieldGroup -- consistent form field wrapper                        */
/* ------------------------------------------------------------------ */

function FieldGroup({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-primary ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
