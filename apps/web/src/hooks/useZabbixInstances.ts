import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'

interface ZabbixInstance {
  id: string
  tenantId: string
  label: string
  apiUrl: string
  version: string | null
  isActive: boolean
  lastHealthCheck: string | null
  healthStatus: string | null
  createdAt: string
}

interface ZabbixInstanceListResponse {
  data: ZabbixInstance[]
}

export function useZabbixInstances() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['zabbix-instances', tenantId],
    queryFn: async () => {
      const res = await api.get<ZabbixInstanceListResponse>(
        `/tenants/${tenantId}/zabbix-instances`,
      )
      return res.data.data
    },
    enabled: !!tenantId,
  })
}

export function useTestConnectivity() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await api.post(
        `/tenants/${tenantId}/zabbix-instances/${instanceId}/test-connectivity`,
      )
      return res.data as { version: string; status: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zabbix-instances'] })
    },
  })
}
