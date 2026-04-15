import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import type { IAlert } from '@zabbixpilot/shared-types'

interface AlertsResponse {
  data: IAlert[]
  total: number
}

export function useAlerts(instanceId: string | null) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['alerts', tenantId, instanceId],
    queryFn: async () => {
      const res = await api.get<AlertsResponse>(
        `/tenants/${tenantId}/instances/${instanceId}/alerts`,
      )
      return res.data
    },
    enabled: !!tenantId && !!instanceId,
    refetchInterval: 30_000,
  })
}

export function useAlertHistory(instanceId: string | null) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['alert-history', tenantId, instanceId],
    queryFn: async () => {
      const res = await api.get<AlertsResponse>(
        `/tenants/${tenantId}/instances/${instanceId}/alert-history`,
      )
      return res.data
    },
    enabled: !!tenantId && !!instanceId,
  })
}
