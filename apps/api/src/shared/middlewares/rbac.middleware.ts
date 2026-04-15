import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserRole } from '@prisma/client'
import { AppError } from '../errors/AppError.js'
import { ERR_AUTH_INSUFFICIENT_PERMISSIONS } from '../errors/error-codes.js'

/**
 * Permissions matrix as defined in CLAUDE.md section 6.2.
 * '*' means all permissions.
 */
const PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: ['*'],
  MONITORING_ENGINEER: [
    'hosts:read',
    'hosts:write',
    'hosts:delete',
    'templates:read',
    'templates:write',
    'templates:delete',
    'provisioning:read',
    'provisioning:write',
    'provisioning:delete',
    'alerts:read',
    'maintenance:read',
    'maintenance:write',
    'maintenance:delete',
    'audit:read',
  ],
  NOC_OPERATOR: [
    'hosts:read',
    'alerts:read',
    'alerts:write',
    'alerts:delete',
    'noc:read',
    'noc:write',
    'maintenance:read',
    'services:read',
  ],
  MANAGER: [
    'services:read',
    'services:write',
    'services:delete',
    'reports:read',
    'reports:write',
    'audit:read',
    'alerts:read',
  ],
  READONLY: ['hosts:read', 'alerts:read', 'services:read'],
}

function hasPermission(role: UserRole, requiredPermission: string): boolean {
  const perms = PERMISSIONS[role]
  if (!perms) return false
  if (perms.includes('*')) return true

  // Exact match or wildcard domain match (e.g. 'hosts:*' matches 'hosts:read')
  return perms.some((p) => {
    if (p === requiredPermission) return true
    const [domain, action] = p.split(':')
    const [reqDomain] = requiredPermission.split(':')
    return domain === reqDomain && action === '*'
  })
}

/**
 * Returns a Fastify preHandler that checks RBAC permissions.
 *
 * @param permission - Required permission string, e.g. 'hosts:write'
 * @example
 * fastify.post('/hosts', { preHandler: [authMiddleware, requirePermission('hosts:write')] }, handler)
 */
export function requirePermission(permission: string) {
  return async function rbacMiddleware(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const jwtPayload = request.user as { role?: UserRole }
    const role = jwtPayload?.role

    if (!role) {
      throw new AppError(ERR_AUTH_INSUFFICIENT_PERMISSIONS, 403, 'No role in token')
    }

    if (!hasPermission(role, permission)) {
      throw new AppError(
        ERR_AUTH_INSUFFICIENT_PERMISSIONS,
        403,
        `Permission '${permission}' required`,
      )
    }
  }
}
