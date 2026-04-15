/*
  # ZabbixPilot Core Schema

  Creates the core tables needed for the ZabbixPilot web app to run
  without a local Docker/PostgreSQL backend.

  ## Tables created:
  1. tenants - Organisation accounts
  2. profiles - User profiles linked to Supabase auth.users
  3. zabbix_instances - Zabbix server connections
  4. managed_hosts - Monitored servers

  ## Security: RLS enabled on all tables
*/

-- -----------------------------------------------------------------------
-- TENANTS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         text NOT NULL,
  slug         text UNIQUE NOT NULL,
  plan         text NOT NULL DEFAULT 'STARTER',
  is_active    boolean NOT NULL DEFAULT true,
  max_hosts    int NOT NULL DEFAULT 500,
  max_instances int NOT NULL DEFAULT 2,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- PROFILES (extends auth.users)
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id    text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        text NOT NULL,
  first_name   text NOT NULL DEFAULT '',
  last_name    text NOT NULL DEFAULT '',
  role         text NOT NULL DEFAULT 'NOC_OPERATOR',
  is_active    boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- ZABBIX INSTANCES
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zabbix_instances (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  label               text NOT NULL,
  api_url             text NOT NULL,
  api_token_encrypted text NOT NULL DEFAULT '',
  version             text,
  is_active           boolean NOT NULL DEFAULT true,
  last_health_check   timestamptz,
  health_status       text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE zabbix_instances ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- MANAGED HOSTS
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS managed_hosts (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  zabbix_instance_id  text REFERENCES zabbix_instances(id) ON DELETE SET NULL,
  zabbix_host_id      text,
  hostname            text NOT NULL,
  ip_address          text NOT NULL,
  os                  text,
  os_version          text,
  agent_version       text,
  agent_port          int NOT NULL DEFAULT 10050,
  declared_role       text,
  status              text NOT NULL DEFAULT 'ONBOARDING',
  location            text,
  tags                jsonb NOT NULL DEFAULT '[]',
  host_group_ids      jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE managed_hosts ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------
-- RLS POLICIES - TENANTS
-- -----------------------------------------------------------------------
CREATE POLICY "Tenant members can view their tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- -----------------------------------------------------------------------
-- RLS POLICIES - PROFILES
-- -----------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can insert own profile on signup"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Teammates can view each other profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- -----------------------------------------------------------------------
-- RLS POLICIES - ZABBIX INSTANCES
-- -----------------------------------------------------------------------
CREATE POLICY "Users can view their tenant zabbix instances"
  ON zabbix_instances FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert zabbix instances for their tenant"
  ON zabbix_instances FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update their tenant zabbix instances"
  ON zabbix_instances FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their tenant zabbix instances"
  ON zabbix_instances FOR DELETE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- -----------------------------------------------------------------------
-- RLS POLICIES - MANAGED HOSTS
-- -----------------------------------------------------------------------
CREATE POLICY "Users can view their tenant hosts"
  ON managed_hosts FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert hosts for their tenant"
  ON managed_hosts FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update their tenant hosts"
  ON managed_hosts FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can delete their tenant hosts"
  ON managed_hosts FOR DELETE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- -----------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zabbix_instances_tenant_id ON zabbix_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_managed_hosts_tenant_id ON managed_hosts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_managed_hosts_status ON managed_hosts(tenant_id, status);

-- -----------------------------------------------------------------------
-- SEED: demo tenant
-- -----------------------------------------------------------------------
INSERT INTO tenants (id, name, slug, plan)
VALUES ('demo-tenant-001', 'Demo Organization', 'demo-org', 'ENTERPRISE')
ON CONFLICT (id) DO NOTHING;
