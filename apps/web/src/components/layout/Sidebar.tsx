import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Server,
  FileCode,
  MonitorDot,
  Network,
  BarChart3,
  ScrollText,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'zp-sidebar-collapsed'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Provisioning', path: '/provisioning', icon: Server },
  { label: 'Template Builder', path: '/template-builder', icon: FileCode },
  { label: 'NOC Workspace', path: '/noc', icon: MonitorDot },
  { label: 'Services', path: '/services', icon: Network },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Audit', path: '/audit', icon: ScrollText },
  { label: 'Settings', path: '/settings', icon: Settings },
]

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })
  const location = useLocation()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-fast lg:hidden',
          collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
        onClick={() => { setCollapsed(true) }}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full flex-col bg-brand-dark transition-[width] duration-fast ease-out-standard',
          'lg:relative lg:z-auto',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-white">
            ZP
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-white">ZabbixPilot</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/dashboard' && location.pathname.startsWith(item.path))

              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-fast',
                      isActive
                        ? 'border-l-2 border-primary bg-primary/10 text-white'
                        : 'border-l-2 border-transparent text-gray-400 hover:bg-brand-surface hover:text-gray-200',
                      collapsed && 'justify-center px-2'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User section + collapse toggle */}
        <div className="border-t border-gray-800 p-3">
          {!collapsed && (
            <div className="mb-3 flex items-center gap-3 rounded-md px-2 py-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-surface text-xs font-medium text-gray-300">
                U
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-200">User</p>
                <p className="truncate text-xs text-gray-500">Operator</p>
              </div>
            </div>
          )}

          <button
            onClick={() => { setCollapsed((prev) => !prev) }}
            className="flex w-full items-center justify-center rounded-md p-2 text-gray-400 transition-colors duration-fast hover:bg-brand-surface hover:text-gray-200"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>
        </div>
      </aside>
    </>
  )
}

export { Sidebar }
