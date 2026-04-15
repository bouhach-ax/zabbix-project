import bcrypt from 'bcryptjs'
import { prisma } from '../../shared/database/prisma.js'
import { AppError } from '../../shared/errors/AppError.js'
import { ERR_USER_NOT_FOUND, ERR_USER_EMAIL_TAKEN } from '../../shared/errors/error-codes.js'
import { BCRYPT_ROUNDS } from '../../config/constants.js'
import { logAction } from '../audit/audit.service.js'
import type { CreateUserBody, UpdateUserBody } from './users.schema.js'
import { USER_SELECT } from './users.schema.js'

/**
 * Users service — CRUD with tenant isolation and audit logging.
 */

/**
 * Creates a new user within a tenant.
 * @param tenantId - Tenant scope
 * @param body - User creation data
 * @param actorId - ID of the user performing the action
 * @param ipAddress - Requester IP for audit trail
 * @throws AppError USR_002 if email is already taken within the tenant
 */
export async function createUser(
  tenantId: string,
  body: CreateUserBody,
  actorId: string,
  ipAddress: string,
) {
  // Check email uniqueness within tenant (@@unique([tenantId, email]))
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email: body.email } },
  })
  if (existing) {
    throw new AppError(ERR_USER_EMAIL_TAKEN, 409, `Email '${body.email}' is already in use`)
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      tenantId,
      email: body.email,
      passwordHash,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role ?? 'NOC_OPERATOR',
    },
    select: USER_SELECT,
  })

  await logAction({
    tenantId,
    userId: actorId,
    action: 'USER_CREATED',
    entityType: 'User',
    entityId: user.id,
    after: { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
    ipAddress,
  })

  return user
}

/**
 * Lists all users for a tenant. Never returns passwordHash.
 */
export async function findAll(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: USER_SELECT,
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Finds a single user by ID within a tenant.
 * @throws AppError USR_001 if not found
 */
export async function findById(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: USER_SELECT,
  })
  if (!user) {
    throw new AppError(ERR_USER_NOT_FOUND, 404, 'User not found')
  }
  return user
}

/**
 * Updates a user within a tenant.
 * @throws AppError USR_001 if not found
 * @throws AppError USR_002 if new email is taken within the tenant
 */
export async function updateUser(
  tenantId: string,
  userId: string,
  body: UpdateUserBody,
  actorId: string,
  ipAddress: string,
) {
  const before = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: USER_SELECT,
  })
  if (!before) {
    throw new AppError(ERR_USER_NOT_FOUND, 404, 'User not found')
  }

  // If email is changing, check uniqueness within tenant
  if (body.email && body.email !== before.email) {
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: body.email } },
    })
    if (existing) {
      throw new AppError(ERR_USER_EMAIL_TAKEN, 409, `Email '${body.email}' is already in use`)
    }
  }

  // Build update data
  const updateData: Record<string, unknown> = {}
  if (body.email !== undefined) updateData['email'] = body.email
  if (body.firstName !== undefined) updateData['firstName'] = body.firstName
  if (body.lastName !== undefined) updateData['lastName'] = body.lastName
  if (body.role !== undefined) updateData['role'] = body.role
  if (body.isActive !== undefined) updateData['isActive'] = body.isActive
  if (body.newPassword !== undefined) {
    updateData['passwordHash'] = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS)
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: USER_SELECT,
  })

  // Audit — exclude passwords from before/after
  await logAction({
    tenantId,
    userId: actorId,
    action: 'USER_UPDATED',
    entityType: 'User',
    entityId: userId,
    before: { email: before.email, firstName: before.firstName, lastName: before.lastName, role: before.role, isActive: before.isActive },
    after: { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, isActive: user.isActive },
    ipAddress,
  })

  return user
}

/**
 * Deactivates a user (soft delete).
 * @throws AppError USR_001 if not found
 */
export async function deactivateUser(
  tenantId: string,
  userId: string,
  actorId: string,
  ipAddress: string,
) {
  const before = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: USER_SELECT,
  })
  if (!before) {
    throw new AppError(ERR_USER_NOT_FOUND, 404, 'User not found')
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isActive: false },
    select: USER_SELECT,
  })

  await logAction({
    tenantId,
    userId: actorId,
    action: 'USER_DEACTIVATED',
    entityType: 'User',
    entityId: userId,
    before: { isActive: before.isActive },
    after: { isActive: false },
    ipAddress,
  })

  return user
}
