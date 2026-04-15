import { z } from 'zod'

/**
 * Zod schemas for the Users module.
 */

export const CreateUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  role: z
    .enum(['ADMIN', 'MONITORING_ENGINEER', 'NOC_OPERATOR', 'MANAGER', 'READONLY'])
    .optional(),
})

export const UpdateUserBodySchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  role: z
    .enum(['ADMIN', 'MONITORING_ENGINEER', 'NOC_OPERATOR', 'MANAGER', 'READONLY'])
    .optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').optional(),
  isActive: z.boolean().optional(),
})

export type CreateUserBody = z.infer<typeof CreateUserBodySchema>
export type UpdateUserBody = z.infer<typeof UpdateUserBodySchema>

/** Select fields for user responses — never include passwordHash. */
export const USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const
