import { z } from 'zod'

/**
 * Zod schemas for the Zabbix Instances module.
 */

export const CreateInstanceBodySchema = z.object({
  label: z.string().min(1).max(255),
  apiUrl: z.string().url('apiUrl must be a valid URL'),
  apiToken: z.string().min(1, 'apiToken is required'),
  isActive: z.boolean().optional(),
})

export const UpdateInstanceBodySchema = z.object({
  label: z.string().min(1).max(255).optional(),
  apiUrl: z.string().url('apiUrl must be a valid URL').optional(),
  apiToken: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
})

export type CreateInstanceBody = z.infer<typeof CreateInstanceBodySchema>
export type UpdateInstanceBody = z.infer<typeof UpdateInstanceBodySchema>

/** Select fields for instance responses — never include apiTokenEncrypted. */
export const INSTANCE_SELECT = {
  id: true,
  tenantId: true,
  label: true,
  apiUrl: true,
  version: true,
  isActive: true,
  lastHealthCheck: true,
  healthStatus: true,
  createdAt: true,
} as const
