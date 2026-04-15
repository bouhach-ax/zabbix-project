import { z } from 'zod'

/**
 * Zod schemas for provisioning module request validation.
 */

export const CreateHostBody = z.object({
  hostname: z.string().min(1).max(255),
  ipAddress: z
    .string()
    .min(1)
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      'Must be a valid IPv4 address',
    ),
  zabbixInstanceId: z.string().min(1),
  os: z
    .enum([
      'LINUX_RHEL',
      'LINUX_UBUNTU',
      'LINUX_DEBIAN',
      'LINUX_SUSE',
      'WINDOWS',
      'AIX',
      'OTHER',
    ])
    .optional(),
  declaredRole: z.string().max(255).optional(),
  location: z.string().max(255).optional(),
  tags: z.array(z.record(z.string())).optional(),
  hostGroupIds: z.array(z.string()).optional(),
  agentPort: z.coerce.number().int().min(1).max(65535).optional(),
})

export type ICreateHostBody = z.infer<typeof CreateHostBody>

export const UpdateHostBody = z.object({
  hostname: z.string().min(1).max(255).optional(),
  ipAddress: z
    .string()
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      'Must be a valid IPv4 address',
    )
    .optional(),
  os: z
    .enum([
      'LINUX_RHEL',
      'LINUX_UBUNTU',
      'LINUX_DEBIAN',
      'LINUX_SUSE',
      'WINDOWS',
      'AIX',
      'OTHER',
    ])
    .optional(),
  declaredRole: z.string().max(255).optional().nullable(),
  location: z.string().max(255).optional().nullable(),
  tags: z.array(z.record(z.string())).optional(),
  hostGroupIds: z.array(z.string()).optional(),
  agentPort: z.coerce.number().int().min(1).max(65535).optional(),
})

export type IUpdateHostBody = z.infer<typeof UpdateHostBody>

export const StartProvisioningBody = z.object({
  zabbixServerIp: z
    .string()
    .min(1)
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      'Must be a valid IPv4 address',
    ),
  zabbixActiveIp: z
    .string()
    .min(1)
    .regex(
      /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/,
      'Must be a valid IPv4 address',
    ),
})

export type IStartProvisioningBody = z.infer<typeof StartProvisioningBody>

export const TransitionStatusBody = z.object({
  status: z.enum(['ONBOARDING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']),
  comment: z.string().max(500).optional(),
})

export type ITransitionStatusBody = z.infer<typeof TransitionStatusBody>

export const ListHostsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['ONBOARDING', 'ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'])
    .optional(),
  zabbixInstanceId: z.string().optional(),
  search: z.string().optional(),
})

export type IListHostsQuery = z.infer<typeof ListHostsQuery>
