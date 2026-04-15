import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary dark:bg-primary/20',
        success: 'bg-green-50 text-green-700 dark:bg-green-500/20 dark:text-green-400',
        warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        danger: 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-400',
        info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
        outline: 'border border-gray-300 text-gray-700 dark:border-gray-600 dark:text-gray-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
