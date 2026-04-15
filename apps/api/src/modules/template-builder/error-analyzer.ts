/**
 * Deterministic error pattern matching for Zabbix agent/item errors.
 * NO LLM usage — purely pattern-based analysis.
 */

export interface ErrorAnalysis {
  code: string
  message: string
  suggestion: string
}

/** Known error patterns with their analysis. */
const ERROR_PATTERNS: Array<{
  test: RegExp
  analysis: ErrorAnalysis
}> = [
  {
    test: /unsupported item key/i,
    analysis: {
      code: 'ITEM_KEY_INVALID',
      message: 'Item key not supported',
      suggestion:
        'Check item key syntax and ensure the key exists for this agent type',
    },
  },
  {
    test: /cannot evaluate/i,
    analysis: {
      code: 'EXPRESSION_ERROR',
      message: 'Expression evaluation failed',
      suggestion:
        'Verify trigger expression references correct template host name and existing item keys',
    },
  },
  {
    test: /connection refused/i,
    analysis: {
      code: 'AGENT_UNREACHABLE',
      message: 'Agent connection refused',
      suggestion:
        'Verify agent is running and firewall allows port access',
    },
  },
  {
    test: /timed?\s*out/i,
    analysis: {
      code: 'AGENT_TIMEOUT',
      message: 'Agent timeout',
      suggestion:
        'Agent may be overloaded or network latency is high',
    },
  },
  {
    test: /not supported/i,
    analysis: {
      code: 'NOT_SUPPORTED',
      message: 'Item not supported by agent',
      suggestion:
        'Check agent configuration and AllowKey settings',
    },
  },
  {
    test: /permission denied/i,
    analysis: {
      code: 'PERMISSION_DENIED',
      message: 'Permission denied on the agent',
      suggestion:
        'Check agent AllowKey and DenyKey configuration for the requested command',
    },
  },
  {
    test: /no such file or directory/i,
    analysis: {
      code: 'FILE_NOT_FOUND',
      message: 'File or command not found on the agent host',
      suggestion:
        'Verify the command or file path exists on the target host',
    },
  },
]

/**
 * Analyzes a Zabbix error message and returns a structured diagnosis.
 *
 * @param errorMessage - Raw error message from the Zabbix agent or API
 * @returns Structured analysis with code, message, and suggestion
 */
export function analyzeError(errorMessage: string): ErrorAnalysis {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test.test(errorMessage)) {
      return pattern.analysis
    }
  }

  return {
    code: 'UNKNOWN',
    message: 'Unknown error',
    suggestion: 'Check Zabbix server and agent logs',
  }
}
