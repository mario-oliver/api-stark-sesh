import type { DailyTaskStatus } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import {
  dailyTaskInclude,
  serializeDailyTask,
  type DailyTaskWithRelations
} from './serializeDailyTask.js'

export async function updateDailyTask(
  taskId: string,
  dogId: string,
  userId: string,
  body: {
    status?: DailyTaskStatus
    notes?: string
    actualReps?: number | null
    actualDurationSeconds?: number | null
    needsReview?: boolean
  }
) {
  const task = await prisma.dailyTask.findFirst({
    where: { id: taskId, dailyCareLog: { dogId } }
  })
  if (!task) return null

  const status = body.status ?? task.status
  const now = new Date()
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: {
      status,
      notes: body.notes !== undefined ? body.notes : task.notes,
      actualReps: body.actualReps !== undefined ? body.actualReps : task.actualReps,
      actualDurationSeconds:
        body.actualDurationSeconds !== undefined
          ? body.actualDurationSeconds
          : task.actualDurationSeconds,
      needsReview: body.needsReview !== undefined ? body.needsReview : task.needsReview,
      completedAt: isComplete ? now : status === 'SKIPPED' ? null : task.completedAt,
      completedByUserId: isComplete ? userId : status === 'PENDING' ? null : task.completedByUserId
    },
    include: dailyTaskInclude
  })

  return {
    task: await serializeDailyTask(updated as DailyTaskWithRelations),
    dailyCareLogId: task.dailyCareLogId
  }
}

export async function createAdHocDailyTask(
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

  const task = await prisma.dailyTask.create({
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
    include: dailyTaskInclude
  })

  return serializeDailyTask(task as DailyTaskWithRelations)
}

export async function reviewDailyTask(
  taskId: string,
  dogId: string,
  userId: string,
  body: { accept: boolean; status?: DailyTaskStatus }
) {
  const task = await prisma.dailyTask.findFirst({
    where: { id: taskId, dailyCareLog: { dogId } }
  })
  if (!task) return null

  if (!body.accept) {
    await prisma.dailyTask.delete({ where: { id: taskId } })
    return { deleted: true, dailyCareLogId: task.dailyCareLogId }
  }

  const status = body.status ?? task.status
  const now = new Date()
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

  const updated = await prisma.dailyTask.update({
    where: { id: taskId },
    data: {
      needsReview: false,
      status,
      completedAt: isComplete ? now : task.completedAt,
      completedByUserId: isComplete ? userId : task.completedByUserId
    },
    include: dailyTaskInclude
  })

  return {
    task: await serializeDailyTask(updated as DailyTaskWithRelations),
    dailyCareLogId: task.dailyCareLogId
  }
}
