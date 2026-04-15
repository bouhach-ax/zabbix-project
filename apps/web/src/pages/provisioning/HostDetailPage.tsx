import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useHost, useStartProvisioning } from '@/hooks/useHosts'
import { useZabbixInstances } from '@/hooks/useZabbixInstances'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ProgressStepper } from '@/components/ui/ProgressStepper'
import { Spinner } from '@/components/ui/spinner'
import { cn, formatDate } from '@/lib/utils'
import type { IHost, IProvisioningJob, HostStatus, JobStatus } from '@zabbixpilot/shared-types'
import {
  ArrowLeft,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
} from 'lucide-react'

const OS_LABELS: Record<string, string> = {
  LINUX_RHEL: 'RHEL / CentOS',
  LINUX_UBUNTU: 'Ubuntu',
  LINUX_DEBIAN: 'Debian',
  LINUX_SUSE: 'SUSE',
  WINDOWS: 'Windows',
  AIX: 'AIX',
  OTHER: 'Other',
}

/** All 10 provisioning step labels */
const PROVISIONING_STEP_LABELS = [
  'Initialisation',
  'OS Detection',
  'Script Generation',
  'Agent Deployment',
  'Host Declaration',
  'OS Template Applied',
  'OS Validation',
  'App Declaration',
  'Apps Configuration',
  'Complete',
]

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

/** Map job status to a step index (0-based) */
function jobStatusToStepIndex(status: JobStatus): number {
  const map: Record<JobStatus, number> = {
    PENDING: 0,
    DETECTING: 1,
    SCRIPT_GENERATED: 2,
    AGENT_DEPLOYED: 3,
    HOST_DECLARED: 4,
    OS_TEMPLATE_APPLIED: 5,
    OS_VALIDATED: 6,
    WAITING_APP_DECLARATION: 7,
    APPS_CONFIGURING: 8,
    SUCCESS: 9,
    FAILED: -1,
  }
  return map[status] ?? 0
}

type StepStatus = 'pending' | 'running' | 'success' | 'failed'

/** Build Step[] array for ProgressStepper from job status */
function buildSteps(currentIndex: number, isFailed: boolean): Array<{ label: string; status: StepStatus }> {
  return PROVISIONING_STEP_LABELS.map((label, i) => {
    let status: StepStatus = 'pending'
    if (isFailed && i === currentIndex) {
      status = 'failed'
    } else if (i < currentIndex) {
      status = 'success'
    } else if (i === currentIndex && !isFailed) {
      status = 'running'
    }
    return { label, status }
  })
}

/**
 * Detailed view of a single managed host.
 * Two-column layout: host info + provisioning status.
 */
export default function HostDetailPage() {
  const { hostId } = useParams<{ hostId: string }>()
  const navigate = useNavigate()
  const { data: hostResponse, isLoading, isError, refetch } = useHost(hostId)
  const { data: instances } = useZabbixInstances()
  const startProvisioning = useStartProvisioning()

  const [zabbixServerIp, setZabbixServerIp] = useState('')
  const [zabbixActiveIp, setZabbixActiveIp] = useState('')
  const [provError, setProvError] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Spinner />
      </div>
    )
  }

  if (isError || !hostResponse) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 mb-4">Failed to load host details.</p>
        <Button
          onClick={() => refetch()}
          variant="outline"
          className="border-gray-700 text-gray-300"
        >
          Retry
        </Button>
      </div>
    )
  }

  // The useHost hook returns { data: IHost }
  const host: IHost = hostResponse.data
  // Provisioning job and templates may be included as extra fields on the response
  const responseRecord = hostResponse as Record<string, unknown>
  const job: IProvisioningJob | null = (responseRecord['provisioningJob'] as IProvisioningJob | null) ?? null
  const templates: Array<{ id: string; name: string }> = (responseRecord['assignedTemplates'] ?? []) as Array<{ id: string; name: string }>

  const instanceLabel = Array.isArray(instances)
    ? instances.find((i) => i.id === host.zabbixInstanceId)
    : null

  const currentStepIndex = job ? jobStatusToStepIndex(job.status) : -1

  async function handleStartProvisioning() {
    setProvError(null)
    if (!zabbixServerIp.trim()) {
      setProvError('Zabbix Server IP is required.')
      return
    }
    try {
      await startProvisioning.mutateAsync({
        hostId: host.id,
        zabbixServerIp: zabbixServerIp.trim(),
        zabbixActiveIp: zabbixActiveIp.trim() || zabbixServerIp.trim(),
      })
      void refetch()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to start provisioning.'
      setProvError(message)
    }
  }

  return (
    <div className="space-y-6">
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white font-mono">{host.hostname}</h1>
          <StatusBadge status={hostStatusToBadge(host.status)} />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left -- Host info (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Host details card */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Host Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <InfoItem label="IP Address" value={host.ipAddress} mono />
                <InfoItem
                  label="Operating System"
                  value={host.os ? OS_LABELS[host.os] ?? host.os : 'Not detected'}
                />
                <InfoItem label="OS Version" value={host.osVersion ?? '-'} mono />
                <InfoItem label="Agent Version" value={host.agentVersion ?? '-'} mono />
                <InfoItem label="Agent Port" value={String(host.agentPort)} mono />
                <InfoItem label="Role" value={host.declaredRole ?? '-'} />
                <InfoItem label="Location" value={host.location ?? '-'} />
                <InfoItem
                  label="Zabbix Host ID"
                  value={host.zabbixHostId ?? 'Not declared'}
                  mono
                />
              </dl>
            </CardContent>
          </Card>

          {/* Instance info */}
          {instanceLabel && (
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Zabbix Instance</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                  <InfoItem label="Label" value={instanceLabel.label} />
                  <InfoItem label="API URL" value={instanceLabel.apiUrl} mono />
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Assigned templates */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Assigned Templates</CardTitle>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <p className="text-gray-500 text-sm">No templates assigned yet.</p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((tpl) => (
                    <li
                      key={tpl.id}
                      className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800/50 rounded-md px-3 py-2"
                    >
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      {tpl.name}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right -- Provisioning + Actions (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Provisioning */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Provisioning</CardTitle>
            </CardHeader>
            <CardContent>
              {/* No job yet */}
              {!job && host.status === 'ONBOARDING' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-400">
                    Configure and start the provisioning workflow for this host.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Zabbix Server IP <span className="text-primary">*</span>
                    </label>
                    <Input
                      value={zabbixServerIp}
                      onChange={(e) => setZabbixServerIp(e.target.value)}
                      placeholder="10.0.0.1"
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Zabbix Active IP
                    </label>
                    <Input
                      value={zabbixActiveIp}
                      onChange={(e) => setZabbixActiveIp(e.target.value)}
                      placeholder="Same as server IP if empty"
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-primary font-mono"
                    />
                  </div>
                  {provError && (
                    <p className="text-sm text-red-400 bg-red-400/10 rounded-md px-3 py-2">
                      {provError}
                    </p>
                  )}
                  <Button
                    onClick={handleStartProvisioning}
                    disabled={startProvisioning.isPending}
                    className="w-full bg-primary hover:bg-primary-hover text-white gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {startProvisioning.isPending
                      ? 'Starting...'
                      : 'Start Provisioning'}
                  </Button>
                </div>
              )}

              {/* Job in progress */}
              {job && job.status !== 'SUCCESS' && job.status !== 'FAILED' && (
                <div className="space-y-4">
                  <ProgressStepper
                    steps={buildSteps(currentStepIndex, false)}
                    currentStep={currentStepIndex}
                  />
                  <p className="text-sm text-gray-400 text-center">
                    Current step: <span className="text-white">{job.currentStep}</span>
                  </p>
                </div>
              )}

              {/* Success */}
              {job?.status === 'SUCCESS' && (
                <div className="text-center py-4 space-y-3">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-green-400 font-medium">
                    Provisioning completed successfully
                  </p>
                  {job.completedAt && (
                    <p className="text-xs text-gray-500">
                      Completed {formatDate(job.completedAt)}
                    </p>
                  )}
                </div>
              )}

              {/* Failed */}
              {job?.status === 'FAILED' && (
                <div className="space-y-3">
                  <div className="text-center py-2">
                    <XCircle className="h-12 w-12 text-red-500 mx-auto" />
                    <p className="text-red-400 font-medium mt-2">Provisioning failed</p>
                  </div>
                  {job.errorMessage && (
                    <div className="bg-red-400/10 border border-red-800 rounded-md p-3">
                      <p className="text-xs text-red-300 font-mono">{job.errorMessage}</p>
                      {job.errorCode && (
                        <p className="text-xs text-red-500 mt-1">
                          Error code: {job.errorCode}
                        </p>
                      )}
                    </div>
                  )}
                  <ProgressStepper
                    steps={buildSteps(currentStepIndex === -1 ? 0 : currentStepIndex, true)}
                    currentStep={currentStepIndex === -1 ? 0 : currentStepIndex}
                  />
                </div>
              )}

              {/* Host not in onboarding and no job */}
              {!job && host.status !== 'ONBOARDING' && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Provisioning is only available for hosts in ONBOARDING status.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {host.zabbixHostId && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-gray-700 text-gray-300 hover:text-white gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  View in Zabbix
                </Button>
              )}
              {job?.generatedScript && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-gray-700 text-gray-300 hover:text-white gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download Script
                </Button>
              )}
              {host.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-red-900/50 text-red-400 hover:bg-red-400/10 gap-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  Decommission Host
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Created</dt>
                  <dd className="text-gray-300">{formatDate(host.createdAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Last Updated</dt>
                  <dd className="text-gray-300">{formatDate(host.updatedAt)}</dd>
                </div>
                {job?.startedAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Provisioning Started</dt>
                    <dd className="text-gray-300">{formatDate(job.startedAt)}</dd>
                  </div>
                )}
                {job?.completedAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Provisioning Completed</dt>
                    <dd className="text-gray-300">{formatDate(job.completedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* InfoItem -- key-value pair for detail cards                        */
/* ------------------------------------------------------------------ */

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-gray-500 text-xs uppercase tracking-wide">{label}</dt>
      <dd className={cn('text-gray-200 mt-0.5', mono && 'font-mono text-sm')}>
        {value}
      </dd>
    </div>
  )
}
