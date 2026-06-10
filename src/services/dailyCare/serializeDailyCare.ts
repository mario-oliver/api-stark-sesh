const userSelect = { id: true, email: true, firstName: true, lastName: true } as const

export type DailyCareActionWithRelations = {
  id: string
  dailyCareLogId: string
  careActionId: string
  nameSnapshot: string
  status: string
  completedAt: Date | null
  completedByUserId: string | null
  notes: string | null
  tolerance: string | null
  issueObserved: boolean
  targetReps: number | null
  targetDurationSeconds: number | null
  completedBy: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  } | null
  careAction?: {
    targetReps: number | null
    targetDurationSeconds: number | null
  } | null
}

function resolveTargetReps(
  snapshot: number | null,
  template: number | null | undefined
): number | null {
  return snapshot ?? template ?? null
}

function resolveTargetDuration(
  snapshot: number | null,
  template: number | null | undefined
): number | null {
  return snapshot ?? template ?? null
}

export async function serializeDailyCareAction(action: DailyCareActionWithRelations) {
  return {
    id: action.id,
    dailyCareLogId: action.dailyCareLogId,
    careActionId: action.careActionId,
    nameSnapshot: action.nameSnapshot,
    status: action.status,
    completedAt: action.completedAt?.toISOString() ?? null,
    completedByUserId: action.completedByUserId,
    notes: action.notes,
    tolerance: action.tolerance,
    issueObserved: action.issueObserved,
    targetReps: resolveTargetReps(action.targetReps, action.careAction?.targetReps),
    targetDurationSeconds: resolveTargetDuration(
      action.targetDurationSeconds,
      action.careAction?.targetDurationSeconds
    ),
    completedBy: action.completedBy
  }
}

export { userSelect }
