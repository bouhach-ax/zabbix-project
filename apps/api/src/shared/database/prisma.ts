import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

/**
 * Prisma client singleton.
 * In development, reuse the same instance across hot-reloads to avoid exhausting DB connections.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  })
}

export const prisma: PrismaClient =
  process.env['NODE_ENV'] === 'production'
    ? createPrismaClient()
    : (globalThis.__prisma ??= createPrismaClient())
