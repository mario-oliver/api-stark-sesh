import { getPresignedCareStepMediaViewUrl } from '../s3/careStepMedia.js'

const userSelect = { id: true, email: true, firstName: true, lastName: true } as const

export type DailyCareActionWithRelations = {
  id: string
  dailyCareLogId: string
  careActionId: string
  nameSnapshot: string
  categorySnapshot: string
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
  steps: Array<{
    id: string
    dailyCareActionId: string
    careActionStepId: string
    nameSnapshot: string
    targetReps: number | null
    targetDurationSeconds: number | null
    status: string
    completedAt: Date | null
    completedByUserId: string | null
    notes: string | null
    completedBy: {
      id: string
      email: string
      firstName: string | null
      lastName: string | null
    } | null
    careActionStep: {
      description: string | null
      instructions: string | null
      targetReps: number | null
      targetDurationSeconds: number | null
      mediaKey: string | null
      mediaContentType: string | null
    }
  }>
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

export async function serializeDailyCareActionStep(
  step: DailyCareActionWithRelations['steps'][number]
) {
  const mediaUrl = await getPresignedCareStepMediaViewUrl(step.careActionStep.mediaKey)
  return {
    id: step.id,
    dailyCareActionId: step.dailyCareActionId,
    careActionStepId: step.careActionStepId,
    nameSnapshot: step.nameSnapshot,
    description: step.careActionStep.description,
    instructions: step.careActionStep.instructions,
    targetReps: resolveTargetReps(step.targetReps, step.careActionStep.targetReps),
    targetDurationSeconds: resolveTargetDuration(
      step.targetDurationSeconds,
      step.careActionStep.targetDurationSeconds
    ),
    mediaKey: step.careActionStep.mediaKey,
    mediaContentType: step.careActionStep.mediaContentType,
    mediaUrl,
    status: step.status,
    completedAt: step.completedAt?.toISOString() ?? null,
    completedByUserId: step.completedByUserId,
    notes: step.notes,
    completedBy: step.completedBy
  }
}

export async function serializeDailyCareAction(action: DailyCareActionWithRelations) {
  const steps = await Promise.all(action.steps.map(serializeDailyCareActionStep))
  const completedSteps = steps.filter(s => s.status === 'COMPLETED').length
  return {
    id: action.id,
    dailyCareLogId: action.dailyCareLogId,
    careActionId: action.careActionId,
    nameSnapshot: action.nameSnapshot,
    categorySnapshot: action.categorySnapshot,
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
    completedBy: action.completedBy,
    steps,
    movementProgress:
      steps.length > 0 ? { completed: completedSteps, total: steps.length } : null
  }
}

export { userSelect }
