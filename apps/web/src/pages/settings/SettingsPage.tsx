import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Database, Users, Building2, Bell, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/stores/auth.store'

const SETTINGS_CARDS = [
  {
    title: 'Zabbix Instances',
    description: 'Manage your Zabbix server connections, test connectivity, and configure API access.',
    icon: Database,
    href: '/settings/zabbix-instances',
    comingSoon: false,
  },
  {
    title: 'Users & Roles',
    description: 'Create and manage user accounts, assign roles, and control access permissions.',
    icon: Users,
    href: '/settings/users',
    comingSoon: false,
  },
  {
    title: 'Tenant Configuration',
    description: 'View and manage your organization settings, subscription plan, and resource limits.',
    icon: Building2,
    href: null,
    comingSoon: false,
  },
  {
    title: 'Notifications',
    description: 'Configure email, Slack, and Teams notification channels for alerts and reports.',
    icon: Bell,
    href: null,
    comingSoon: true,
  },
]

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage your ZabbixPilot configuration
        </p>
      </div>

      {/* Settings grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon
          const isLink = card.href != null && !card.comingSoon

          const content = (
            <>
              {/* Icon */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-100 group-hover:text-white">
                    {card.title}
                  </h3>
                  {card.comingSoon && (
                    <Badge variant="default" className="text-[10px]">
                      Coming Soon
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">{card.description}</p>

                {/* Inline tenant info for Tenant Configuration */}
                {card.title === 'Tenant Configuration' && user && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span>
                      Tenant: <span className="font-medium text-gray-300">{user.tenantId}</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              {isLink && (
                <ChevronRight className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-300" />
              )}
            </>
          )

          const classes = cn(
            'group flex items-center gap-4 rounded-lg border border-gray-700 bg-brand-card p-5 transition-all duration-fast',
            isLink && 'cursor-pointer hover:border-primary/50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]',
            !isLink && !card.comingSoon && 'cursor-default',
          )

          return isLink ? (
            <Link key={card.title} to={card.href!} className={classes}>
              {content}
            </Link>
          ) : (
            <div key={card.title} className={classes}>
              {content}
            </div>
          )
        })}
      </div>
    </div>
  )
}
