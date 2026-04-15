import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import { prisma } from '../../shared/database/prisma.js'
import { getRedis } from '../../shared/cache/redis.js'
import { AppError } from '../../shared/errors/AppError.js'
import { logAction } from '../audit/audit.service.js'
import {
  ERR_AUTH_INVALID_CREDENTIALS,
  ERR_AUTH_REFRESH_INVALID,
  ERR_AUTH_ACCOUNT_DISABLED,
} from '../../shared/errors/error-codes.js'
import { env } from '../../config/env.js'
import type { LoginResponse, RefreshResponse, AuthUserResponse } from './auth.schema.js'
import type { JwtPayload } from '../../types/fastify.js'

interface RefreshTokenPayload {
  sub: string
  tenantId: string
  jti: string
  iat?: number
  exp?: number
}

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

function parseRefreshExpiry(exp: string): number {
  // Parses '30d' => seconds
  const match = /^(\d+)([dhms])$/.exec(exp)
  if (!match) return REFRESH_TTL_SECONDS
  const value = parseInt(match[1] ?? '30', 10)
  const unit = match[2]
  switch (unit) {
    case 'd':
      return value * 86400
    case 'h':
      return value * 3600
    case 'm':
      return value * 60
    default:
      return value
  }
}

/**
 * Sign a JWT access token via jsonwebtoken (HS256).
 */
function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: parseRefreshExpiry(env.JWT_ACCESS_EXPIRES_IN),
  })
}

/**
 * Sign a JWT refresh token via jsonwebtoken with a unique jti.
 */
function signRefreshToken(sub: string, tenantId: string, jti: string): string {
  return jwt.sign({ sub, tenantId, jti }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: parseRefreshExpiry(env.JWT_REFRESH_EXPIRES_IN),
  })
}

/**
 * Login with email + password.
 * Searches across all tenants if tenantId is not provided.
 */
export async function login(
  email: string,
  password: string,
  ipAddress: string,
  tenantId?: string,
): Promise<LoginResponse> {
  const user = await prisma.user.findFirst({
    where: {
      email,
      ...(tenantId ? { tenantId } : {}),
    },
    include: { tenant: { select: { id: true, isActive: true } } },
  })

  if (!user) {
    throw new AppError(ERR_AUTH_INVALID_CREDENTIALS, 401, 'Invalid email or password')
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash)
  if (!passwordValid) {
    throw new AppError(ERR_AUTH_INVALID_CREDENTIALS, 401, 'Invalid email or password')
  }

  if (!user.isActive) {
    throw new AppError(ERR_AUTH_ACCOUNT_DISABLED, 403, 'User account is disabled')
  }

  if (!user.tenant.isActive) {
    throw new AppError(ERR_AUTH_ACCOUNT_DISABLED, 403, 'Tenant account is disabled')
  }

  const jti = randomUUID()
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  })
  const refreshToken = signRefreshToken(user.id, user.tenantId, jti)

  // Store refresh token marker in Redis
  const redis = getRedis()
  const ttl = parseRefreshExpiry(env.JWT_REFRESH_EXPIRES_IN)
  await redis.set(`refresh:user:${user.id}:${jti}`, '1', 'EX', ttl)

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  await logAction({
    tenantId: user.tenantId,
    userId: user.id,
    action: 'USER_LOGIN',
    entityType: 'User',
    entityId: user.id,
    ipAddress,
  })

  const userResponse: AuthUserResponse = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenantId,
  }

  return { accessToken, refreshToken, user: userResponse }
}

/**
 * Rotate refresh token — verify, blacklist old, issue new pair.
 */
export async function refresh(
  refreshToken: string,
  ipAddress: string,
): Promise<RefreshResponse> {
  let decoded: RefreshTokenPayload
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
  } catch {
    throw new AppError(ERR_AUTH_REFRESH_INVALID, 401, 'Invalid or expired refresh token')
  }

  const { sub: userId, tenantId, jti } = decoded

  if (!userId || !tenantId || !jti) {
    throw new AppError(ERR_AUTH_REFRESH_INVALID, 401, 'Malformed refresh token')
  }

  // Check blacklist
  const redis = getRedis()
  const blacklisted = await redis.get(`blacklist:refresh:${jti}`)
  if (blacklisted) {
    throw new AppError(ERR_AUTH_REFRESH_INVALID, 401, 'Refresh token has been revoked')
  }

  // Fetch user
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
  })

  if (!user || !user.isActive) {
    throw new AppError(ERR_AUTH_REFRESH_INVALID, 401, 'User not found or inactive')
  }

  // Blacklist old jti
  const exp = decoded.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS
  const remainingTtl = Math.max(exp - Math.floor(Date.now() / 1000), 1)
  await redis.set(`blacklist:refresh:${jti}`, '1', 'EX', remainingTtl)
  await redis.del(`refresh:user:${userId}:${jti}`)

  // Issue new tokens
  const newJti = randomUUID()
  const accessToken = signAccessToken({
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  })
  const newRefreshToken = signRefreshToken(user.id, user.tenantId, newJti)

  const ttl = parseRefreshExpiry(env.JWT_REFRESH_EXPIRES_IN)
  await redis.set(`refresh:user:${userId}:${newJti}`, '1', 'EX', ttl)

  await logAction({
    tenantId,
    userId,
    action: 'TOKEN_REFRESH',
    entityType: 'User',
    entityId: userId,
    ipAddress,
  })

  return { accessToken, refreshToken: newRefreshToken }
}

/**
 * Logout — blacklist the refresh token jti.
 */
export async function logout(
  refreshToken: string,
  userId: string,
  tenantId: string,
  ipAddress: string,
): Promise<void> {
  let decoded: RefreshTokenPayload
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
  } catch {
    // Token already invalid — still consider logout successful
    return
  }

  const { jti } = decoded
  if (!jti) return

  const redis = getRedis()
  const exp = decoded.exp ?? Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS
  const remainingTtl = Math.max(exp - Math.floor(Date.now() / 1000), 1)
  await redis.set(`blacklist:refresh:${jti}`, '1', 'EX', remainingTtl)
  await redis.del(`refresh:user:${userId}:${jti}`)

  await logAction({
    tenantId,
    userId,
    action: 'USER_LOGOUT',
    entityType: 'User',
    entityId: userId,
    ipAddress,
  })
}
