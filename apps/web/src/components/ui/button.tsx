import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-fast ease-out-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-white hover:bg-primary-hover focus-visible:ring-primary dark:focus-visible:ring-offset-brand-dark',
        secondary:
          'bg-brand-dark text-white hover:bg-brand-surface focus-visible:ring-brand-dark dark:bg-brand-surface dark:hover:bg-brand-card',
        outline:
          'border border-gray-300 bg-transparent hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-brand-card',
        ghost:
          'hover:bg-gray-100 text-gray-700 dark:text-gray-300 dark:hover:bg-brand-card',
        danger:
          'bg-red-500 text-white hover:bg-red-600 focus-visible:ring-red-500',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-md px-3 text-xs',
        default: 'h-10 px-4 py-2',
        lg: 'h-12 rounded-md px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
