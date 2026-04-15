import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  tenant_id: string
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export type ZabbixInstance = {
  id: string
  tenant_id: string
  label: string
  api_url: string
  api_token_encrypted: string
  version: string | null
  is_active: boolean
  last_health_check: string | null
  health_status: string | null
  created_at: string
}

export type ManagedHost = {
  id: string
  tenant_id: string
  zabbix_instance_id: string | null
  zabbix_host_id: string | null
  hostname: string
  ip_address: string
  os: string | null
  os_version: string | null
  agent_version: string | null
  agent_port: number
  declared_role: string | null
  status: string
  location: string | null
  tags: unknown[]
  host_group_ids: unknown[]
  created_at: string
  updated_at: string
}

export type Tenant = {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  max_hosts: number
  max_instances: number
  created_at: string
  updated_at: string
}
