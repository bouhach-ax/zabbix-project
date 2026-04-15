import type { ZabbixApiService } from '../../integrations/zabbix/ZabbixApiService.js'
import { analyzeError } from './error-analyzer.js'
import type { ErrorAnalysis } from './error-analyzer.js'

/**
 * Result of testing a system.run command on a Zabbix host.
 */
export interface CommandTestResult {
  success: boolean
  output: string | null
  error: string | null
  executionTimeMs: number
  analysis?: ErrorAnalysis
}

/**
 * Tests a system.run command on a Zabbix host via the Zabbix API.
 *
 * Uses zabbixService.getItemCurrentValue to execute `system.run[<command>]`
 * on the target host and returns the result with timing information.
 *
 * @param zabbixService - Authenticated ZabbixApiService instance
 * @param hostId - Zabbix host ID to test the command on
 * @param command - Shell command to execute (without system.run[] wrapper)
 * @returns Test result with output or error analysis
 */
export async function testCommand(
  zabbixService: ZabbixApiService,
  hostId: string,
  command: string,
): Promise<CommandTestResult> {
  const startTime = Date.now()

  try {
    const output = await zabbixService.getItemCurrentValue(
      hostId,
      `system.run[${command}]`,
    )

    const executionTimeMs = Date.now() - startTime

    if (output === null) {
      return {
        success: false,
        output: null,
        error: 'No value returned — item may not exist or agent did not respond',
        executionTimeMs,
        analysis: analyzeError('No value returned'),
      }
    }

    return {
      success: true,
      output,
      error: null,
      executionTimeMs,
    }
  } catch (err) {
    const executionTimeMs = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)

    return {
      success: false,
      output: null,
      error: errorMessage,
      executionTimeMs,
      analysis: analyzeError(errorMessage),
    }
  }
}
