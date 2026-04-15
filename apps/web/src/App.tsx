import { useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient.js'
import { AppShell } from './components/layout/AppShell.js'
import { supabase } from './lib/supabase.js'
import { useAuthStore } from './stores/auth.store.js'

import LoginPage from './pages/auth/LoginPage.js'
import DashboardPage from './pages/dashboard/DashboardPage.js'
import HostListPage from './pages/provisioning/HostListPage.js'
import NewHostPage from './pages/provisioning/NewHostPage.js'
import HostDetailPage from './pages/provisioning/HostDetailPage.js'
import TemplateListPage from './pages/template-builder/TemplateListPage.js'
import TemplateBuilderPage from './pages/template-builder/TemplateBuilderPage.js'
import NocPage from './pages/noc/NocPage.js'
import ServicesPage from './pages/services/ServicesPage.js'
import ServiceDetailPage from './pages/services/ServiceDetailPage.js'
import ReportsPage from './pages/reports/ReportsPage.js'
import SlaReportPage from './pages/reports/SlaReportPage.js'
import AuditPage from './pages/audit/AuditPage.js'
import SettingsPage from './pages/settings/SettingsPage.js'
import ZabbixInstancesPage from './pages/settings/ZabbixInstancesPage.js'
import UsersPage from './pages/settings/UsersPage.js'

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const setSession = useAuthStore((s) => s.setSession)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data: profile }) => {
          setSession(session, profile)
          setReady(true)
        })
      } else {
        logout()
        setReady(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (session) {
          const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
          setSession(session, profile)
        } else {
          logout()
        }
      })()
    })

    return () => subscription.unsubscribe()
  }, [setSession, logout])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-dark">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  return <>{children}</>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/provisioning" element={<HostListPage />} />
              <Route path="/provisioning/new" element={<NewHostPage />} />
              <Route path="/provisioning/:hostId" element={<HostDetailPage />} />
              <Route path="/template-builder" element={<TemplateListPage />} />
              <Route path="/template-builder/new" element={<TemplateBuilderPage />} />
              <Route path="/template-builder/:templateId" element={<TemplateBuilderPage />} />
              <Route path="/noc" element={<NocPage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/reports/:reportId" element={<SlaReportPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/zabbix-instances" element={<ZabbixInstancesPage />} />
              <Route path="/settings/users" element={<UsersPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
