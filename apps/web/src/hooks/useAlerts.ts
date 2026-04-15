import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'

export interface IAlert {
  id: string
  instanceId: string
  triggerName: string
  hostname: string
  severity: number
  status: number
  clock: number
  description: string
}

export function useAlerts(_instanceId: string | null) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['alerts', tenantId],
    queryFn: async (): Promise<{ data: IAlert[]; total: number }> => {
      return { data: [], total: 0 }
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  })
}

export function useAlertHistory(_instanceId: string | null) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['alert-history', tenantId],
    queryFn: async (): Promise<{ data: IAlert[]; total: number }> => {
      return { data: [], total: 0 }
    },
    enabled: !!tenantId,
  })
}
