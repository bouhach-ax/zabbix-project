import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../errors/AppError.js'
import {
  ERR_AUTH_TOKEN_EXPIRED,
  ERR_AUTH_TOKEN_INVALID,
} from '../errors/error-codes.js'

/**
 * Fastify preHandler — verifies the JWT access token.
 * Attaches decoded user payload to request.user.
 * The actual JWT verification is delegated to @fastify/jwt plugin.
 */
export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch (err) {
    const error = err as Error
    if (error.message?.includes('expired')) {
      throw new AppError(ERR_AUTH_TOKEN_EXPIRED, 401, 'Access token has expired')
    }
    throw new AppError(ERR_AUTH_TOKEN_INVALID, 401, 'Invalid access token')
  }
}
