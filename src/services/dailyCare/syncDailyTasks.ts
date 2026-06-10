import { prisma } from '../../lib/prisma.js'
import { actionAppliesOnDate } from './actionAppliesOnDate.js'

/** Syncs flat DailyTask rows from the active care plan for a given daily log. */
export async function syncDailyTasks(dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    select: { dogId: true, date: true }
  })

  const plan = await prisma.carePlan.findFirst({
    where: { dogId: log.dogId, isActive: true },
    include: {
      actions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } }
    }
  })

  if (!plan) return

  const applicable = plan.actions.filter(a =>
    actionAppliesOnDate(a.frequency, plan.createdAt, log.date)
  )

  const existing = await prisma.dailyTask.findMany({
    where: { dailyCareLogId, source: 'PLAN' },
    select: { careActionId: true }
  })
  const existingActionIds = new Set(
    existing.map(t => t.careActionId).filter((id): id is string => id !== null)
  )

  const toCreate = applicable
    .filter(action => !existingActionIds.has(action.id))
    .map(action => ({
      dailyCareLogId,
      bucket: action.bucket,
      source: 'PLAN' as const,
      nameSnapshot: action.name,
      descriptionSnapshot: action.description,
      instructionsSnapshot: action.instructions,
      targetReps: action.targetReps,
      targetDurationSeconds: action.targetDurationSeconds,
      careActionId: action.id,
      sortOrder: action.sortOrder,
      status: 'PENDING' as const
    }))

  if (toCreate.length > 0) {
    await prisma.dailyTask.createMany({ data: toCreate })
  }
}
