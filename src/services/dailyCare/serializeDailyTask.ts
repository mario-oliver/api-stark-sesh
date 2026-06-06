import { prisma } from '../../lib/prisma.js'
import { getPresignedCareStepMediaViewUrl } from '../s3/careStepMedia.js'
import { userSelect } from './serializeDailyCare.js'

export type DailyTaskWithRelations = {
  id: string
  dailyCareLogId: string
  bucket: string
  source: string
  nameSnapshot: string
  descriptionSnapshot: string | null
  instructionsSnapshot: string | null
  status: string
  completedAt: Date | null
  completedByUserId: string | null
  notes: string | null
  targetReps: number | null
  actualReps: number | null
  targetDurationSeconds: number | null
  actualDurationSeconds: number | null
  careActionId: string | null
  careActionStepId: string | null
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
  substitutedFor: {
    id: string
    nameSnapshot: string
  } | null
  careActionStep?: {
    mediaKey: string | null
    mediaContentType: string | null
  } | null
}

export async function serializeDailyTask(task: DailyTaskWithRelations) {
  const mediaUrl = task.careActionStep?.mediaKey
    ? await getPresignedCareStepMediaViewUrl(task.careActionStep.mediaKey)
    : null

  return {
    id: task.id,
    dailyCareLogId: task.dailyCareLogId,
    bucket: task.bucket,
    source: task.source,
    nameSnapshot: task.nameSnapshot,
    descriptionSnapshot: task.descriptionSnapshot,
    instructionsSnapshot: task.instructionsSnapshot,
    status: task.status,
    completedAt: task.completedAt?.toISOString() ?? null,
    completedByUserId: task.completedByUserId,
    notes: task.notes,
    targetReps: task.targetReps,
    actualReps: task.actualReps,
    targetDurationSeconds: task.targetDurationSeconds,
    actualDurationSeconds: task.actualDurationSeconds,
    careActionId: task.careActionId,
    careActionStepId: task.careActionStepId,
    substitutedForTaskId: task.substitutedForTaskId,
    substitutedFor: task.substitutedFor,
    metadata: task.metadata,
    extractionConfidence: task.extractionConfidence,
    needsReview: task.needsReview,
    sortOrder: task.sortOrder,
    mediaKey: task.careActionStep?.mediaKey ?? null,
    mediaContentType: task.careActionStep?.mediaContentType ?? null,
    mediaUrl,
    completedBy: task.completedBy,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  }
}

export const dailyTaskInclude = {
  completedBy: { select: userSelect },
  substitutedFor: { select: { id: true, nameSnapshot: true } },
  careActionStep: { select: { mediaKey: true, mediaContentType: true } }
} as const

export function bucketProgress(tasks: { status: string }[]) {
  const completed = tasks.filter(t => t.status === 'COMPLETED').length
  return { completed, total: tasks.length }
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
