import type { ZabbixTrigger } from '../../integrations/zabbix/zabbix-types.js'

export interface AlertContext {
  tenantCreatedAt: Date
  triggerHistory: AlertHistoryEntry[]
  serviceImportance: number // 0-1, default 0.5
}

export interface AlertHistoryEntry {
  triggerId: string
  firedAt: Date
  resolved: boolean
}

export interface NoisyTrigger {
  triggerId: string
  description: string
  fireCount: number
  avgResolutionMinutes: number
  suggestion: string
}

/** Number of days in the cold-start period. */
const COLD_START_DAYS = 14

/** Rolling window for noisy trigger detection. */
const NOISY_WINDOW_DAYS = 7

/** Default threshold for noisy trigger detection. */
const DEFAULT_NOISY_THRESHOLD = 10

/**
 * Calculates relevance scores for alerts and identifies noisy triggers.
 * Scoring formula:
 *   Severity (40%) + Service importance (30%) + Historical frequency inverse (30%)
 * During cold-start (first 14 days), only severity is used.
 */
export class ScoringEngine {
  /**
   * Calculates a relevance score for an alert (0-100).
   *
   * @param alert - Zabbix trigger with priority (0-5)
   * @param context - Scoring context including history and importance
   * @returns Score from 0 to 100
   */
  score(alert: ZabbixTrigger, context: AlertContext): number {
    const priority = parseInt(alert.priority, 10) || 0

    // Cold start: severity-only scoring (normalized to 0-100)
    if (this.isColdStart(context.tenantCreatedAt)) {
      return Math.min(100, Math.round((priority / 5) * 100))
    }

    // Severity component (40%): priority 0→0, 1→20, 2→40, 3→60, 4→80, 5→100
    const severityScore = Math.min(100, priority * 20)
    const severityComponent = severityScore * 0.4

    // Service importance component (30%)
    const importance = Math.max(0, Math.min(1, context.serviceImportance))
    const importanceComponent = importance * 100 * 0.3

    // Historical frequency inverse (30%)
    // More frequent firing = likely noise = lower score
    const now = new Date()
    const windowStart = new Date(now.getTime() - NOISY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const fireCountLast7Days = context.triggerHistory.filter(
      (h) => h.triggerId === alert.triggerid && h.firedAt >= windowStart,
    ).length
    const inverseFrequency = Math.max(0, 100 - fireCountLast7Days * 10)
    const frequencyComponent = inverseFrequency * 0.3

    return Math.min(100, Math.round(severityComponent + importanceComponent + frequencyComponent))
  }

  /**
   * Identifies triggers with high false-positive rates.
   * Examines triggers firing more than `threshold` times in a rolling 7-day window.
   *
   * @param history - Full alert history entries
   * @param threshold - Minimum fire count to flag as noisy (default 10)
   * @returns Array of noisy triggers with suggestions
   */
  findNoisyTriggers(history: AlertHistoryEntry[], threshold = DEFAULT_NOISY_THRESHOLD): NoisyTrigger[] {
    const now = new Date()
    const windowStart = new Date(now.getTime() - NOISY_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    // Filter to recent history
    const recent = history.filter((h) => h.firedAt >= windowStart)

    // Group by triggerId
    const groups = new Map<string, AlertHistoryEntry[]>()
    for (const entry of recent) {
      const existing = groups.get(entry.triggerId) ?? []
      existing.push(entry)
      groups.set(entry.triggerId, existing)
    }

    const noisy: NoisyTrigger[] = []
    for (const [triggerId, entries] of groups) {
      if (entries.length < threshold) continue

      // Calculate average resolution time for resolved entries
      const resolved = entries.filter((e) => e.resolved)
      let avgResolutionMinutes = 0
      if (resolved.length > 0) {
        // Estimate: assume each resolved entry took proportional time
        // For a real impl, we'd need resolution timestamps. Use 0 as fallback.
        avgResolutionMinutes = 0
      }

      const suggestion = this.buildSuggestion(entries.length, resolved.length, entries.length)

      noisy.push({
        triggerId,
        description: `Trigger ${triggerId}`,
        fireCount: entries.length,
        avgResolutionMinutes,
        suggestion,
      })
    }

    // Sort by fire count descending
    return noisy.sort((a, b) => b.fireCount - a.fireCount)
  }

  /**
   * Checks whether the tenant is in cold-start period (< 14 days old).
   *
   * @param tenantCreatedAt - Tenant creation date
   * @returns true if within cold-start period
   */
  isColdStart(tenantCreatedAt: Date): boolean {
    const now = new Date()
    const diffMs = now.getTime() - tenantCreatedAt.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays < COLD_START_DAYS
  }

  /**
   * Builds a human-readable suggestion for a noisy trigger.
   */
  private buildSuggestion(
    fireCount: number,
    resolvedCount: number,
    totalCount: number,
  ): string {
    const autoResolveRate = totalCount > 0 ? resolvedCount / totalCount : 0

    if (autoResolveRate > 0.8) {
      return `This trigger fires ${fireCount} times/week and auto-resolves ${Math.round(autoResolveRate * 100)}% of the time. Consider increasing the trigger threshold or adding a recovery delay to reduce noise.`
    }

    if (fireCount > 50) {
      return `This trigger fires excessively (${fireCount} times/week). Review the trigger expression — the threshold may be too sensitive for this environment.`
    }

    return `This trigger fires ${fireCount} times/week. Consider adjusting the trigger threshold or adding hysteresis to reduce false positives.`
  }
}
