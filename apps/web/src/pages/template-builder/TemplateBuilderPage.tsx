import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { cn } from '@/lib/utils'
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Rocket,
  Check,
  AlertCircle,
  FileCode2,
  Settings2,
  Key,
  BarChart3,
  Zap,
  Search,
  ClipboardCheck,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MacroRow {
  macro: string
  value: string
  type: 0 | 1 | 2
  description: string
}

interface ItemRow {
  name: string
  key: string
  type: number
  value_type: number
  delay: string
  history: string
  trends: string
  units: string
}

interface TriggerRow {
  name: string
  expression: string
  severity: number
  description: string
}

interface DiscoveryRuleRow {
  name: string
  key: string
  delay: string
  filter: string
}

interface FormData {
  name: string
  internalName: string
  targetApp: string
  targetOs: string
  description: string
  prerequisites: string[]
  macros: MacroRow[]
  items: ItemRow[]
  triggers: TriggerRow[]
  discoveryRules: DiscoveryRuleRow[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Basic Info', icon: FileCode2 },
  { label: 'Prerequisites', icon: Settings2 },
  { label: 'Macros', icon: Key },
  { label: 'Items', icon: BarChart3 },
  { label: 'Triggers', icon: Zap },
  { label: 'Discovery Rules', icon: Search },
  { label: 'Review & Deploy', icon: ClipboardCheck },
]

const OS_OPTIONS = [
  { value: 'LINUX_RHEL', label: 'Linux RHEL/CentOS' },
  { value: 'LINUX_UBUNTU', label: 'Linux Ubuntu' },
  { value: 'LINUX_DEBIAN', label: 'Linux Debian' },
  { value: 'LINUX_SUSE', label: 'Linux SUSE' },
  { value: 'WINDOWS', label: 'Windows' },
  { value: 'AIX', label: 'AIX' },
  { value: 'OTHER', label: 'Other' },
]

const ITEM_TYPES: Record<number, string> = {
  0: 'Zabbix agent',
  2: 'Zabbix trapper',
  3: 'Simple check',
  5: 'Zabbix internal',
  7: 'Zabbix agent (active)',
  10: 'External check',
  11: 'Database monitor',
  13: 'IPMI agent',
  14: 'SSH agent',
  15: 'Telnet agent',
  17: 'Calculated',
  18: 'JMX agent',
  20: 'SNMP agent',
  21: 'Dependent item',
}

const VALUE_TYPES: Record<number, string> = {
  0: 'Float',
  1: 'Character',
  2: 'Log',
  3: 'Unsigned integer',
  4: 'Text',
}

const SEVERITY_LABELS: Record<number, string> = {
  0: 'Not classified',
  1: 'Information',
  2: 'Warning',
  3: 'Average',
  4: 'High',
  5: 'Disaster',
}

const MACRO_TYPES: Record<number, string> = {
  0: 'Text',
  1: 'Secret',
  2: 'Vault',
}

function defaultFormData(): FormData {
  return {
    name: '',
    internalName: '',
    targetApp: '',
    targetOs: 'LINUX_RHEL',
    description: '',
    prerequisites: [],
    macros: [],
    items: [],
    triggers: [],
    discoveryRules: [],
  }
}

function generateInternalName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_\-.]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

// trends must be '0' for character (1), log (2), text (4)
function shouldDisableTrends(valueType: number): boolean {
  return valueType === 1 || valueType === 2 || valueType === 4
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ValidationError {
  step: number
  field: string
  message: string
}

function validate(data: FormData): ValidationError[] {
  const errors: ValidationError[] = []

  // Step 0: Basic Info
  if (!data.name.trim()) {
    errors.push({ step: 0, field: 'name', message: 'Template name is required' })
  }
  if (!data.internalName.trim()) {
    errors.push({ step: 0, field: 'internalName', message: 'Internal name is required' })
  } else if (!/^[a-zA-Z0-9_\-.]+$/.test(data.internalName)) {
    errors.push({
      step: 0,
      field: 'internalName',
      message: 'Internal name must contain only [a-zA-Z0-9_-.]',
    })
  }
  if (!data.targetApp.trim()) {
    errors.push({ step: 0, field: 'targetApp', message: 'Target application is required' })
  }

  // Step 2: Macros
  for (const [i, m] of data.macros.entries()) {
    if (!m.macro.startsWith('{$') || !m.macro.endsWith('}')) {
      errors.push({
        step: 2,
        field: `macros[${i}].macro`,
        message: `Macro "${m.macro}" must follow the format {$NAME}`,
      })
    }
    if (m.type === 1 && !m.value) {
      // Secrets can be empty when editing, but warn on creation
    }
  }

  // Step 3: Items
  for (const [i, item] of data.items.entries()) {
    if (!item.name.trim()) {
      errors.push({ step: 3, field: `items[${i}].name`, message: `Item #${i + 1} needs a name` })
    }
    if (!item.key.trim()) {
      errors.push({ step: 3, field: `items[${i}].key`, message: `Item #${i + 1} needs a key` })
    }
    if (shouldDisableTrends(item.value_type) && item.trends !== '0') {
      errors.push({
        step: 3,
        field: `items[${i}].trends`,
        message: `Item "${item.name}": trends must be "0" for value_type ${VALUE_TYPES[item.value_type] ?? 'unknown'}`,
      })
    }
  }

  // Step 4: Triggers
  for (const [i, t] of data.triggers.entries()) {
    if (!t.name.trim()) {
      errors.push({ step: 4, field: `triggers[${i}].name`, message: `Trigger #${i + 1} needs a name` })
    }
    if (!t.expression.trim()) {
      errors.push({
        step: 4,
        field: `triggers[${i}].expression`,
        message: `Trigger #${i + 1} needs an expression`,
      })
    } else if (data.internalName && !t.expression.includes(`/${data.internalName}/`)) {
      errors.push({
        step: 4,
        field: `triggers[${i}].expression`,
        message: `Trigger "${t.name}" expression must reference /${data.internalName}/ (internal name, not display name)`,
      })
    }
  }

  return errors
}

// ---------------------------------------------------------------------------
// Sub-components for each step
// ---------------------------------------------------------------------------

function StepBasicInfo({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Template Name</label>
        <Input
          value={data.name}
          onChange={(e) => {
            const name = e.target.value
            onChange({ name, internalName: generateInternalName(name) })
          }}
          placeholder="Oracle 19c Monitoring"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">
          Internal Name{' '}
          <span className="text-gray-500 font-normal">(auto-generated, editable)</span>
        </label>
        <Input
          value={data.internalName}
          onChange={(e) => onChange({ internalName: e.target.value })}
          placeholder="oracle_19c_monitoring"
          className="font-mono"
        />
        <p className="mt-1 text-xs text-gray-500">
          Only [a-zA-Z0-9_-.] allowed. Used in trigger expressions.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Target Application</label>
        <Input
          value={data.targetApp}
          onChange={(e) => onChange({ targetApp: e.target.value })}
          placeholder="Oracle Database"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Target OS</label>
        <select
          value={data.targetOs}
          onChange={(e) => onChange({ targetOs: e.target.value })}
          className="flex h-10 w-full rounded-md border border-gray-600 bg-brand-surface px-3 py-2 text-sm text-gray-200 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-brand-dark"
        >
          {OS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-brand-surface">
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-300">Description</label>
        <textarea
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Monitoring template for Oracle 19c databases..."
          className="flex w-full rounded-md border border-gray-600 bg-brand-surface px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-brand-dark"
        />
      </div>
    </div>
  )
}

function StepPrerequisites({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft.trim()) return
    onChange({ prerequisites: [...data.prerequisites, draft.trim()] })
    setDraft('')
  }

  const remove = (index: number) => {
    onChange({ prerequisites: data.prerequisites.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        List any prerequisites that must be met before this template can be applied (e.g., agent
        packages, running services, open ports).
      </p>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="e.g., Oracle Instant Client installed"
          className="flex-1"
        />
        <Button onClick={add} size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>
      {data.prerequisites.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-500">No prerequisites added yet</p>
      )}
      <ul className="space-y-2">
        {data.prerequisites.map((p, i) => (
          <li
            key={i}
            className="flex items-center justify-between rounded-md border border-gray-700 bg-brand-surface px-3 py-2"
          >
            <span className="text-sm text-gray-200">{p}</span>
            <button
              onClick={() => remove(i)}
              className="text-gray-500 hover:text-red-400 transition-colors duration-150"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StepMacros({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  const addRow = () => {
    onChange({
      macros: [...data.macros, { macro: '{$}', value: '', type: 0, description: '' }],
    })
  }

  const updateRow = (index: number, partial: Partial<MacroRow>) => {
    const updated = data.macros.map((m, i) => (i === index ? { ...m, ...partial } : m))
    onChange({ macros: updated })
  }

  const removeRow = (index: number) => {
    onChange({ macros: data.macros.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Define user macros. Passwords and tokens must use type <strong>Secret</strong>.
        </p>
        <Button onClick={addRow} size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" /> Add Macro
        </Button>
      </div>

      {data.macros.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No macros defined</p>
      )}

      {data.macros.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Macro</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2 w-32">Type</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.macros.map((m, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Input
                      value={m.macro}
                      onChange={(e) => updateRow(i, { macro: e.target.value })}
                      placeholder="{$ORACLE_SID}"
                      className="font-mono text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={m.value}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                      type={m.type === 1 ? 'password' : 'text'}
                      placeholder={m.type === 1 ? '********' : 'value'}
                      className="text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.type}
                      onChange={(e) => updateRow(i, { type: Number(e.target.value) as 0 | 1 | 2 })}
                      className="h-8 w-full rounded-md border border-gray-600 bg-brand-surface px-2 text-xs text-gray-200 outline-none focus:ring-2 focus:ring-primary"
                    >
                      {Object.entries(MACRO_TYPES).map(([v, l]) => (
                        <option key={v} value={v} className="bg-brand-surface">
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={m.description}
                      onChange={(e) => updateRow(i, { description: e.target.value })}
                      placeholder="Description"
                      className="text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="text-gray-500 hover:text-red-400 transition-colors duration-150"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StepItems({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  const addRow = () => {
    onChange({
      items: [
        ...data.items,
        { name: '', key: '', type: 7, value_type: 0, delay: '1m', history: '90d', trends: '365d', units: '' },
      ],
    })
  }

  const updateRow = (index: number, partial: Partial<ItemRow>) => {
    const updated = data.items.map((item, i) => {
      if (i !== index) return item
      const merged = { ...item, ...partial }
      // Auto-set trends to '0' when value_type is character/log/text
      if (partial.value_type !== undefined && shouldDisableTrends(partial.value_type)) {
        merged.trends = '0'
      }
      return merged
    })
    onChange({ items: updated })
  }

  const removeRow = (index: number) => {
    onChange({ items: data.items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Define monitoring items. Trends are auto-disabled for Character, Log, and Text types.
        </p>
        <Button onClick={addRow} size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" /> Add Item
        </Button>
      </div>

      {data.items.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No items defined</p>
      )}

      {data.items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Key</th>
                <th className="px-2 py-2 w-36">Type</th>
                <th className="px-2 py-2 w-32">Value Type</th>
                <th className="px-2 py-2 w-20">Delay</th>
                <th className="px-2 py-2 w-20">History</th>
                <th className="px-2 py-2 w-20">Trends</th>
                <th className="px-2 py-2 w-20">Units</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.items.map((item, i) => {
                const trendsDisabled = shouldDisableTrends(item.value_type)
                return (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder="CPU utilization"
                        className="text-xs h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.key}
                        onChange={(e) => updateRow(i, { key: e.target.value })}
                        placeholder="system.cpu.util"
                        className="font-mono text-xs h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={item.type}
                        onChange={(e) => updateRow(i, { type: Number(e.target.value) })}
                        className="h-8 w-full rounded-md border border-gray-600 bg-brand-surface px-1 text-xs text-gray-200 outline-none focus:ring-2 focus:ring-primary"
                      >
                        {Object.entries(ITEM_TYPES).map(([v, l]) => (
                          <option key={v} value={v} className="bg-brand-surface">
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={item.value_type}
                        onChange={(e) => updateRow(i, { value_type: Number(e.target.value) })}
                        className="h-8 w-full rounded-md border border-gray-600 bg-brand-surface px-1 text-xs text-gray-200 outline-none focus:ring-2 focus:ring-primary"
                      >
                        {Object.entries(VALUE_TYPES).map(([v, l]) => (
                          <option key={v} value={v} className="bg-brand-surface">
                            {l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.delay}
                        onChange={(e) => updateRow(i, { delay: e.target.value })}
                        className="font-mono text-xs h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.history}
                        onChange={(e) => updateRow(i, { history: e.target.value })}
                        className="font-mono text-xs h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5 relative">
                      <Input
                        value={item.trends}
                        onChange={(e) => updateRow(i, { trends: e.target.value })}
                        disabled={trendsDisabled}
                        className={cn('font-mono text-xs h-8', trendsDisabled && 'opacity-50')}
                      />
                      {trendsDisabled && (
                        <span className="absolute -bottom-3 left-2 text-[10px] text-amber-400">
                          Forced to 0
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        value={item.units}
                        onChange={(e) => updateRow(i, { units: e.target.value })}
                        placeholder="%"
                        className="text-xs h-8"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => removeRow(i)}
                        className="text-gray-500 hover:text-red-400 transition-colors duration-150"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StepTriggers({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  const addRow = () => {
    onChange({
      triggers: [
        ...data.triggers,
        {
          name: '',
          expression: data.internalName ? `last(/${data.internalName}/)` : '',
          severity: 3,
          description: '',
        },
      ],
    })
  }

  const updateRow = (index: number, partial: Partial<TriggerRow>) => {
    const updated = data.triggers.map((t, i) => (i === index ? { ...t, ...partial } : t))
    onChange({ triggers: updated })
  }

  const removeRow = (index: number) => {
    onChange({ triggers: data.triggers.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">
            Define triggers. Expressions must reference the internal name.
          </p>
          {data.internalName && (
            <p className="mt-1 text-xs text-amber-400">
              Expression must reference: <span className="font-mono">/{data.internalName}/</span>
            </p>
          )}
        </div>
        <Button onClick={addRow} size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" /> Add Trigger
        </Button>
      </div>

      {data.triggers.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No triggers defined</p>
      )}

      {data.triggers.length > 0 && (
        <div className="space-y-3">
          {data.triggers.map((t, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-700 bg-brand-surface p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <Input
                    value={t.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="Trigger name"
                    className="text-xs h-8"
                  />
                </div>
                <select
                  value={t.severity}
                  onChange={(e) => updateRow(i, { severity: Number(e.target.value) })}
                  className="h-8 w-40 rounded-md border border-gray-600 bg-brand-surface px-2 text-xs text-gray-200 outline-none focus:ring-2 focus:ring-primary"
                >
                  {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v} className="bg-brand-surface">
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(i)}
                  className="text-gray-500 hover:text-red-400 transition-colors duration-150"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div>
                <Input
                  value={t.expression}
                  onChange={(e) => updateRow(i, { expression: e.target.value })}
                  placeholder={`last(/${data.internalName || 'template_name'}/item.key)=0`}
                  className="font-mono text-xs h-8"
                />
              </div>
              <Input
                value={t.description}
                onChange={(e) => updateRow(i, { description: e.target.value })}
                placeholder="Description (optional)"
                className="text-xs h-8"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StepDiscoveryRules({
  data,
  onChange,
}: {
  data: FormData
  onChange: (d: Partial<FormData>) => void
}) {
  const addRow = () => {
    onChange({
      discoveryRules: [
        ...data.discoveryRules,
        { name: '', key: '', delay: '1h', filter: '' },
      ],
    })
  }

  const updateRow = (index: number, partial: Partial<DiscoveryRuleRow>) => {
    const updated = data.discoveryRules.map((r, i) => (i === index ? { ...r, ...partial } : r))
    onChange({ discoveryRules: updated })
  }

  const removeRow = (index: number) => {
    onChange({ discoveryRules: data.discoveryRules.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          Define LLD (Low-Level Discovery) rules for automatic detection.
        </p>
        <Button onClick={addRow} size="sm" variant="secondary">
          <Plus className="mr-1 h-4 w-4" /> Add Rule
        </Button>
      </div>

      {data.discoveryRules.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No discovery rules defined</p>
      )}

      {data.discoveryRules.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Key</th>
                <th className="px-3 py-2 w-24">Delay</th>
                <th className="px-3 py-2">Filter</th>
                <th className="px-3 py-2 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {data.discoveryRules.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Input
                      value={r.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      placeholder="Filesystem discovery"
                      className="text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={r.key}
                      onChange={(e) => updateRow(i, { key: e.target.value })}
                      placeholder="vfs.fs.discovery"
                      className="font-mono text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={r.delay}
                      onChange={(e) => updateRow(i, { delay: e.target.value })}
                      className="font-mono text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={r.filter}
                      onChange={(e) => updateRow(i, { filter: e.target.value })}
                      placeholder="{#FSTYPE} matches ^(ext|xfs)"
                      className="font-mono text-xs h-8"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="text-gray-500 hover:text-red-400 transition-colors duration-150"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StepReview({
  data,
  errors,
}: {
  data: FormData
  errors: ValidationError[]
}) {
  return (
    <div className="space-y-6">
      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-500/50 bg-red-950/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <span className="text-sm font-medium text-red-400">
              {errors.length} validation error{errors.length > 1 ? 's' : ''} found
            </span>
          </div>
          <ul className="space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-xs text-red-300">
                Step {err.step + 1} ({STEPS[err.step]?.label}) - {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {errors.length === 0 && (
        <div className="rounded-lg border border-green-500/50 bg-green-950/30 p-4 flex items-center gap-2">
          <Check className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-green-400">
            All validations passed. Ready to deploy.
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-400">Name</h4>
          <p className="text-sm text-gray-100">{data.name || '-'}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-400">Internal Name</h4>
          <p className="font-mono text-sm text-gray-100">{data.internalName || '-'}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-400">Target Application</h4>
          <p className="text-sm text-gray-100">{data.targetApp || '-'}</p>
        </div>
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-400">Target OS</h4>
          <p className="text-sm text-gray-100">
            {OS_OPTIONS.find((o) => o.value === data.targetOs)?.label || data.targetOs}
          </p>
        </div>
      </div>

      {data.description && (
        <div>
          <h4 className="mb-1 text-xs font-medium uppercase text-gray-400">Description</h4>
          <p className="text-sm text-gray-300">{data.description}</p>
        </div>
      )}

      {/* Prerequisites */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">
          Prerequisites ({data.prerequisites.length})
        </h4>
        {data.prerequisites.length > 0 ? (
          <ul className="list-disc list-inside space-y-1">
            {data.prerequisites.map((p, i) => (
              <li key={i} className="text-sm text-gray-300">
                {p}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>

      {/* Macros */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">
          Macros ({data.macros.length})
        </h4>
        {data.macros.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="px-3 py-1.5">Macro</th>
                  <th className="px-3 py-1.5">Type</th>
                  <th className="px-3 py-1.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {data.macros.map((m, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-mono text-gray-200">{m.macro}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={m.type === 1 ? 'warning' : 'default'} className="text-[10px]">
                        {MACRO_TYPES[m.type]}
                      </Badge>
                    </td>
                    <td className="px-3 py-1.5 text-gray-400">{m.description || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>

      {/* Items */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">
          Items ({data.items.length})
        </h4>
        {data.items.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="px-3 py-1.5">Name</th>
                  <th className="px-3 py-1.5">Key</th>
                  <th className="px-3 py-1.5">Value Type</th>
                  <th className="px-3 py-1.5">Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {data.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-200">{item.name}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-300">{item.key}</td>
                    <td className="px-3 py-1.5 text-gray-400">{VALUE_TYPES[item.value_type]}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-400">{item.delay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>

      {/* Triggers */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">
          Triggers ({data.triggers.length})
        </h4>
        {data.triggers.length > 0 ? (
          <div className="space-y-2">
            {data.triggers.map((t, i) => (
              <div key={i} className="rounded-lg border border-gray-700 bg-brand-surface px-3 py-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={t.severity >= 4 ? 'danger' : t.severity >= 2 ? 'warning' : 'info'}
                    className="text-[10px]"
                  >
                    {SEVERITY_LABELS[t.severity]}
                  </Badge>
                  <span className="text-sm text-gray-200">{t.name}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-gray-400 truncate">{t.expression}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>

      {/* Discovery Rules */}
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase text-gray-400">
          Discovery Rules ({data.discoveryRules.length})
        </h4>
        {data.discoveryRules.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="px-3 py-1.5">Name</th>
                  <th className="px-3 py-1.5">Key</th>
                  <th className="px-3 py-1.5">Delay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {data.discoveryRules.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-200">{r.name}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-300">{r.key}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-400">{r.delay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">None</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TemplateBuilderPage() {
  const { templateId, instanceId } = useParams<{ templateId?: string; instanceId?: string }>()
  const navigate = useNavigate()
  const tenantId = useAuthStore((s) => s.user?.tenantId)

  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<FormData>(defaultFormData)
  const [deployStatus, setDeployStatus] = useState<'idle' | 'creating' | 'deploying' | 'success' | 'error'>('idle')
  const [deployError, setDeployError] = useState<string | null>(null)

  const validationErrors = validate(formData)
  const stepErrors = (step: number) => validationErrors.filter((e) => e.step === step)

  const updateFormData = useCallback((partial: Partial<FormData>) => {
    setFormData((prev) => ({ ...prev, ...partial }))
  }, [])

  const deployMutation = useMutation({
    mutationFn: async () => {
      setDeployStatus('creating')
      setDeployError(null)

      const createRes = await api.post(
        `/tenants/${tenantId}/instances/${instanceId}/templates`,
        formData,
      )
      const created = createRes.data as { data: { id: string } }

      setDeployStatus('deploying')
      await api.post(
        `/tenants/${tenantId}/instances/${instanceId}/templates/${created.data.id}/deploy`,
      )

      return created.data
    },
    onSuccess: () => {
      setDeployStatus('success')
    },
    onError: (err: Error) => {
      setDeployStatus('error')
      setDeployError(err.message || 'Deployment failed')
    },
  })

  const canProceed = (step: number) => {
    if (step === 0) {
      return !!formData.name.trim() && !!formData.internalName.trim() && !!formData.targetApp.trim()
    }
    return true
  }

  const goNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1)
    }
  }

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1)
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <StepBasicInfo data={formData} onChange={updateFormData} />
      case 1:
        return <StepPrerequisites data={formData} onChange={updateFormData} />
      case 2:
        return <StepMacros data={formData} onChange={updateFormData} />
      case 3:
        return <StepItems data={formData} onChange={updateFormData} />
      case 4:
        return <StepTriggers data={formData} onChange={updateFormData} />
      case 5:
        return <StepDiscoveryRules data={formData} onChange={updateFormData} />
      case 6:
        return <StepReview data={formData} errors={validationErrors} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-brand-dark p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          {templateId ? 'Edit Template' : 'Template Builder'}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {templateId
            ? 'Modify an existing Zabbix monitoring template'
            : 'Create a new Zabbix monitoring template step by step'}
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-6">
        <div className="flex items-center">
          {STEPS.map((step, i) => {
            const Icon = step.icon
            const isActive = i === currentStep
            const isCompleted = i < currentStep
            const hasErrors = stepErrors(i).length > 0

            return (
              <div key={i} className="flex items-center">
                <button
                  onClick={() => setCurrentStep(i)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-primary/20 text-primary'
                      : isCompleted
                        ? 'bg-green-500/10 text-green-400'
                        : 'text-gray-500 hover:text-gray-300',
                    hasErrors && i <= currentStep && 'ring-1 ring-red-500/50',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold',
                      isActive
                        ? 'bg-primary text-white'
                        : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-700 text-gray-400',
                    )}
                  >
                    {isCompleted ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="hidden lg:inline">{step.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-1 h-px w-6',
                      i < currentStep ? 'bg-green-500' : 'bg-gray-700',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step content */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const step = STEPS[currentStep]
              if (!step) return null
              const Icon = step.icon
              return <Icon className="h-5 w-5 text-primary" />
            })()}
            {STEPS[currentStep]?.label}
            {stepErrors(currentStep).length > 0 && (
              <Badge variant="danger" className="ml-2 text-[10px]">
                {stepErrors(currentStep).length} error{stepErrors(currentStep).length > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>

      {/* Deploy status */}
      {deployStatus === 'success' && (
        <div className="mb-6 rounded-lg border border-green-500/50 bg-green-950/30 p-4 flex items-center gap-3">
          <Check className="h-5 w-5 text-green-400" />
          <div>
            <p className="text-sm font-medium text-green-400">Template deployed successfully</p>
            <p className="text-xs text-green-300/70">
              Template has been created and deployed to the Zabbix instance.
            </p>
          </div>
        </div>
      )}
      {deployStatus === 'error' && deployError && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-950/30 p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-400">Deployment failed</p>
            <p className="text-xs text-red-300/70">{deployError}</p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={goPrev}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>

        <div className="flex items-center gap-3">
          {currentStep === STEPS.length - 1 ? (
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={
                validationErrors.length > 0 ||
                deployStatus === 'creating' ||
                deployStatus === 'deploying' ||
                deployStatus === 'success'
              }
            >
              {deployStatus === 'creating' || deployStatus === 'deploying' ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {deployStatus === 'creating' ? 'Creating...' : 'Deploying...'}
                </>
              ) : deployStatus === 'success' ? (
                <>
                  <Check className="mr-1 h-4 w-4" /> Deployed
                </>
              ) : (
                <>
                  <Rocket className="mr-1 h-4 w-4" /> Deploy to Zabbix
                </>
              )}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canProceed(currentStep)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
