import type { UserRole } from '@prisma/client'

/** Shape of the JWT access token payload */
export interface JwtPayload {
  sub: string // userId
  tenantId: string
  role: UserRole
  email: string
  iat?: number
  exp?: number
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Tenant info attached by tenantMiddleware */
    tenant?: {
      id: string
      slug: string
      isActive: boolean
      plan: string
    }
  }
}
