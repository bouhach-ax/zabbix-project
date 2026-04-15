import { Queue, QueueOptions } from 'bullmq'
import { getRedis } from '../cache/redis.js'

export const QUEUE_NAMES = {
  PROVISIONING: 'provisioning',
  NOTIFICATIONS: 'notifications',
  SLA_REPORTS: 'sla-reports',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]

const queues = new Map<QueueName, Queue>()

/**
 * Returns or creates a BullMQ queue instance.
 */
export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name)
  if (existing) return existing

  const connection = getRedis()
  const options: QueueOptions = {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }

  const queue = new Queue(name, options)
  queues.set(name, queue)
  return queue
}

/**
 * Close all queue connections gracefully.
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
}
