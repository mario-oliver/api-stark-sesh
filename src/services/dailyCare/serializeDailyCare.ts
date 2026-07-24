const userSelect = { id: true, email: true, firstName: true, lastName: true } as const

/**
 * Tier + Vicky dosage fields (issue 0020). Daily rows read these from the
 * LINKED CareAction via the relation join — DailyCareAction carries no snapshot
 * of them (PRD: DailyCareAction unchanged). Ad-hoc rows have no linked action,
 * so every field serializes null.
 */
export const careActionTierDosageSelect = {
  tier: true,
  daysPerWeek: true,
  targetHoldSeconds: true,
  targetSets: true,
  restBetweenSetsSeconds: true,
  referenceUrl: true
} as const

export type CareActionTierDosage = {
  tier: string | null
  daysPerWeek: number | null
  targetHoldSeconds: number | null
  targetSets: number | null
  restBetweenSetsSeconds: number | null
  referenceUrl: string | null
}

export function tierDosageFromCareAction(
  careAction: Partial<CareActionTierDosage> | null | undefined
): CareActionTierDosage {
  return {
    tier: careAction?.tier ?? null,
    daysPerWeek: careAction?.daysPerWeek ?? null,
    targetHoldSeconds: careAction?.targetHoldSeconds ?? null,
    targetSets: careAction?.targetSets ?? null,
    restBetweenSetsSeconds: careAction?.restBetweenSetsSeconds ?? null,
    referenceUrl: careAction?.referenceUrl ?? null
  }
}

export type DailyCareActionWithRelations = {
  id: string
  dailyCareLogId: string
  careActionId: string | null
  bucket: string
  source: string
  nameSnapshot: string
  descriptionSnapshot: string | null
  instructionsSnapshot: string | null
  status: string
  completedAt: Date | null
  completedByUserId: string | null
  notes: string | null
  tolerance: string | null
  targetReps: number | null
  actualReps: number | null
  targetDurationSeconds: number | null
  actualDurationSeconds: number | null
  substitutedForTaskId: string | null
  metadata: unknown
  extractionConfidence: number | null
  needsReview: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  completedBy: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  } | null
  substitutedFor?: {
    id: string
    nameSnapshot: string
  } | null
  careAction?: ({
    targetReps: number | null
    targetDurationSeconds: number | null
  } & Partial<CareActionTierDosage>) | null
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
    bucket: action.bucket,
    source: action.source,
    nameSnapshot: action.nameSnapshot,
    descriptionSnapshot: action.descriptionSnapshot,
    instructionsSnapshot: action.instructionsSnapshot,
    status: action.status,
    completedAt: action.completedAt?.toISOString() ?? null,
    completedByUserId: action.completedByUserId,
    notes: action.notes,
    tolerance: action.tolerance,
    targetReps: resolveTargetReps(action.targetReps, action.careAction?.targetReps),
    actualReps: action.actualReps,
    targetDurationSeconds: resolveTargetDuration(
      action.targetDurationSeconds,
      action.careAction?.targetDurationSeconds
    ),
    actualDurationSeconds: action.actualDurationSeconds,
    // Tier + dosage come from the linked CareAction (join), null for ad-hoc rows.
    ...tierDosageFromCareAction(action.careAction),
    substitutedForTaskId: action.substitutedForTaskId,
    substitutedFor: action.substitutedFor ?? null,
    metadata: action.metadata,
    extractionConfidence: action.extractionConfidence,
    needsReview: action.needsReview,
    sortOrder: action.sortOrder,
    completedBy: action.completedBy,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString()
  }
}

/** Completion progress over a set of daily care actions (e.g. one bucket). */
export function bucketProgress(items: { status: string }[]) {
  const completed = items.filter(t => t.status === 'COMPLETED').length
  return { completed, total: items.length }
}

export function serializeObservation(obs: {
  id: string
  dogId: string
  dailyCareLogId: string
  userId: string
  voiceNoteId: string | null
  bucket: string | null
  type: string
  severity: string | null
  bodyArea: string | null
  note: string
  observedAt: Date | null
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  }
}) {
  return {
    id: obs.id,
    dogId: obs.dogId,
    dailyCareLogId: obs.dailyCareLogId,
    userId: obs.userId,
    voiceNoteId: obs.voiceNoteId,
    bucket: obs.bucket,
    type: obs.type,
    severity: obs.severity,
    bodyArea: obs.bodyArea,
    note: obs.note,
    observedAt: obs.observedAt?.toISOString() ?? null,
    createdAt: obs.createdAt.toISOString(),
    updatedAt: obs.updatedAt.toISOString(),
    user: obs.user
  }
}

export type BucketScore = {
  score: number
  label: string
  summary: string
  reasons: string[]
  signals?: string[]
  computedAt: string
}

export function parseBucketScores(raw: unknown): {
  activity?: BucketScore
  mobility?: BucketScore
  recovery?: BucketScore
} | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as {
    activity?: BucketScore
    mobility?: BucketScore
    recovery?: BucketScore
  }
}

export { userSelect }
