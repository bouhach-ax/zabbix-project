/**
 * Base application error class.
 * All business errors should extend this class.
 *
 * @example
 * throw new AppError('HOST_NOT_FOUND', 404, 'Host not found')
 * throw new AppError('AGENT_002', 503, 'Zabbix agent unreachable', { ip, port })
 */
export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(code: string, statusCode: number, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype)
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    }
  }
}
