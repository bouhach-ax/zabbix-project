import type { OsType } from '@prisma/client'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { AppError } from '../../../shared/errors/AppError.js'
import { ERR_PROV_SCRIPT_GENERATION_FAILED } from '../../../shared/errors/error-codes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface ScriptParams {
  zabbixServerIp: string
  zabbixActiveIp: string
  hostname: string
  agentPort: number
}

/**
 * Maps OsType enum to the corresponding script template file name.
 */
const OS_TEMPLATE_MAP: Record<string, string> = {
  LINUX_RHEL: 'linux-rhel.sh.tmpl',
  LINUX_UBUNTU: 'linux-ubuntu.sh.tmpl',
  LINUX_DEBIAN: 'linux-debian.sh.tmpl',
  LINUX_SUSE: 'linux-suse.sh.tmpl',
  WINDOWS: 'windows.ps1.tmpl',
  AIX: 'aix.sh.tmpl',
}

/**
 * Generates an installation/configuration script for the given OS.
 * Reads the template file from disk and replaces placeholder variables.
 *
 * @param os - Target operating system type
 * @param params - Script configuration parameters (server IPs, hostname, port)
 * @returns The generated script as a string ready for execution
 * @throws AppError PROV_003 if OS type has no template (OTHER)
 */
export function generateScript(os: OsType, params: ScriptParams): string {
  const templateFile = OS_TEMPLATE_MAP[os]

  if (!templateFile) {
    throw new AppError(
      ERR_PROV_SCRIPT_GENERATION_FAILED,
      400,
      `No installation script template available for OS type: ${os}`,
      { os },
    )
  }

  const templatePath = join(__dirname, 'scripts', templateFile)

  let template: string
  try {
    template = readFileSync(templatePath, 'utf-8')
  } catch (err) {
    throw new AppError(
      ERR_PROV_SCRIPT_GENERATION_FAILED,
      500,
      `Failed to read script template: ${templateFile}`,
      { os, templatePath, error: err instanceof Error ? err.message : String(err) },
    )
  }

  // Replace all placeholder variables
  const script = template
    .replace(/\{\{ZABBIX_SERVER\}\}/g, params.zabbixServerIp)
    .replace(/\{\{ZABBIX_ACTIVE\}\}/g, params.zabbixActiveIp)
    .replace(/\{\{HOSTNAME\}\}/g, params.hostname)
    .replace(/\{\{AGENT_PORT\}\}/g, String(params.agentPort))

  return script
}
