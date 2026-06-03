import type { DailyCareActionStatus } from '../../generated/client.js'

type StepStatus = { status: DailyCareActionStatus }

export function deriveExerciseStatusFromSteps(steps: StepStatus[]): DailyCareActionStatus | null {
  if (steps.length === 0) {
    return null
  }

  const statuses = steps.map(s => s.status)
  const allCompleted = statuses.every(s => s === 'COMPLETED')
  const allSkipped = statuses.every(s => s === 'SKIPPED')
  const anyCompleted = statuses.some(s => s === 'COMPLETED')
  const anyPartial = statuses.some(s => s === 'PARTIALLY_COMPLETED')

  if (allCompleted) return 'COMPLETED'
  if (allSkipped) return 'SKIPPED'
  if (anyCompleted || anyPartial) return 'PARTIALLY_COMPLETED'
  if (statuses.every(s => s === 'UNCLEAR')) return 'UNCLEAR'
  return 'PENDING'
}
