import { getEnv } from './config/env.js'
import { buildApp } from './app.js'
import { prisma } from './shared/database/prisma.js'
import { getRedis } from './shared/cache/redis.js'
import { closeAllQueues } from './shared/queue/bullmq.js'

async function main(): Promise<void> {
  // Validate environment variables before anything else
  const env = getEnv()

  const app = await buildApp()

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal} — shutting down gracefully`)
    await app.close()
    await closeAllQueues()
    await prisma.$disconnect()
    getRedis().disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`ZabbixPilot API listening on ${env.HOST}:${env.PORT}`)
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

void main()
