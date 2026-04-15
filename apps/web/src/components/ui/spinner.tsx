import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'

const spinnerVariants = cva(
  'inline-block animate-spin rounded-full border-2 border-current border-t-transparent text-primary',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        default: 'h-6 w-6',
        lg: 'h-8 w-8',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof spinnerVariants> {}

function Spinner({ className, size, ...props }: SpinnerProps) {
  return (
    <div
      className={cn(spinnerVariants({ size }), className)}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

export { Spinner, spinnerVariants }
