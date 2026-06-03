import type { CareActionFrequency } from '../../generated/client.js'
import { daysBetweenUtc } from './dateUtils.js'

export function actionAppliesOnDate(
  frequency: CareActionFrequency,
  planCreatedAt: Date,
  logDate: Date
): boolean {
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
      return true
    default:
      return true
  }
}

export function countApplicableActions(
  actions: Array<{ frequency: CareActionFrequency }>,
  planCreatedAt: Date,
  logDate: Date
): number {
  return actions.filter(a => actionAppliesOnDate(a.frequency, planCreatedAt, logDate)).length
}
