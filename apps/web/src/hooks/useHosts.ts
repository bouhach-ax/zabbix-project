import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import type { ManagedHost } from '@/lib/supabase'
import type { OsType } from '@zabbixpilot/shared-types'

interface HostFilters {
  status?: string
  instanceId?: string
  page?: number
}

function mapHost(h: ManagedHost) {
  return {
    id: h.id,
    tenantId: h.tenant_id,
    zabbixInstanceId: h.zabbix_instance_id ?? '',
    zabbixHostId: h.zabbix_host_id ?? null,
    hostname: h.hostname,
    ipAddress: h.ip_address,
    os: (h.os ?? null) as OsType | null,
    osVersion: h.os_version ?? null,
    agentVersion: h.agent_version ?? null,
    agentPort: h.agent_port,
    declaredRole: h.declared_role ?? null,
    status: h.status as 'ONBOARDING' | 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED',
    location: h.location ?? null,
    tags: h.tags as string[],
    hostGroupIds: h.host_group_ids as string[],
    createdAt: new Date(h.created_at),
    updatedAt: new Date(h.updated_at),
  }
}

export function useHosts(filters?: HostFilters) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const pageSize = 20
  const page = filters?.page ?? 1

  return useQuery({
    queryKey: ['hosts', tenantId, filters],
    queryFn: async () => {
      let query = supabase
        .from('managed_hosts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      if (filters?.status) query = query.eq('status', filters.status)
      if (filters?.instanceId) query = query.eq('zabbix_instance_id', filters.instanceId)

      const { data, error, count } = await query
      if (error) throw error
      return {
        data: (data ?? []).map(mapHost),
        total: count ?? 0,
        page,
        pageSize,
      }
    },
    enabled: !!tenantId,
  })
}

export function useHost(hostId: string | undefined) {
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  return useQuery({
    queryKey: ['host', tenantId, hostId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('managed_hosts')
        .select('*')
        .eq('id', hostId!)
        .eq('tenant_id', tenantId!)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Host not found')
      return { data: mapHost(data) }
    },
    enabled: !!tenantId && !!hostId,
  })
}

export function useCreateHost() {
  const tenantId = useAuthStore((s) => s.user?.tenantId)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const { data, error } = await supabase
        .from('managed_hosts')
        .insert({
          tenant_id: tenantId,
          hostname: input.hostname as string,
          ip_address: input.ipAddress as string,
          zabbix_instance_id: (input.zabbixInstanceId as string) || null,
          declared_role: (input.declaredRole as string) || null,
          location: (input.location as string) || null,
          status: 'ONBOARDING',
        })
        .select()
        .maybeSingle()
      if (error) throw error
      return { data: mapHost(data!) }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}

export function useStartProvisioning() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ hostId }: { hostId: string; zabbixServerIp: string; zabbixActiveIp: string }) => {
      const { error } = await supabase
        .from('managed_hosts')
        .update({ status: 'ONBOARDING' })
        .eq('id', hostId)
      if (error) throw error
      return { data: { jobId: hostId } }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hosts'] })
    },
  })
}
