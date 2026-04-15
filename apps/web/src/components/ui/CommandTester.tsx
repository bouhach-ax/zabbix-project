import { useState, useCallback } from 'react'
import { Play, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommandTestResult {
  success: boolean
  output?: string
  error?: string
  executionTimeMs?: number
}

interface CommandTesterProps {
  onTest: (command: string) => Promise<CommandTestResult>
  className?: string
}

/**
 * Command test component for Template Builder.
 * Allows testing system.run commands against a Zabbix agent.
 * Displays results with success/error states, output, and execution time.
 */
export function CommandTester({ onTest, className }: CommandTesterProps) {
  const [command, setCommand] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CommandTestResult | null>(null)

  const handleTest = useCallback(async () => {
    if (!command.trim() || loading) return

    setLoading(true)
    setResult(null)

    try {
      const res = await onTest(command.trim())
      setResult(res)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setResult({ success: false, error: message })
    } finally {
      setLoading(false)
    }
  }, [command, loading, onTest])

  return (
    <div className={cn('space-y-3', className)}>
      {/* Input and test button */}
      <div className="flex gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void handleTest()
            }
          }}
          placeholder="system.run[command]"
          className={cn(
            'flex-1 rounded-md border px-3 py-2',
            'font-mono text-sm',
            'bg-brand-surface',
            'text-gray-900',
            'border-gray-300',
            'placeholder:text-gray-400 dark:placeholder:text-gray-500',
            'outline-none focus:ring-2 focus:ring-primary/50',
            'transition-colors duration-fast ease-out-standard',
          )}
        />
        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={!command.trim() || loading}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-4 py-2',
            'bg-primary text-white text-sm font-medium',
            'hover:bg-primary-hover',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors duration-fast ease-out-standard',
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Test
        </button>
      </div>

      {/* Result display */}
      {result && (
        <div
          className={cn(
            'rounded-lg border p-3',
            result.success
              ? 'border-green-500/50 bg-green-50 dark:bg-green-950/30'
              : 'border-red-500/50 bg-red-50 dark:bg-red-950/30',
          )}
        >
          {/* Status header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.success ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  result.success
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400',
                )}
              >
                {result.success ? 'Success' : 'Error'}
              </span>
            </div>
            {result.executionTimeMs !== undefined && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {result.executionTimeMs}ms
              </span>
            )}
          </div>

          {/* Output */}
          {(result.output ?? result.error) && (
            <pre className="mt-2 overflow-auto rounded bg-[#1e1e1e] p-2 font-mono text-xs leading-relaxed text-gray-200">
              {result.output ?? result.error}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
