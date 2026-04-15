import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import type { IHost } from '@zabbixpilot/shared-types'

interface HostsResponse {
  data: IHost[]
  total: number
  page: number
  pageSize: number
}

interface HostFilters {
  status?: string
  instanceId?: string
  page?: number
}

export function useHosts(filters?: HostFilters) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['hosts', tenantId, filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.instanceId) params.set('zabbixInstanceId', filters.instanceId)
      if (filters?.page) params.set('page', String(filters.page))
      const res = await api.get<HostsResponse>(
        `/tenants/${tenantId}/hosts?${params.toString()}`,
      )
      return res.data
    },
    enabled: !!tenantId,
  })
}

export function useHost(hostId: string | undefined) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['host', tenantId, hostId],
    queryFn: async () => {
      const res = await api.get<{ data: IHost }>(
        `/tenants/${tenantId}/hosts/${hostId}`,
      )
      return res.data
    },
    enabled: !!tenantId && !!hostId,
  })
}

export function useCreateHost() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await api.post(`/tenants/${tenantId}/hosts`, data)
      return res.data as { data: IHost }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}

export function useStartProvisioning() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      hostId,
      ...data
    }: {
      hostId: string
      zabbixServerIp: string
      zabbixActiveIp: string
    }) => {
      const res = await api.post(
        `/tenants/${tenantId}/hosts/${hostId}/provision`,
        data,
      )
      return res.data as { data: { jobId: string } }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}
