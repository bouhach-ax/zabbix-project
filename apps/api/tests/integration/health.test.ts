import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../../src/app.js'
import type { FastifyInstance } from 'fastify'

describe('GET /api/health', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 200 with status ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)

    const body = response.json<{ status: string; timestamp: string; version: string }>()
    expect(body.status).toBe('ok')
    expect(body.version).toBe('0.1.0')
    expect(body.timestamp).toBeDefined()
  })
})
