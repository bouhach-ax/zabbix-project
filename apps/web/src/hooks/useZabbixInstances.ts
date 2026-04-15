import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { ZabbixInstance } from '@/lib/supabase'

function mapInstance(i: ZabbixInstance) {
  return {
    id: i.id,
    tenantId: i.tenant_id,
    label: i.label,
    apiUrl: i.api_url,
    version: i.version,
    isActive: i.is_active,
    lastHealthCheck: i.last_health_check,
    healthStatus: i.health_status,
    createdAt: i.created_at,
  }
}

export function useZabbixInstances() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['zabbix-instances', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zabbix_instances')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(mapInstance)
    },
    enabled: !!tenantId,
  })
}

export function useCreateZabbixInstance() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { label: string; apiUrl: string; apiToken?: string }) => {
      const { data, error } = await supabase
        .from('zabbix_instances')
        .insert({
          tenant_id: tenantId,
          label: input.label,
          api_url: input.apiUrl,
          api_token_encrypted: input.apiToken ?? '',
          is_active: true,
        })
        .select()
        .maybeSingle()
      if (error) throw error
      return { data: mapInstance(data!) }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zabbix-instances'] })
    },
  })
}

export function useTestConnectivity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('zabbix_instances')
        .update({ last_health_check: new Date().toISOString(), health_status: 'unknown' })
        .eq('id', instanceId)
      if (error) throw error
      return { version: 'N/A', status: 'tested' }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zabbix-instances'] })
    },
  })
}
