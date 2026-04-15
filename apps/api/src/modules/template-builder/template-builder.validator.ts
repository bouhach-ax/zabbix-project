import type { CreateTemplateInput } from './template-builder.schema.js'

/**
 * A single validation error found during template validation.
 */
export interface ValidationError {
  field: string
  code: string
  message: string
}

/** Regex for valid Zabbix template internal name (host field). */
const INTERNAL_NAME_RE = /^[a-zA-Z0-9_\-.]+$/

/** Regex for valid macro format. */
const MACRO_FORMAT_RE = /^\{\$[A-Z0-9_]+\}$/

/** Keywords that indicate a macro should be of secret type. */
const SECRET_KEYWORDS = ['PASS', 'TOKEN', 'SECRET', 'KEY', 'CREDENTIAL']

/** Value types where trends MUST be '0' (non-numeric). */
const NON_NUMERIC_VALUE_TYPES = new Set([1, 2, 4])

/**
 * Validates a template's internal name.
 * Must contain only [a-zA-Z0-9_\-.], no spaces.
 */
function validateInternalName(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  if (!INTERNAL_NAME_RE.test(template.internalName)) {
    errors.push({
      field: 'internalName',
      code: 'TPL_INVALID_INTERNAL_NAME',
      message: `Internal name '${template.internalName}' contains invalid characters. Only [a-zA-Z0-9_-.] allowed.`,
    })
  }

  return errors
}

/**
 * Validates that items with non-numeric value_type have trends set to '0'.
 * value_type 1 (char), 2 (log), 4 (text) cannot store trends.
 */
function validateValueTypeTrends(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  for (let i = 0; i < template.items.length; i++) {
    const item = template.items[i]!
    if (NON_NUMERIC_VALUE_TYPES.has(item.value_type) && item.trends !== '0') {
      errors.push({
        field: `items[${i}].trends`,
        code: 'TPL_VALUE_TYPE_TRENDS_CONFLICT',
        message: `Item '${item.name}' has value_type ${item.value_type} (non-numeric) but trends='${item.trends}'. Trends must be '0' for value_type 1, 2, or 4.`,
      })
    }
  }

  return errors
}

/**
 * Validates that trigger expressions reference the template's internalName.
 * Expressions must contain /${internalName}/ — NOT the display name.
 */
function validateTriggerExpressions(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []
  const pattern = `/${template.internalName}/`

  for (let i = 0; i < template.triggers.length; i++) {
    const trigger = template.triggers[i]!
    if (!trigger.expression.includes(pattern)) {
      errors.push({
        field: `triggers[${i}].expression`,
        code: 'TPL_TRIGGER_EXPRESSION_INVALID',
        message: `Trigger '${trigger.name}' expression must reference template internal name '${template.internalName}'. Expected to contain '${pattern}'.`,
      })
    }
  }

  return errors
}

/**
 * Validates that each macro.macro matches the {$UPPER_CASE} pattern.
 */
function validateMacroFormat(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  for (let i = 0; i < template.macros.length; i++) {
    const macro = template.macros[i]!
    if (!MACRO_FORMAT_RE.test(macro.macro)) {
      errors.push({
        field: `macros[${i}].macro`,
        code: 'TPL_MACRO_FORMAT_INVALID',
        message: `Macro '${macro.macro}' must match {$UPPER_CASE_NAME} pattern.`,
      })
    }
  }

  return errors
}

/**
 * Warns if macros containing sensitive keywords are not of type 1 (secret).
 * These are warnings (code ends with _WARN), not hard errors.
 */
function validateMacroSecretTypes(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  for (let i = 0; i < template.macros.length; i++) {
    const macro = template.macros[i]!
    const macroNameUpper = macro.macro.toUpperCase()

    const isSensitive = SECRET_KEYWORDS.some((kw) => macroNameUpper.includes(kw))
    if (isSensitive && macro.type !== 1) {
      errors.push({
        field: `macros[${i}].type`,
        code: 'TPL_MACRO_SECRET_WARN',
        message: `Macro '${macro.macro}' appears to contain a sensitive value but is not type 1 (secret). Consider setting type to 1.`,
      })
    }
  }

  return errors
}

/**
 * Validates that item keys contain no spaces.
 */
function validateItemKeys(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  for (let i = 0; i < template.items.length; i++) {
    const item = template.items[i]!
    if (/\s/.test(item.key)) {
      errors.push({
        field: `items[${i}].key`,
        code: 'TPL_ITEM_KEY_INVALID',
        message: `Item key '${item.key}' must not contain spaces.`,
      })
    }
  }

  return errors
}

/**
 * Validates that trigger expressions reference item keys that exist in this template.
 * Checks that at least one item key appears in each trigger expression.
 */
function validateItemDependencies(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  if (template.items.length === 0 && template.triggers.length > 0) {
    // If there are triggers but no items, all triggers will fail this check
    for (let i = 0; i < template.triggers.length; i++) {
      const trigger = template.triggers[i]!
      errors.push({
        field: `triggers[${i}].expression`,
        code: 'TPL_TRIGGER_NO_ITEMS',
        message: `Trigger '${trigger.name}' has no items to reference. Add items to the template first.`,
      })
    }
    return errors
  }

  const itemKeys = new Set(template.items.map((item) => item.key))

  for (let i = 0; i < template.triggers.length; i++) {
    const trigger = template.triggers[i]!
    const referencesItem = [...itemKeys].some((key) =>
      trigger.expression.includes(key),
    )
    if (!referencesItem) {
      errors.push({
        field: `triggers[${i}].expression`,
        code: 'TPL_TRIGGER_ITEM_NOT_FOUND',
        message: `Trigger '${trigger.name}' expression does not reference any known item key from this template.`,
      })
    }
  }

  return errors
}

/**
 * Validates discovery rules and their prototypes.
 * Applies item key and value_type/trends checks on prototypes too.
 */
function validateDiscoveryRules(template: CreateTemplateInput): ValidationError[] {
  const errors: ValidationError[] = []

  for (let r = 0; r < template.discoveryRules.length; r++) {
    const rule = template.discoveryRules[r]!

    // Validate item prototypes
    if (rule.itemPrototypes) {
      for (let i = 0; i < rule.itemPrototypes.length; i++) {
        const proto = rule.itemPrototypes[i]!

        if (/\s/.test(proto.key)) {
          errors.push({
            field: `discoveryRules[${r}].itemPrototypes[${i}].key`,
            code: 'TPL_ITEM_KEY_INVALID',
            message: `Item prototype key '${proto.key}' must not contain spaces.`,
          })
        }

        if (NON_NUMERIC_VALUE_TYPES.has(proto.value_type) && proto.trends !== '0') {
          errors.push({
            field: `discoveryRules[${r}].itemPrototypes[${i}].trends`,
            code: 'TPL_VALUE_TYPE_TRENDS_CONFLICT',
            message: `Item prototype '${proto.name}' has value_type ${proto.value_type} (non-numeric) but trends='${proto.trends}'. Trends must be '0'.`,
          })
        }
      }
    }

    // Validate trigger prototypes reference the template internalName
    if (rule.triggerPrototypes) {
      const pattern = `/${template.internalName}/`
      for (let i = 0; i < rule.triggerPrototypes.length; i++) {
        const proto = rule.triggerPrototypes[i]!
        if (!proto.expression.includes(pattern)) {
          errors.push({
            field: `discoveryRules[${r}].triggerPrototypes[${i}].expression`,
            code: 'TPL_TRIGGER_EXPRESSION_INVALID',
            message: `Trigger prototype '${proto.name}' expression must reference template internal name '${template.internalName}'.`,
          })
        }
      }
    }
  }

  return errors
}

/**
 * Exhaustive validation of template data before persistence or deployment.
 * Returns an array of validation errors (empty = valid).
 *
 * @param template - Parsed template input to validate
 * @returns Array of validation errors; empty array means valid
 */
export function validateTemplate(template: CreateTemplateInput): ValidationError[] {
  return [
    ...validateInternalName(template),
    ...validateMacroFormat(template),
    ...validateMacroSecretTypes(template),
    ...validateItemKeys(template),
    ...validateValueTypeTrends(template),
    ...validateTriggerExpressions(template),
    ...validateItemDependencies(template),
    ...validateDiscoveryRules(template),
  ]
}
