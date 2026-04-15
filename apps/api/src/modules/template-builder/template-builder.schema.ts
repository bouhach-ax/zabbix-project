import { z } from 'zod'

/**
 * Zod schema for a Zabbix user macro.
 * macro field must match {$UPPER_CASE_NAME} pattern.
 * type: 0=text, 1=secret, 2=vault
 */
export const MacroSchema = z.object({
  macro: z
    .string()
    .regex(/^\{\$[A-Z0-9_]+\}$/, 'Macro must match {$UPPER_CASE_NAME} pattern'),
  value: z.string(),
  type: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  description: z.string().optional(),
})

/**
 * Zod schema for a Zabbix item.
 * key must contain no spaces.
 * value_type: 0=float, 1=char, 2=log, 3=uint, 4=text
 */
export const ItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  key: z
    .string()
    .min(1, 'Item key is required')
    .regex(/^\S+$/, 'Item key must not contain spaces'),
  type: z.number().int().min(0).max(21).default(0),
  value_type: z.number().int().min(0).max(4),
  delay: z.string().default('1m'),
  history: z.string().default('90d'),
  trends: z.string().default('365d'),
  units: z.string().optional(),
  description: z.string().optional(),
  preprocessing: z
    .array(
      z.object({
        type: z.string(),
        params: z.string(),
        error_handler: z.string().optional(),
      }),
    )
    .optional(),
})

/**
 * Zod schema for a Zabbix trigger.
 * severity: 0=not classified, 1=info, 2=warning, 3=average, 4=high, 5=disaster
 */
export const TriggerSchema = z.object({
  name: z.string().min(1, 'Trigger name is required'),
  expression: z.string().min(1, 'Trigger expression is required'),
  severity: z.number().int().min(0).max(5).default(2),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
})

/**
 * Zod schema for a Zabbix discovery rule with optional prototypes.
 */
export const DiscoveryRuleSchema = z.object({
  name: z.string().min(1, 'Discovery rule name is required'),
  key: z.string().min(1, 'Discovery rule key is required'),
  delay: z.string().default('1h'),
  filter: z
    .object({
      conditions: z.array(
        z.object({
          macro: z.string(),
          value: z.string(),
          operator: z.string().optional(),
        }),
      ),
      evaltype: z.number().optional(),
    })
    .optional(),
  itemPrototypes: z.array(ItemSchema).optional(),
  triggerPrototypes: z.array(TriggerSchema).optional(),
})

/**
 * Zod schema for a Zabbix value map.
 */
export const ValueMapSchema = z.object({
  name: z.string().min(1, 'Value map name is required'),
  mappings: z
    .array(
      z.object({
        value: z.string(),
        newvalue: z.string(),
      }),
    )
    .min(1, 'At least one mapping is required'),
})

/**
 * Zod schema for creating a managed template via the Template Builder.
 * internalName (the Zabbix 'host' field) only allows [a-zA-Z0-9_\-.].
 */
export const CreateTemplateBody = z.object({
  name: z.string().min(1, 'Template display name is required'),
  internalName: z
    .string()
    .min(1, 'Internal name is required')
    .regex(
      /^[a-zA-Z0-9_\-.]+$/,
      'Internal name must only contain [a-zA-Z0-9_-.]',
    ),
  targetApp: z.string().min(1, 'Target application is required'),
  targetOs: z.enum([
    'LINUX_RHEL',
    'LINUX_UBUNTU',
    'LINUX_DEBIAN',
    'LINUX_SUSE',
    'WINDOWS',
    'AIX',
    'OTHER',
  ]),
  description: z.string().optional(),
  prerequisites: z.array(z.string()).default([]),
  macros: z.array(MacroSchema).default([]),
  items: z.array(ItemSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  valueMaps: z.array(ValueMapSchema).default([]),
  discoveryRules: z.array(DiscoveryRuleSchema).default([]),
})

export type CreateTemplateInput = z.infer<typeof CreateTemplateBody>

/**
 * Zod schema for updating a managed template (all fields optional).
 */
export const UpdateTemplateBody = CreateTemplateBody.partial()

export type UpdateTemplateInput = z.infer<typeof UpdateTemplateBody>

/**
 * Zod schema for the test-command endpoint body.
 */
export const TestCommandBody = z.object({
  hostId: z.string().min(1, 'hostId is required'),
  command: z.string().min(1, 'command is required'),
})

export type TestCommandInput = z.infer<typeof TestCommandBody>
