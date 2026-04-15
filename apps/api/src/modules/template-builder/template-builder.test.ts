import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateTemplate } from './template-builder.validator.js'
import { generateZabbixApiCalls, TEMPLATE_ID_PLACEHOLDER } from './template-builder.generator.js'
import { analyzeError } from './error-analyzer.js'
import type { CreateTemplateInput } from './template-builder.schema.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a minimal valid template input for tests. */
function makeTemplate(overrides: Partial<CreateTemplateInput> = {}): CreateTemplateInput {
  return {
    name: 'Oracle 19c Custom',
    internalName: 'Custom_Oracle_19c',
    targetApp: 'oracle',
    targetOs: 'LINUX_RHEL',
    prerequisites: [],
    macros: [],
    items: [],
    triggers: [],
    valueMaps: [],
    discoveryRules: [],
    ...overrides,
  }
}

// ===========================================================================
// Template Builder Validator
// ===========================================================================

describe('Template Builder Validator', () => {
  // -----------------------------------------------------------------------
  // validateInternalName
  // -----------------------------------------------------------------------
  describe('validateInternalName', () => {
    it('accepts valid names: alphanumeric, dots, dashes, underscores', () => {
      const input = makeTemplate({ internalName: 'Custom_Oracle-19c.v2' })
      const errors = validateTemplate(input)
      const nameErrors = errors.filter((e) => e.code === 'TPL_INVALID_INTERNAL_NAME')
      expect(nameErrors).toHaveLength(0)
    })

    it('rejects names with spaces', () => {
      const input = makeTemplate({ internalName: 'Custom Oracle 19c' })
      const errors = validateTemplate(input)
      const nameErrors = errors.filter((e) => e.code === 'TPL_INVALID_INTERNAL_NAME')
      expect(nameErrors).toHaveLength(1)
      expect(nameErrors[0]!.field).toBe('internalName')
    })

    it('rejects names with special characters', () => {
      const input = makeTemplate({ internalName: 'Custom@Oracle#19c!' })
      const errors = validateTemplate(input)
      const nameErrors = errors.filter((e) => e.code === 'TPL_INVALID_INTERNAL_NAME')
      expect(nameErrors).toHaveLength(1)
    })

    it('rejects empty internal name', () => {
      const input = makeTemplate({ internalName: '' })
      const errors = validateTemplate(input)
      const nameErrors = errors.filter((e) => e.code === 'TPL_INVALID_INTERNAL_NAME')
      expect(nameErrors).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // validateValueTypeTrends
  // -----------------------------------------------------------------------
  describe('validateValueTypeTrends', () => {
    it('allows trends for value_type 0 (float)', () => {
      const input = makeTemplate({
        items: [
          { name: 'CPU Usage', key: 'cpu.usage', type: 0, value_type: 0, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(0)
    })

    it('allows trends for value_type 3 (unsigned int)', () => {
      const input = makeTemplate({
        items: [
          { name: 'Process Count', key: 'proc.num', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(0)
    })

    it('rejects non-zero trends for value_type 1 (character)', () => {
      const input = makeTemplate({
        items: [
          { name: 'Status Text', key: 'status.text', type: 0, value_type: 1, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(1)
      expect(trendsErrors[0]!.field).toBe('items[0].trends')
    })

    it('rejects non-zero trends for value_type 2 (log)', () => {
      const input = makeTemplate({
        items: [
          { name: 'Log Entry', key: 'log.entry', type: 0, value_type: 2, delay: '1m', history: '90d', trends: '30d' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(1)
    })

    it('rejects non-zero trends for value_type 4 (text)', () => {
      const input = makeTemplate({
        items: [
          { name: 'Full Output', key: 'cmd.output', type: 0, value_type: 4, delay: '5m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(1)
    })

    it('accepts trends "0" for text types', () => {
      const input = makeTemplate({
        items: [
          { name: 'Status Text', key: 'status.text', type: 0, value_type: 1, delay: '1m', history: '90d', trends: '0' },
          { name: 'Log Entry', key: 'log.entry', type: 0, value_type: 2, delay: '1m', history: '90d', trends: '0' },
          { name: 'Full Output', key: 'cmd.output', type: 0, value_type: 4, delay: '5m', history: '90d', trends: '0' },
        ],
      })
      const errors = validateTemplate(input)
      const trendsErrors = errors.filter((e) => e.code === 'TPL_VALUE_TYPE_TRENDS_CONFLICT')
      expect(trendsErrors).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // validateTriggerExpressions
  // -----------------------------------------------------------------------
  describe('validateTriggerExpressions', () => {
    it('accepts expression referencing internalName', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        items: [
          { name: 'Oracle Status', key: 'oracle.status[{$ORACLE_SID}]', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          {
            name: 'Oracle is down',
            expression: 'last(/Custom_Oracle_19c/oracle.status[{$ORACLE_SID}])=0',
            severity: 5,
          },
        ],
      })
      const errors = validateTemplate(input)
      const exprErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_EXPRESSION_INVALID')
      expect(exprErrors).toHaveLength(0)
    })

    it('rejects expression not referencing internalName', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        items: [
          { name: 'Oracle Status', key: 'oracle.status', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          {
            name: 'Oracle is down',
            expression: 'last(/SomeOtherTemplate/oracle.status)=0',
            severity: 5,
          },
        ],
      })
      const errors = validateTemplate(input)
      const exprErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_EXPRESSION_INVALID')
      expect(exprErrors).toHaveLength(1)
      expect(exprErrors[0]!.field).toBe('triggers[0].expression')
    })

    it('catches expression using display name instead of internalName', () => {
      const input = makeTemplate({
        name: 'Oracle 19c Custom',
        internalName: 'Custom_Oracle_19c',
        items: [
          { name: 'Oracle Status', key: 'oracle.status', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          {
            name: 'Oracle is down',
            expression: 'last(/Oracle 19c Custom/oracle.status)=0',
            severity: 5,
          },
        ],
      })
      const errors = validateTemplate(input)
      const exprErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_EXPRESSION_INVALID')
      expect(exprErrors).toHaveLength(1)
      expect(exprErrors[0]!.message).toContain('Custom_Oracle_19c')
    })
  })

  // -----------------------------------------------------------------------
  // validateMacroFormat
  // -----------------------------------------------------------------------
  describe('validateMacroFormat', () => {
    it('accepts valid macro format {$NAME}', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$ORACLE_SID}', value: 'ORCL', type: 0 },
          { macro: '{$DB_PORT}', value: '1521', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const macroErrors = errors.filter((e) => e.code === 'TPL_MACRO_FORMAT_INVALID')
      expect(macroErrors).toHaveLength(0)
    })

    it('rejects lowercase macro names', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$oracle_sid}', value: 'ORCL', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const macroErrors = errors.filter((e) => e.code === 'TPL_MACRO_FORMAT_INVALID')
      expect(macroErrors).toHaveLength(1)
    })

    it('rejects missing braces', () => {
      const input = makeTemplate({
        macros: [
          { macro: '$ORACLE_SID', value: 'ORCL', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const macroErrors = errors.filter((e) => e.code === 'TPL_MACRO_FORMAT_INVALID')
      expect(macroErrors).toHaveLength(1)
    })

    it('rejects macro with spaces in name', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$ORACLE SID}', value: 'ORCL', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const macroErrors = errors.filter((e) => e.code === 'TPL_MACRO_FORMAT_INVALID')
      expect(macroErrors).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // validateMacroSecretTypes
  // -----------------------------------------------------------------------
  describe('validateMacroSecretTypes', () => {
    it('warns when PASSWORD macro is not type 1', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$DB_PASSWORD}', value: 'secret123', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(1)
      expect(secretWarnings[0]!.message).toContain('sensitive')
    })

    it('warns when TOKEN macro is not type 1', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$API_TOKEN}', value: 'tok_abc123', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(1)
    })

    it('warns when SECRET macro is not type 1', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$APP_SECRET}', value: 'sec_xyz', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(1)
    })

    it('warns when KEY macro is not type 1', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$ENCRYPTION_KEY}', value: 'key123', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(1)
    })

    it('no warning for non-secret macros with type 0', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$ORACLE_SID}', value: 'ORCL', type: 0 },
          { macro: '{$DB_PORT}', value: '1521', type: 0 },
          { macro: '{$HOSTNAME}', value: 'db01', type: 0 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(0)
    })

    it('no warning when sensitive macro is already type 1', () => {
      const input = makeTemplate({
        macros: [
          { macro: '{$DB_PASSWORD}', value: '***', type: 1 },
          { macro: '{$API_TOKEN}', value: '***', type: 1 },
        ],
      })
      const errors = validateTemplate(input)
      const secretWarnings = errors.filter((e) => e.code === 'TPL_MACRO_SECRET_WARN')
      expect(secretWarnings).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // validateItemKeys
  // -----------------------------------------------------------------------
  describe('validateItemKeys', () => {
    it('accepts keys without spaces', () => {
      const input = makeTemplate({
        items: [
          { name: 'CPU', key: 'system.cpu.util[,idle]', type: 0, value_type: 0, delay: '1m', history: '90d', trends: '365d' },
          { name: 'Memory', key: 'vm.memory.size[available]', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const keyErrors = errors.filter((e) => e.code === 'TPL_ITEM_KEY_INVALID')
      expect(keyErrors).toHaveLength(0)
    })

    it('rejects keys with spaces', () => {
      const input = makeTemplate({
        items: [
          { name: 'CPU', key: 'system.cpu util', type: 0, value_type: 0, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const keyErrors = errors.filter((e) => e.code === 'TPL_ITEM_KEY_INVALID')
      expect(keyErrors).toHaveLength(1)
      expect(keyErrors[0]!.field).toBe('items[0].key')
    })

    it('rejects keys with tabs', () => {
      const input = makeTemplate({
        items: [
          { name: 'CPU', key: 'system.cpu\tutil', type: 0, value_type: 0, delay: '1m', history: '90d', trends: '365d' },
        ],
      })
      const errors = validateTemplate(input)
      const keyErrors = errors.filter((e) => e.code === 'TPL_ITEM_KEY_INVALID')
      expect(keyErrors).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // validateItemDependencies
  // -----------------------------------------------------------------------
  describe('validateItemDependencies', () => {
    it('passes when trigger references existing item key', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        items: [
          { name: 'Oracle Status', key: 'oracle.status', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          {
            name: 'Oracle is down',
            expression: 'last(/Custom_Oracle_19c/oracle.status)=0',
            severity: 5,
          },
        ],
      })
      const errors = validateTemplate(input)
      const depErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_ITEM_NOT_FOUND')
      expect(depErrors).toHaveLength(0)
    })

    it('fails when trigger references non-existent item key', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        items: [
          { name: 'Oracle Status', key: 'oracle.status', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          {
            name: 'Oracle tablespace low',
            expression: 'last(/Custom_Oracle_19c/oracle.tablespace.pused)>90',
            severity: 4,
          },
        ],
      })
      const errors = validateTemplate(input)
      const depErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_ITEM_NOT_FOUND')
      expect(depErrors).toHaveLength(1)
      expect(depErrors[0]!.field).toBe('triggers[0].expression')
    })

    it('flags all triggers when no items exist', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        items: [],
        triggers: [
          { name: 'Trigger A', expression: 'last(/Custom_Oracle_19c/some.key)=0', severity: 3 },
          { name: 'Trigger B', expression: 'last(/Custom_Oracle_19c/other.key)>5', severity: 2 },
        ],
      })
      const errors = validateTemplate(input)
      const noItemErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_NO_ITEMS')
      expect(noItemErrors).toHaveLength(2)
    })
  })

  // -----------------------------------------------------------------------
  // validateDiscoveryRules
  // -----------------------------------------------------------------------
  describe('validateDiscoveryRules', () => {
    it('validates item prototype keys and trends', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        discoveryRules: [
          {
            name: 'Tablespace Discovery',
            key: 'oracle.tablespace.discovery',
            delay: '1h',
            itemPrototypes: [
              { name: 'TS Size', key: 'oracle.ts size', type: 0, value_type: 0, delay: '5m', history: '90d', trends: '365d' },
            ],
          },
        ],
      })
      const errors = validateTemplate(input)
      const keyErrors = errors.filter((e) => e.code === 'TPL_ITEM_KEY_INVALID')
      expect(keyErrors).toHaveLength(1)
      expect(keyErrors[0]!.field).toContain('discoveryRules[0].itemPrototypes[0].key')
    })

    it('validates trigger prototype expressions reference internalName', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        discoveryRules: [
          {
            name: 'Tablespace Discovery',
            key: 'oracle.tablespace.discovery',
            delay: '1h',
            triggerPrototypes: [
              {
                name: 'TS Usage High',
                expression: 'last(/WrongTemplate/oracle.ts.pused[{#TSNAME}])>90',
                severity: 4,
              },
            ],
          },
        ],
      })
      const errors = validateTemplate(input)
      const exprErrors = errors.filter((e) => e.code === 'TPL_TRIGGER_EXPRESSION_INVALID')
      expect(exprErrors).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // Full validation (combined)
  // -----------------------------------------------------------------------
  describe('validateTemplate (combined)', () => {
    it('returns no errors for a fully valid template', () => {
      const input = makeTemplate({
        internalName: 'Custom_Oracle_19c',
        macros: [
          { macro: '{$ORACLE_SID}', value: 'ORCL', type: 0 },
          { macro: '{$DB_PASSWORD}', value: '***', type: 1 },
        ],
        items: [
          { name: 'Oracle Status', key: 'oracle.status[{$ORACLE_SID}]', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
          { name: 'Oracle Log', key: 'oracle.log[{$ORACLE_SID}]', type: 0, value_type: 2, delay: '1m', history: '90d', trends: '0' },
        ],
        triggers: [
          {
            name: 'Oracle is down',
            expression: 'last(/Custom_Oracle_19c/oracle.status[{$ORACLE_SID}])=0',
            severity: 5,
          },
        ],
        valueMaps: [
          { name: 'Oracle Status Map', mappings: [{ value: '0', newvalue: 'Down' }, { value: '1', newvalue: 'Up' }] },
        ],
      })
      const errors = validateTemplate(input)
      // Only warnings should remain (no hard errors)
      const hardErrors = errors.filter((e) => !e.code.endsWith('_WARN'))
      expect(hardErrors).toHaveLength(0)
    })

    it('catches multiple errors across different validators', () => {
      const input = makeTemplate({
        internalName: 'Invalid Template Name!',
        macros: [
          { macro: '{$bad_macro}', value: 'test', type: 0 },
        ],
        items: [
          { name: 'Bad Item', key: 'item with spaces', type: 0, value_type: 4, delay: '1m', history: '90d', trends: '365d' },
        ],
        triggers: [
          { name: 'Bad Trigger', expression: 'last(/WrongName/item.key)=0', severity: 3 },
        ],
      })
      const errors = validateTemplate(input)
      const hardErrors = errors.filter((e) => !e.code.endsWith('_WARN'))
      expect(hardErrors.length).toBeGreaterThanOrEqual(4)
    })
  })
})

// ===========================================================================
// Template Builder Generator
// ===========================================================================

describe('Template Builder Generator', () => {
  describe('generateZabbixApiCalls', () => {
    const fullTemplate = makeTemplate({
      internalName: 'Custom_Oracle_19c',
      name: 'Oracle 19c Custom',
      description: 'Custom monitoring for Oracle 19c',
      macros: [
        { macro: '{$ORACLE_SID}', value: 'ORCL', type: 0, description: 'Oracle SID' },
        { macro: '{$DB_PASSWORD}', value: '***', type: 1 },
      ],
      items: [
        { name: 'Oracle Status', key: 'oracle.status', type: 0, value_type: 3, delay: '1m', history: '90d', trends: '365d' },
        { name: 'Oracle Log', key: 'oracle.alert.log', type: 0, value_type: 2, delay: '30s', history: '90d', trends: '0' },
      ],
      triggers: [
        { name: 'Oracle is down', expression: 'last(/Custom_Oracle_19c/oracle.status)=0', severity: 5 },
      ],
      valueMaps: [
        { name: 'Oracle Status Map', mappings: [{ value: '0', newvalue: 'Down' }, { value: '1', newvalue: 'Up' }] },
      ],
      discoveryRules: [
        {
          name: 'Tablespace Discovery',
          key: 'oracle.tablespace.discovery',
          delay: '1h',
          itemPrototypes: [
            { name: 'TS {#TSNAME} Used %', key: 'oracle.ts.pused[{#TSNAME}]', type: 0, value_type: 0, delay: '5m', history: '90d', trends: '365d' },
          ],
          triggerPrototypes: [
            { name: 'TS {#TSNAME} usage high', expression: 'last(/Custom_Oracle_19c/oracle.ts.pused[{#TSNAME}])>90', severity: 4 },
          ],
        },
      ],
    })

    it('generates calls in correct order: template -> valuemaps -> macros -> items -> triggers -> discoveryrule -> prototypes', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const methods = calls.map((c) => c.method)

      const templateIdx = methods.indexOf('template.create')
      const firstValuemap = methods.indexOf('valuemap.create')
      const firstMacro = methods.indexOf('usermacro.create')
      const firstItem = methods.indexOf('item.create')
      const firstTrigger = methods.indexOf('trigger.create')
      const firstDiscovery = methods.indexOf('discoveryrule.create')
      const firstItemProto = methods.indexOf('itemprototype.create')
      const firstTriggerProto = methods.indexOf('triggerprototype.create')

      expect(templateIdx).toBe(0)
      expect(firstValuemap).toBeGreaterThan(templateIdx)
      expect(firstMacro).toBeGreaterThan(firstValuemap)
      expect(firstItem).toBeGreaterThan(firstMacro)
      expect(firstTrigger).toBeGreaterThan(firstItem)
      expect(firstDiscovery).toBeGreaterThan(firstTrigger)
      expect(firstItemProto).toBeGreaterThan(firstDiscovery)
      expect(firstTriggerProto).toBeGreaterThan(firstItemProto)
    })

    it('generates template.create as first call', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      expect(calls[0]!.method).toBe('template.create')
      const params = calls[0]!.params as Record<string, unknown>
      expect(params['host']).toBe('Custom_Oracle_19c')
      expect(params['name']).toBe('Oracle 19c Custom')
      expect(params['groups']).toEqual([{ groupid: '1' }])
    })

    it('generates usermacro.create for each macro', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const macroCalls = calls.filter((c) => c.method === 'usermacro.create')
      expect(macroCalls).toHaveLength(2)
      expect((macroCalls[0]!.params as Record<string, unknown>)['macro']).toBe('{$ORACLE_SID}')
      expect((macroCalls[1]!.params as Record<string, unknown>)['macro']).toBe('{$DB_PASSWORD}')
      expect((macroCalls[1]!.params as Record<string, unknown>)['type']).toBe(1)
    })

    it('generates item.create for each item with correct value_type mapping', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const itemCalls = calls.filter((c) => c.method === 'item.create')
      expect(itemCalls).toHaveLength(2)
      expect((itemCalls[0]!.params as Record<string, unknown>)['value_type']).toBe(3)
      expect((itemCalls[1]!.params as Record<string, unknown>)['value_type']).toBe(2)
    })

    it('generates trigger.create with correct expression', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const triggerCalls = calls.filter((c) => c.method === 'trigger.create')
      expect(triggerCalls).toHaveLength(1)
      const params = triggerCalls[0]!.params as Record<string, unknown>
      expect(params['expression']).toBe('last(/Custom_Oracle_19c/oracle.status)=0')
      expect(params['priority']).toBe(5)
    })

    it('generates discoveryrule.create for discovery rules', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const drCalls = calls.filter((c) => c.method === 'discoveryrule.create')
      expect(drCalls).toHaveLength(1)
      const params = drCalls[0]!.params as Record<string, unknown>
      expect(params['key_']).toBe('oracle.tablespace.discovery')
    })

    it('includes placeholder for templateid', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      // All calls after template.create should use the placeholder
      const macroCalls = calls.filter((c) => c.method === 'usermacro.create')
      expect((macroCalls[0]!.params as Record<string, unknown>)['hostid']).toBe(TEMPLATE_ID_PLACEHOLDER)
    })

    it('generates valuemap.create for each value map', () => {
      const calls = generateZabbixApiCalls(fullTemplate, '1')
      const vmCalls = calls.filter((c) => c.method === 'valuemap.create')
      expect(vmCalls).toHaveLength(1)
      const params = vmCalls[0]!.params as Record<string, unknown>
      expect(params['name']).toBe('Oracle Status Map')
      expect((params['mappings'] as unknown[]).length).toBe(2)
    })

    it('generates empty array for template with no items/triggers/macros', () => {
      const minimal = makeTemplate({ internalName: 'Minimal_Template' })
      const calls = generateZabbixApiCalls(minimal, '1')
      expect(calls).toHaveLength(1) // Only template.create
      expect(calls[0]!.method).toBe('template.create')
    })
  })
})

// ===========================================================================
// Error Analyzer
// ===========================================================================

describe('Error Analyzer', () => {
  describe('analyzeError', () => {
    it('identifies unsupported item key', () => {
      const result = analyzeError('ZBX_NOTSUPPORTED: unsupported item key')
      expect(result.code).toBe('ITEM_KEY_INVALID')
      expect(result.suggestion).toBeDefined()
    })

    it('identifies expression evaluation error', () => {
      const result = analyzeError('Cannot evaluate expression: invalid function')
      expect(result.code).toBe('EXPRESSION_ERROR')
    })

    it('identifies connection refused', () => {
      const result = analyzeError('Get value from agent failed: connection refused')
      expect(result.code).toBe('AGENT_UNREACHABLE')
      expect(result.suggestion).toContain('firewall')
    })

    it('identifies timeout', () => {
      const result = analyzeError('Timeout while connecting to agent (timed out)')
      expect(result.code).toBe('AGENT_TIMEOUT')
    })

    it('identifies "timed out" variant', () => {
      const result = analyzeError('Agent request timed out after 3 seconds')
      expect(result.code).toBe('AGENT_TIMEOUT')
    })

    it('identifies not supported items', () => {
      const result = analyzeError('Item is not supported by the agent')
      expect(result.code).toBe('NOT_SUPPORTED')
    })

    it('identifies permission denied', () => {
      const result = analyzeError('Permission denied when executing command')
      expect(result.code).toBe('PERMISSION_DENIED')
    })

    it('identifies file not found', () => {
      const result = analyzeError('/usr/local/bin/check_oracle: No such file or directory')
      expect(result.code).toBe('FILE_NOT_FOUND')
    })

    it('returns UNKNOWN for unrecognized errors', () => {
      const result = analyzeError('Some completely novel error message xyz')
      expect(result.code).toBe('UNKNOWN')
      expect(result.message).toBe('Unknown error')
    })
  })
})
