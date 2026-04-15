import { z } from 'zod'

/**
 * Zod schemas for the Tenants module.
 */

export const CreateTenantBodySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only'),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'ON_PREMISE']).optional(),
  maxHosts: z.number().int().min(1).optional(),
  maxInstances: z.number().int().min(1).optional(),
})

export const UpdateTenantBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens only')
    .optional(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'ON_PREMISE']).optional(),
  maxHosts: z.number().int().min(1).optional(),
  maxInstances: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
})

export type CreateTenantBody = z.infer<typeof CreateTenantBodySchema>
export type UpdateTenantBody = z.infer<typeof UpdateTenantBodySchema>
