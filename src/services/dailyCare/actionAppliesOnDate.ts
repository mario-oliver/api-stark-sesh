import type { CareActionFrequency, CareActionTier } from '../../generated/client.js'
import { daysBetweenUtc } from './dateUtils.js'

/**
 * Whether a plan CareAction auto-instantiates into Today for a given date.
 *
 * Instantiation is a Tier rule (ADR-0005 / context.md#Tier): only `ROUTINE`
 * auto-instantiates (per its frequency — ROM genuinely is daily). `CORE`,
 * `ON_WALKS`, and `AS_NEEDED` are instantiate-on-do — their DailyCareAction row
 * is written on first interaction (the create-on-do endpoint), never
 * pre-created. `frequency` on those tiers is display metadata only.
 *
 * A `null` tier predates the concept (legacy plans) — it keeps the pre-0005
 * behavior of following the frequency rules.
 */
export function actionAppliesOnDate(
  frequency: CareActionFrequency,
  tier: CareActionTier | null,
  planCreatedAt: Date,
  logDate: Date
): boolean {
  // Tier rule: non-ROUTINE tiers never auto-instantiate, regardless of frequency.
  if (tier === 'CORE' || tier === 'ON_WALKS' || tier === 'AS_NEEDED') {
    return false
  }

  switch (frequency) {
    case 'DAILY':
      return true
    case 'EVERY_OTHER_DAY': {
      const dayIndex = daysBetweenUtc(planCreatedAt, logDate)
      return dayIndex % 2 === 0
    }
    case 'WEEKLY':
      return daysBetweenUtc(planCreatedAt, logDate) % 7 === 0
    case 'AS_NEEDED':
      // context.md#instantiation: AS_NEEDED actions are never auto-instantiated
      // into Today — they are logged only when actually done.
      return false
    default:
      return true
  }
}

export function countApplicableActions(
  actions: Array<{ frequency: CareActionFrequency; tier: CareActionTier | null }>,
  planCreatedAt: Date,
  logDate: Date
): number {
  return actions.filter(a =>
    actionAppliesOnDate(a.frequency, a.tier ?? null, planCreatedAt, logDate)
  ).length
}
