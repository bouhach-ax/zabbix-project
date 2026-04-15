import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_TENANT_NOT_FOUND, ERR_TENANT_SLUG_TAKEN } from '../../shared/errors/error-codes.js'
import { logAction } from '../audit/audit.service.js'
import type { CreateTenantBody, UpdateTenantBody } from './tenants.schema.js'
import type { Tenant } from '@prisma/client'

/**
 * Tenants service — CRUD operations with audit logging.
 */

/**
 * Creates a new tenant.
 * @param body - Tenant creation data
 * @param userId - ID of the user performing the action
 * @param ipAddress - Requester IP for audit trail
 * @returns The created tenant
 * @throws AppError TNT_002 if slug is already taken
 */
export async function createTenant(
  body: CreateTenantBody,
  userId: string,
  ipAddress: string,
): Promise<Tenant> {
  // Check slug uniqueness
  const existing = await prisma.tenant.findUnique({
    where: { slug: body.slug },
  })
  if (existing) {
    throw new AppError(ERR_TENANT_SLUG_TAKEN, 409, `Slug '${body.slug}' is already taken`)
  }

  const tenant = await prisma.tenant.create({
    data: {
      name: body.name,
      slug: body.slug,
      plan: body.plan ?? 'STARTER',
      maxHosts: body.maxHosts ?? 500,
      maxInstances: body.maxInstances ?? 2,
    },
  })

  await logAction({
    tenantId: tenant.id,
    userId,
    action: 'TENANT_CREATED',
    entityType: 'Tenant',
    entityId: tenant.id,
    after: { name: tenant.name, slug: tenant.slug, plan: tenant.plan },
    ipAddress,
  })

  return tenant
}

/**
 * Lists all tenants. Intended for ADMIN use only.
 */
export async function findAll(): Promise<Tenant[]> {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Finds a tenant by ID.
 * @throws AppError TNT_001 if not found
 */
export async function findById(id: string): Promise<Tenant> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
  })
  if (!tenant) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 404, 'Tenant not found')
  }
  return tenant
}

/**
 * Updates a tenant.
 * @throws AppError TNT_001 if not found
 * @throws AppError TNT_002 if new slug is taken
 */
export async function updateTenant(
  id: string,
  body: UpdateTenantBody,
  userId: string,
  ipAddress: string,
): Promise<Tenant> {
  const before = await prisma.tenant.findUnique({ where: { id } })
  if (!before) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 404, 'Tenant not found')
  }

  // If slug is changing, check uniqueness
  if (body.slug && body.slug !== before.slug) {
    const existing = await prisma.tenant.findUnique({ where: { slug: body.slug } })
    if (existing) {
      throw new AppError(ERR_TENANT_SLUG_TAKEN, 409, `Slug '${body.slug}' is already taken`)
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.plan !== undefined && { plan: body.plan }),
      ...(body.maxHosts !== undefined && { maxHosts: body.maxHosts }),
      ...(body.maxInstances !== undefined && { maxInstances: body.maxInstances }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  })

  await logAction({
    tenantId: tenant.id,
    userId,
    action: 'TENANT_UPDATED',
    entityType: 'Tenant',
    entityId: tenant.id,
    before: { name: before.name, slug: before.slug, plan: before.plan, isActive: before.isActive },
    after: { name: tenant.name, slug: tenant.slug, plan: tenant.plan, isActive: tenant.isActive },
    ipAddress,
  })

  return tenant
}

/**
 * Deactivates a tenant (soft delete).
 * @throws AppError TNT_001 if not found
 */
export async function deactivateTenant(
  id: string,
  userId: string,
  ipAddress: string,
): Promise<Tenant> {
  const before = await prisma.tenant.findUnique({ where: { id } })
  if (!before) {
    throw new AppError(ERR_TENANT_NOT_FOUND, 404, 'Tenant not found')
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: { isActive: false },
  })

  await logAction({
    tenantId: tenant.id,
    userId,
    action: 'TENANT_DEACTIVATED',
    entityType: 'Tenant',
    entityId: tenant.id,
    before: { isActive: before.isActive },
    after: { isActive: false },
    ipAddress,
  })

  return tenant
}
