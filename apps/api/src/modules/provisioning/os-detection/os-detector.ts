import type { OsType } from '@prisma/client'
import type { ZabbixApiService } from '../../../integrations/zabbix/ZabbixApiService.js'

export interface OsDetectionResult {
  os: OsType
  version: string
  agentVersion: string
}

/**
 * Detects OS from a uname string (returned by zabbix_get system.uname).
 * Pure function — parsing logic only, no network calls.
 *
 * @param uname - Raw output from system.uname item
 * @returns Parsed OS type and best-effort version string
 */
export function parseOsFromUname(uname: string): { os: OsType; version: string } {
  const upper = uname.toUpperCase()

  // Windows detection
  if (upper.includes('WINDOWS')) {
    const versionMatch = uname.match(
      /Windows\s+(?:Server\s+)?(\d{4}(?:\s+R2)?|\d+(?:\.\d+)*)/i,
    )
    return { os: 'WINDOWS', version: versionMatch?.[1] ?? 'unknown' }
  }

  // AIX detection
  if (upper.includes('AIX')) {
    const versionMatch = uname.match(/AIX\s+\S+\s+(\d+\s+\d+)/i)
    const version = versionMatch ? versionMatch[1]!.replace(/\s+/, '.') : 'unknown'
    return { os: 'AIX', version }
  }

  // RHEL / CentOS / Rocky / AlmaLinux detection
  if (
    upper.includes('RED HAT') ||
    upper.includes('RHEL') ||
    upper.includes('CENTOS') ||
    upper.includes('ROCKY') ||
    upper.includes('ALMALINUX')
  ) {
    const versionMatch = uname.match(
      /(?:Red Hat|RHEL|CentOS|Rocky|AlmaLinux)\s*(?:Linux)?\s*(?:release\s+)?(\d+(?:\.\d+)*)/i,
    )
    return { os: 'LINUX_RHEL', version: versionMatch?.[1] ?? extractLinuxKernelVersion(uname) }
  }

  // Ubuntu detection
  if (upper.includes('UBUNTU')) {
    const versionMatch = uname.match(/Ubuntu\s+(\d+(?:\.\d+)*)/i)
    return { os: 'LINUX_UBUNTU', version: versionMatch?.[1] ?? extractLinuxKernelVersion(uname) }
  }

  // Debian detection
  if (upper.includes('DEBIAN')) {
    const versionMatch = uname.match(/Debian\s+(?:GNU\/Linux\s+)?(\d+(?:\.\d+)*)/i)
    return { os: 'LINUX_DEBIAN', version: versionMatch?.[1] ?? extractLinuxKernelVersion(uname) }
  }

  // SUSE / SLES detection
  if (upper.includes('SUSE') || upper.includes('SLES')) {
    const versionMatch = uname.match(/(?:SUSE|SLES)\s*(?:Linux)?\s*(?:Enterprise\s*Server\s*)?(\d+(?:\.\d+)*)/i)
    return { os: 'LINUX_SUSE', version: versionMatch?.[1] ?? extractLinuxKernelVersion(uname) }
  }

  // Fallback: try kernel version from generic Linux uname
  if (upper.includes('LINUX')) {
    return { os: 'OTHER', version: extractLinuxKernelVersion(uname) }
  }

  return { os: 'OTHER', version: 'unknown' }
}

/**
 * Extracts the Linux kernel version from a uname -a style string.
 */
function extractLinuxKernelVersion(uname: string): string {
  const match = uname.match(/(\d+\.\d+\.\d+[\w.-]*)/)
  return match?.[1] ?? 'unknown'
}

/**
 * Detects OS by calling Zabbix API to get system.uname from the host.
 * Returns null if agent is unreachable (items have no value yet).
 *
 * @param zabbixService - ZabbixApiService instance for the target Zabbix server
 * @param hostId - Zabbix host ID to query items from
 * @returns Detection result or null if agent is not reachable
 */
export async function detectOs(
  zabbixService: ZabbixApiService,
  hostId: string,
): Promise<OsDetectionResult | null> {
  const unameValue = await zabbixService.getItemCurrentValue(hostId, 'system.uname')

  if (!unameValue) {
    return null
  }

  const { os, version } = parseOsFromUname(unameValue)

  // Try to get agent version separately
  let agentVersion = 'unknown'
  try {
    const agentVersionValue = await zabbixService.getItemCurrentValue(hostId, 'agent.version')
    if (agentVersionValue) {
      agentVersion = agentVersionValue
    }
  } catch {
    // agent.version item may not exist — non-fatal
  }

  return { os, version, agentVersion }
}
