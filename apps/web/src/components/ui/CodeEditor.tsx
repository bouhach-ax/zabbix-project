import { useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  readOnly?: boolean
  placeholder?: string
  className?: string
}

/**
 * Simple code display/editor component for Template Builder.
 * Uses a textarea with JetBrains Mono font, dark background, and line numbers.
 * If readOnly, disables editing but allows text selection.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  placeholder,
  className,
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lineCount = value.split('\n').length
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange?.(e.target.value)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab key inserts 2 spaces instead of moving focus
      if (e.key === 'Tab' && !readOnly) {
        e.preventDefault()
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + '  ' + value.substring(end)
        onChange?.(newValue)
        // Set cursor position after React re-render
        requestAnimationFrame(() => {
          textarea.selectionStart = start + 2
          textarea.selectionEnd = start + 2
        })
      }
    },
    [onChange, readOnly, value],
  )

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        'bg-[#1e1e1e] border-gray-700',
        className,
      )}
    >
      {/* Language label */}
      {language && (
        <div className="flex items-center border-b border-gray-700 px-3 py-1.5">
          <span className="font-mono text-[11px] text-gray-400">{language}</span>
        </div>
      )}

      <div className="flex overflow-auto">
        {/* Line numbers */}
        <div
          className="shrink-0 select-none border-r border-gray-700 bg-[#1a1a1a] px-3 py-3 text-right"
          aria-hidden="true"
        >
          {lineNumbers.map((num) => (
            <div key={num} className="font-mono text-xs leading-5 text-gray-500">
              {num}
            </div>
          ))}
        </div>

        {/* Editor area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className={cn(
            'w-full resize-none bg-transparent p-3',
            'font-mono text-xs leading-5 text-gray-200',
            'outline-none placeholder:text-gray-600',
            readOnly && 'cursor-default',
          )}
          style={{ minHeight: `${Math.max(lineCount, 5) * 20 + 24}px` }}
        />
      </div>
    </div>
  )
}
