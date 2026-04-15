/**
 * Application-wide constants.
 * Never use magic strings — reference these instead.
 */

export const ZABBIX_SUPPORTED_VERSIONS = ['6.0', '6.4', '7.0'] as const
export type ZabbixVersion = (typeof ZABBIX_SUPPORTED_VERSIONS)[number]

export const ZABBIX_DEFAULT_PORT = 10051
export const ZABBIX_AGENT_DEFAULT_PORT = 10050
export const ZABBIX_API_PATH = '/api_jsonrpc.php'

export const OS_TYPE_LABELS: Record<string, string> = {
  LINUX_RHEL: 'Linux RHEL / CentOS',
  LINUX_UBUNTU: 'Linux Ubuntu',
  LINUX_DEBIAN: 'Linux Debian',
  LINUX_SUSE: 'Linux SUSE',
  WINDOWS: 'Windows Server',
  AIX: 'IBM AIX',
  OTHER: 'Other',
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  DETECTING: 'Détection OS',
  SCRIPT_GENERATED: 'Script généré',
  AGENT_DEPLOYED: 'Agent déployé',
  HOST_DECLARED: 'Host déclaré dans Zabbix',
  OS_TEMPLATE_APPLIED: 'Template OS appliqué',
  OS_VALIDATED: 'OS validé',
  WAITING_APP_DECLARATION: 'En attente de déclaration applicative',
  APPS_CONFIGURING: 'Configuration applicative',
  SUCCESS: 'Terminé avec succès',
  FAILED: 'Échec',
}

export const CACHE_TTL = {
  ZABBIX_HOSTS: 30,
  ZABBIX_TEMPLATES: 30,
  ZABBIX_ALERTS: 30,
  HEALTH_CHECK: 60,
  USER_SESSION: 900,
} as const

export const BCRYPT_ROUNDS = 12

export const JWT_ALGORITHM = 'HS256' as const

export const RATE_LIMIT = {
  AUTH: { max: 10, timeWindow: '1 minute' },
  API: { max: 500, timeWindow: '1 minute' },
} as const

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const

export const PROVISIONING_STEPS = [
  'Initialisation',
  'Détection OS',
  'Génération script',
  'Déploiement agent',
  'Déclaration host Zabbix',
  'Application template OS',
  'Validation OS',
  "Déclaration applications",
  'Configuration monitoring applicatif',
  'Validation finale',
] as const
