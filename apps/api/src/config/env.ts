import { z } from 'zod'

/**
 * Zod validation schema for environment variables.
 * The application will fail fast at startup if any required variable is missing or malformed.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Encryption — must be 64 hex chars = 32 bytes for AES-256
  ENCRYPTION_KEY: z
    .string()
    .length(64)
    .regex(/^[a-fA-F0-9]+$/, 'ENCRYPTION_KEY must be 64 hex characters'),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // BullMQ
  PROVISIONING_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(10),

  // Optional — Anthropic LLM
  ANTHROPIC_API_KEY: z.string().optional(),

  // Optional — SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Optional — AWX
  AWX_URL: z.string().url().optional(),
  AWX_TOKEN: z.string().optional(),
  AWX_ORG_ID: z.coerce.number().int().optional(),

  // Optional — ITSM
  SERVICENOW_URL: z.string().url().optional(),
  SERVICENOW_USER: z.string().optional(),
  SERVICENOW_PASS: z.string().optional(),
  JIRA_URL: z.string().url().optional(),
  JIRA_TOKEN: z.string().optional(),

  // Optional — Slack
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_DEFAULT_CHANNEL: z.string().optional(),

  // Optional — Teams
  TEAMS_WEBHOOK_URL: z.string().url().optional(),
})

export type Env = z.infer<typeof envSchema>

let _env: Env | null = null

/**
 * Returns the validated environment config.
 * Parses once and caches. Throws at startup if validation fails.
 */
export function getEnv(): Env {
  if (_env) return _env

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n')
    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  _env = result.data
  return _env
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env]
  },
})
