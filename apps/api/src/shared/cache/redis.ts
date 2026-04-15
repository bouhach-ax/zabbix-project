import { Redis } from 'ioredis'
import { env } from '../../config/env.js'

let _redis: Redis | null = null

/**
 * Returns the Redis client singleton.
 */
export function getRedis(): Redis {
  if (_redis) return _redis

  _redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true,
  })

  _redis.on('error', (err) => {
    console.error('[Redis] Connection error:', err)
  })

  _redis.on('connect', () => {
    console.info('[Redis] Connected')
  })

  return _redis
}

/**
 * Get a cached value. Returns null if not found.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  const value = await redis.get(key)
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis()
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
}

/**
 * Delete a cached key.
 */
export async function cacheDel(key: string): Promise<void> {
  const redis = getRedis()
  await redis.del(key)
}

/**
 * Delete all keys matching a pattern (use with care on large datasets).
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const redis = getRedis()
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}
