import { useLocation } from 'react-router-dom'
import { Bell, ChevronRight, LogOut, Settings, User } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Maps route segments to readable breadcrumb labels.
 */
const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  provisioning: 'Provisioning',
  'template-builder': 'Template Builder',
  noc: 'NOC Workspace',
  services: 'Services',
  reports: 'Reports',
  audit: 'Audit',
  settings: 'Settings',
  'zabbix-instances': 'Zabbix Instances',
  users: 'Users',
  new: 'New',
}

function TopBar() {
  const location = useLocation()

  const segments = location.pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map((seg) => ROUTE_LABELS[seg] ?? seg)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-brand-surface">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((label, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />}
            <span
              className={cn(
                i === breadcrumbs.length - 1
                  ? 'font-medium text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              {label}
            </span>
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <button
          className="relative rounded-md p-2 text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-brand-card dark:hover:text-gray-200"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700 transition-colors duration-fast hover:bg-gray-200 dark:bg-brand-card dark:text-gray-300 dark:hover:bg-brand-card/80">
              U
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 dark:text-red-400">
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export { TopBar }
