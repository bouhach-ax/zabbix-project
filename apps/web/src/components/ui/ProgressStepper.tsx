import { Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type StepStatus = 'pending' | 'running' | 'success' | 'failed'

interface Step {
  label: string
  status: StepStatus
}

interface ProgressStepperProps {
  steps: Step[]
  currentStep: number
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

const STEP_STYLES: Record<StepStatus, { circle: string; line: string; text: string }> = {
  pending: {
    circle: 'border-gray-600 bg-brand-surface',
    line: 'bg-gray-300 dark:bg-gray-600',
    text: 'text-gray-500',
  },
  running: {
    circle: 'border-primary bg-primary/10 dark:bg-primary/20',
    line: 'bg-gray-300 dark:bg-gray-600',
    text: 'text-primary font-medium',
  },
  success: {
    circle: 'border-green-500 bg-green-500',
    line: 'bg-green-500',
    text: 'text-green-700 dark:text-green-400',
  },
  failed: {
    circle: 'border-red-500 bg-red-500',
    line: 'bg-red-500',
    text: 'text-red-700 dark:text-red-400',
  },
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'success':
      return <Check className="h-3.5 w-3.5 text-white" />
    case 'failed':
      return <X className="h-3.5 w-3.5 text-white" />
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
    default:
      return null
  }
}

/**
 * Stepper for provisioning wizard and multi-step workflows.
 * Supports horizontal and vertical orientations.
 * Running step pulses per design rules (uses animate-spin on loader icon).
 */
export function ProgressStepper({
  steps,
  currentStep,
  orientation = 'vertical',
  className,
}: ProgressStepperProps) {
  const isVertical = orientation === 'vertical'

  return (
    <div
      className={cn(
        'flex',
        isVertical ? 'flex-col gap-0' : 'items-start gap-0',
        className,
      )}
    >
      {steps.map((step, index) => {
        const style = STEP_STYLES[step.status]
        const isLast = index === steps.length - 1

        return (
          <div
            key={index}
            className={cn(
              'flex',
              isVertical ? 'flex-row items-start' : 'flex-col items-center',
            )}
          >
            <div className={cn('flex', isVertical ? 'flex-col items-center' : 'flex-row items-center')}>
              {/* Circle */}
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
                  'transition-colors duration-fast ease-out-standard',
                  style.circle,
                  step.status === 'running' && 'ring-2 ring-primary/30',
                )}
              >
                <StepIcon status={step.status} />
              </div>
              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'transition-colors duration-fast ease-out-standard',
                    isVertical ? 'h-6 w-0.5' : 'h-0.5 w-8',
                    style.line,
                  )}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                'text-xs whitespace-nowrap',
                'transition-colors duration-fast ease-out-standard',
                style.text,
                isVertical ? 'ml-3 mt-0.5' : 'mt-2 text-center',
              )}
            >
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
