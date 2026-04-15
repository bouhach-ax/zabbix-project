import * as React from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({ className, icon: Icon, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
      {...props}
    >
      {Icon != null && (
        <div className="mb-4 rounded-full bg-gray-100 p-3 dark:bg-brand-card">
          <Icon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description != null && (
        <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action != null && <div className="mt-4">{action}</div>}
    </div>
  )
}

export { EmptyState }
