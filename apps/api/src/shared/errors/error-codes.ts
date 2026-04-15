/**
 * All application error codes.
 * Format: DOMAIN_NNN
 * Never use free-form strings for errors — always reference this file.
 */

// --- Auth ---
export const ERR_AUTH_INVALID_CREDENTIALS = 'AUTH_001'
export const ERR_AUTH_TOKEN_EXPIRED = 'AUTH_002'
export const ERR_AUTH_TOKEN_INVALID = 'AUTH_003'
export const ERR_AUTH_REFRESH_INVALID = 'AUTH_004'
export const ERR_AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_005'
export const ERR_AUTH_ACCOUNT_DISABLED = 'AUTH_006'

// --- Tenant ---
export const ERR_TENANT_NOT_FOUND = 'TNT_001'
export const ERR_TENANT_SLUG_TAKEN = 'TNT_002'
export const ERR_TENANT_INACTIVE = 'TNT_003'
export const ERR_TENANT_HOST_LIMIT_REACHED = 'TNT_004'
export const ERR_TENANT_INSTANCE_LIMIT_REACHED = 'TNT_005'

// --- User ---
export const ERR_USER_NOT_FOUND = 'USR_001'
export const ERR_USER_EMAIL_TAKEN = 'USR_002'
export const ERR_USER_INACTIVE = 'USR_003'

// --- Zabbix Instance ---
export const ERR_INSTANCE_NOT_FOUND = 'ZBX_001'
export const ERR_INSTANCE_UNREACHABLE = 'ZBX_002'
export const ERR_INSTANCE_AUTH_FAILED = 'ZBX_003'
export const ERR_INSTANCE_VERSION_UNSUPPORTED = 'ZBX_004'
export const ERR_INSTANCE_TOKEN_DECRYPT_FAILED = 'ZBX_005'

// --- Agent ---
export const ERR_AGENT_UNREACHABLE = 'AGENT_001'
export const ERR_AGENT_COMMAND_FAILED = 'AGENT_002'
export const ERR_AGENT_TIMEOUT = 'AGENT_003'
export const ERR_AGENT_NOT_ALLOWED = 'AGENT_004'

// --- Host ---
export const ERR_HOST_NOT_FOUND = 'HOST_001'
export const ERR_HOST_DUPLICATE = 'HOST_002'
export const ERR_HOST_INVALID_STATUS_TRANSITION = 'HOST_003'

// --- Provisioning ---
export const ERR_PROV_JOB_NOT_FOUND = 'PROV_001'
export const ERR_PROV_OS_DETECTION_FAILED = 'PROV_002'
export const ERR_PROV_SCRIPT_GENERATION_FAILED = 'PROV_003'
export const ERR_PROV_JOB_ALREADY_RUNNING = 'PROV_004'

// --- Template Builder ---
export const ERR_TPL_NOT_FOUND = 'TPL_001'
export const ERR_TPL_VALIDATION_FAILED = 'TPL_002'
export const ERR_TPL_DEPLOY_FAILED = 'TPL_003'
export const ERR_TPL_NAME_INVALID = 'TPL_004'
export const ERR_TPL_INTERNAL_NAME_TAKEN = 'TPL_005'
export const ERR_TPL_VALUE_TYPE_TRENDS_CONFLICT = 'TPL_006'

// --- Alerting ---
export const ERR_ALERT_NOT_FOUND = 'ALT_001'
export const ERR_ALERT_RULE_NOT_FOUND = 'ALT_002'

// --- Service Management ---
export const ERR_SVC_NOT_FOUND = 'SVC_001'
export const ERR_SVC_COMPONENT_NOT_FOUND = 'SVC_002'

// --- SLA ---
export const ERR_SLA_REPORT_NOT_FOUND = 'SLA_001'
export const ERR_SLA_PERIOD_INVALID = 'SLA_002'

// --- Validation ---
export const ERR_VALIDATION = 'VAL_001'

// --- Generic ---
export const ERR_NOT_FOUND = 'GEN_001'
export const ERR_INTERNAL = 'GEN_002'
export const ERR_RATE_LIMIT = 'GEN_003'
