import type { DailyCareActionStatus } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
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
