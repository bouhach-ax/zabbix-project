import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { queryClient } from './lib/queryClient.js'
import { AppShell } from './components/layout/AppShell.js'

import LoginPage from './pages/auth/LoginPage.js'
import DashboardPage from './pages/dashboard/DashboardPage.js'
import HostListPage from './pages/provisioning/HostListPage.js'
import NewHostPage from './pages/provisioning/NewHostPage.js'
import HostDetailPage from './pages/provisioning/HostDetailPage.js'
import TemplateListPage from './pages/template-builder/TemplateListPage.js'
import TemplateBuilderPage from './pages/template-builder/TemplateBuilderPage.js'
import NocPage from './pages/noc/NocPage.js'
import ServicesPage from './pages/services/ServicesPage.js'
import ReportsPage from './pages/reports/ReportsPage.js'
import AuditPage from './pages/audit/AuditPage.js'
import SettingsPage from './pages/settings/SettingsPage.js'
import ZabbixInstancesPage from './pages/settings/ZabbixInstancesPage.js'
import UsersPage from './pages/settings/UsersPage.js'

export default function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/provisioning" element={<HostListPage />} />
            <Route path="/provisioning/new" element={<NewHostPage />} />
            <Route path="/provisioning/:hostId" element={<HostDetailPage />} />
            <Route path="/template-builder" element={<TemplateListPage />} />
            <Route path="/template-builder/new" element={<TemplateBuilderPage />} />
            <Route path="/template-builder/:templateId" element={<TemplateBuilderPage />} />
            <Route path="/noc" element={<NocPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/zabbix-instances" element={<ZabbixInstancesPage />} />
            <Route path="/settings/users" element={<UsersPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
