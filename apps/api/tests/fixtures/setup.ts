/**
 * Vitest global setup file.
 * Runs before each test file.
 */

// Set test environment variables
process.env['NODE_ENV'] = 'test'
process.env['DATABASE_URL'] = 'postgresql://zabbixpilot:zabbixpilot_dev_pass@localhost:5432/zabbixpilot_test'
process.env['REDIS_URL'] = 'redis://:redis_dev_pass@localhost:6379'
process.env['JWT_SECRET'] = 'test_jwt_secret_minimum_32_chars_long_xxxxxxx'
process.env['JWT_REFRESH_SECRET'] = 'test_refresh_secret_minimum_32_chars_long_xxx'
process.env['ENCRYPTION_KEY'] = 'a'.repeat(64) // 64 hex chars = 32 bytes
process.env['PORT'] = '3001'
