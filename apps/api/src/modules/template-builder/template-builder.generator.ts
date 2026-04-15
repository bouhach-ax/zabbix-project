import type { ZabbixApiCall } from '../../integrations/zabbix/zabbix-types.js'
import type { CreateTemplateInput } from './template-builder.schema.js'

/**
 * Placeholder string used for the template ID in generated API calls.
 * At deploy time, this is replaced with the real templateid returned by template.create.
 */
export const TEMPLATE_ID_PLACEHOLDER = '__TEMPLATE_ID__'

/**
 * Generates an ordered array of Zabbix JSON-RPC API calls from a validated template definition.
 *
 * The order of calls follows the strict Zabbix dependency chain (CLAUDE.md section 5.1):
 * 1. template.create
 * 2. valuemap.create
 * 3. usermacro.create
 * 4. item.create
 * 5. trigger.create
 * 6. graph.create (skipped — no graph config in current schema)
 * 7. discoveryrule.create
 * 8. itemprototype.create
 * 9. triggerprototype.create
 *
 * @param template - Validated template input
 * @param hostGroupId - Zabbix host group ID to assign the template to
 * @returns Ordered array of ZabbixApiCall objects
 */
export function generateZabbixApiCalls(
  template: CreateTemplateInput,
  hostGroupId: string,
): ZabbixApiCall[] {
  const calls: ZabbixApiCall[] = []

  // 1. template.create
  calls.push({
    method: 'template.create',
    params: {
      host: template.internalName,
      name: template.name,
      description: template.description ?? '',
      groups: [{ groupid: hostGroupId }],
    },
    description: `Create template '${template.name}' (internal: ${template.internalName})`,
  })

  // 2. valuemap.create — one call per value map
  for (const vm of template.valueMaps) {
    calls.push({
      method: 'valuemap.create',
      params: {
        name: vm.name,
        hostid: TEMPLATE_ID_PLACEHOLDER,
        mappings: vm.mappings.map((m) => ({
          value: m.value,
          newvalue: m.newvalue,
        })),
      },
      description: `Create value map '${vm.name}'`,
    })
  }

  // 3. usermacro.create — one call per macro
  for (const macro of template.macros) {
    calls.push({
      method: 'usermacro.create',
      params: {
        hostid: TEMPLATE_ID_PLACEHOLDER,
        macro: macro.macro,
        value: macro.value,
        type: macro.type,
        description: macro.description ?? '',
      },
      description: `Create macro '${macro.macro}'`,
    })
  }

  // 4. item.create — one call per item
  for (const item of template.items) {
    const itemParams: Record<string, unknown> = {
      hostid: TEMPLATE_ID_PLACEHOLDER,
      name: item.name,
      key_: item.key,
      type: item.type,
      value_type: item.value_type,
      delay: item.delay,
      history: item.history,
      trends: item.trends,
    }

    if (item.units) {
      itemParams['units'] = item.units
    }
    if (item.description) {
      itemParams['description'] = item.description
    }
    if (item.preprocessing && item.preprocessing.length > 0) {
      itemParams['preprocessing'] = item.preprocessing.map((pp) => ({
        type: pp.type,
        params: pp.params,
        error_handler: pp.error_handler ?? '0',
      }))
    }

    calls.push({
      method: 'item.create',
      params: itemParams,
      description: `Create item '${item.name}' (key: ${item.key})`,
    })
  }

  // 5. trigger.create — one call per trigger
  for (const trigger of template.triggers) {
    calls.push({
      method: 'trigger.create',
      params: {
        description: trigger.name,
        expression: trigger.expression,
        priority: trigger.severity,
        comments: trigger.description ?? '',
        dependencies: trigger.dependencies
          ? trigger.dependencies.map((dep) => ({ triggerid: dep }))
          : [],
      },
      description: `Create trigger '${trigger.name}'`,
    })
  }

  // 6. graph.create — skipped (no graph config in current schema)

  // 7–9. Discovery rules + prototypes
  for (const rule of template.discoveryRules) {
    // 7. discoveryrule.create
    const ruleParams: Record<string, unknown> = {
      hostid: TEMPLATE_ID_PLACEHOLDER,
      name: rule.name,
      key_: rule.key,
      type: 0, // Zabbix agent
      delay: rule.delay,
    }

    if (rule.filter) {
      ruleParams['filter'] = {
        evaltype: rule.filter.evaltype ?? 0,
        conditions: rule.filter.conditions.map((c) => ({
          macro: c.macro,
          value: c.value,
          operator: c.operator ?? '8', // matches regex by default
        })),
      }
    }

    calls.push({
      method: 'discoveryrule.create',
      params: ruleParams,
      description: `Create discovery rule '${rule.name}'`,
    })

    // 8. itemprototype.create — one per item prototype
    if (rule.itemPrototypes) {
      for (const proto of rule.itemPrototypes) {
        const protoParams: Record<string, unknown> = {
          hostid: TEMPLATE_ID_PLACEHOLDER,
          ruleid: `__RULE_${rule.key}__`,
          name: proto.name,
          key_: proto.key,
          type: proto.type,
          value_type: proto.value_type,
          delay: proto.delay,
          history: proto.history,
          trends: proto.trends,
        }

        if (proto.units) {
          protoParams['units'] = proto.units
        }
        if (proto.description) {
          protoParams['description'] = proto.description
        }
        if (proto.preprocessing && proto.preprocessing.length > 0) {
          protoParams['preprocessing'] = proto.preprocessing.map((pp) => ({
            type: pp.type,
            params: pp.params,
            error_handler: pp.error_handler ?? '0',
          }))
        }

        calls.push({
          method: 'itemprototype.create',
          params: protoParams,
          description: `Create item prototype '${proto.name}' for rule '${rule.name}'`,
        })
      }
    }

    // 9. triggerprototype.create — one per trigger prototype
    if (rule.triggerPrototypes) {
      for (const proto of rule.triggerPrototypes) {
        calls.push({
          method: 'triggerprototype.create',
          params: {
            description: proto.name,
            expression: proto.expression,
            priority: proto.severity,
            comments: proto.description ?? '',
          },
          description: `Create trigger prototype '${proto.name}' for rule '${rule.name}'`,
        })
      }
    }
  }

  return calls
}
