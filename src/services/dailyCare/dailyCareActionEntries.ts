import type { DailyCareActionStatus, Tolerance } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { parseCalendarDate } from './dateUtils.js'
import {
  careActionTierDosageSelect,
  serializeDailyCareAction,
  type DailyCareActionWithRelations
} from './serializeDailyCare.js'

const entryInclude = {
  completedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
  substitutedFor: { select: { id: true, nameSnapshot: true } },
  careAction: {
    select: { targetReps: true, targetDurationSeconds: true, ...careActionTierDosageSelect }
  }
} as const

/** Logs actuals / status / review state on an existing daily care action. */
export async function updateDailyCareActionEntry(
  actionId: string,
  dogId: string,
  userId: string,
  body: {
    status?: DailyCareActionStatus
    notes?: string
    actualReps?: number | null
    actualDurationSeconds?: number | null
    needsReview?: boolean
  }
) {
  const action = await prisma.dailyCareAction.findFirst({
    where: { id: actionId, dailyCareLog: { dogId } }
  })
  if (!action) return null

  const status = body.status ?? action.status
  const now = new Date()
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

  const updated = await prisma.dailyCareAction.update({
    where: { id: actionId },
    data: {
      status,
      notes: body.notes !== undefined ? body.notes : action.notes,
      actualReps: body.actualReps !== undefined ? body.actualReps : action.actualReps,
      actualDurationSeconds:
        body.actualDurationSeconds !== undefined
          ? body.actualDurationSeconds
          : action.actualDurationSeconds,
      needsReview: body.needsReview !== undefined ? body.needsReview : action.needsReview,
      completedAt: isComplete ? now : status === 'SKIPPED' ? null : action.completedAt,
      completedByUserId:
        isComplete ? userId : status === 'PENDING' ? null : action.completedByUserId
    },
    include: entryInclude
  })

  return {
    action: await serializeDailyCareAction(updated as DailyCareActionWithRelations),
    dailyCareLogId: action.dailyCareLogId
  }
}

/** Creates an ad-hoc (off-plan) daily care action for a given log/date. */
export async function createAdHocDailyCareAction(
  dogId: string,
  body: {
    dailyCareLogId?: string
    date?: string
    bucket: 'ACTIVITY' | 'MOBILITY' | 'RECOVERY'
    name: string
    description?: string | null
    notes?: string | null
    targetReps?: number | null
    targetDurationSeconds?: number | null
  }
) {
  let logId = body.dailyCareLogId
  if (!logId && body.date) {
    const log = await prisma.dailyCareLog.findFirst({
      where: { dogId, date: new Date(body.date + 'T00:00:00.000Z') }
    })
    logId = log?.id
  }
  if (!logId) return null

  const action = await prisma.dailyCareAction.create({
    data: {
      dailyCareLogId: logId,
      bucket: body.bucket,
      source: 'AD_HOC',
      nameSnapshot: body.name,
      descriptionSnapshot: body.description ?? null,
      notes: body.notes ?? null,
      targetReps: body.targetReps ?? null,
      targetDurationSeconds: body.targetDurationSeconds ?? null,
      status: 'PENDING'
    },
    include: entryInclude
  })

  return serializeDailyCareAction(action as DailyCareActionWithRelations)
}

/**
 * Create-on-do write path (ADR-0005 / PRD §Contract, frozen). Instantiates a
 * DailyCareAction for an active-plan CareAction on a given date — the deliberate
 * counterpart to ROUTINE auto-instantiation. Snapshots name / description /
 * instructions from the CareAction, `source: PLAN`, creating the day's
 * DailyCareLog if missing. Returns `null` (→ 404) when the careActionId is not
 * on the dog's active plan. Always creates a fresh row (no upsert): repeat ROM
 * is legitimate; clients that want update-not-duplicate PATCH the existing row.
 */
export async function createPlannedDailyCareAction(
  dogId: string,
  userId: string,
  body: {
    date: string
    careActionId: string
    status?: DailyCareActionStatus
    tolerance?: Tolerance | null
    actualReps?: number | null
    actualSets?: number | null
    actualDurationSeconds?: number | null
    notes?: string
  }
) {
  const logDate = parseCalendarDate(body.date)
  if (!logDate) return null

  // The CareAction must live on the dog's active plan (else 404).
  const careAction = await prisma.careAction.findFirst({
    where: {
      id: body.careActionId,
      isActive: true,
      carePlan: { dogId, isActive: true }
    }
  })
  if (!careAction) return null

  let log = await prisma.dailyCareLog.findUnique({
    where: { dogId_date: { dogId, date: logDate } }
  })
  if (!log) {
    log = await prisma.dailyCareLog.create({ data: { dogId, date: logDate } })
  }

  const status = body.status ?? 'PENDING'
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'
  const now = new Date()

  const action = await prisma.dailyCareAction.create({
    data: {
      dailyCareLogId: log.id,
      careActionId: careAction.id,
      bucket: careAction.bucket,
      source: 'PLAN',
      nameSnapshot: careAction.name,
      descriptionSnapshot: careAction.description,
      instructionsSnapshot: careAction.instructions,
      targetReps: careAction.targetReps,
      targetDurationSeconds: careAction.targetDurationSeconds,
      sortOrder: careAction.sortOrder,
      status,
      tolerance: body.tolerance ?? null,
      actualReps: body.actualReps ?? null,
      actualDurationSeconds: body.actualDurationSeconds ?? null,
      // DailyCareAction has no actualSets column; carry it in metadata (lossless)
      // so nothing the client submits is dropped.
      metadata: body.actualSets != null ? { actualSets: body.actualSets } : undefined,
      notes: body.notes ?? null,
      completedAt: isComplete ? now : null,
      completedByUserId: isComplete ? userId : null
    },
    include: entryInclude
  })

  return serializeDailyCareAction(action as DailyCareActionWithRelations)
}

/** Accepts or rejects a needs-review (voice-extracted) daily care action. */
export async function reviewDailyCareAction(
  actionId: string,
  dogId: string,
  userId: string,
  body: { accept: boolean; status?: DailyCareActionStatus }
) {
  const action = await prisma.dailyCareAction.findFirst({
    where: { id: actionId, dailyCareLog: { dogId } }
  })
  if (!action) return null

  if (!body.accept) {
    await prisma.dailyCareAction.delete({ where: { id: actionId } })
    return { deleted: true, dailyCareLogId: action.dailyCareLogId }
  }

  const status = body.status ?? action.status
  const now = new Date()
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

  const updated = await prisma.dailyCareAction.update({
    where: { id: actionId },
    data: {
      needsReview: false,
      status,
      completedAt: isComplete ? now : action.completedAt,
      completedByUserId: isComplete ? userId : action.completedByUserId
    },
    include: entryInclude
  })

  return {
    action: await serializeDailyCareAction(updated as DailyCareActionWithRelations),
    dailyCareLogId: action.dailyCareLogId
  }
}
