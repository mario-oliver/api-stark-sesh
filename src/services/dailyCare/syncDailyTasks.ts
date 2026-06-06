import { prisma } from '../../lib/prisma.js'
import { actionAppliesOnDate } from './actionAppliesOnDate.js'
import { categoryToBucket } from '../carePlans/categoryToBucket.js'

type PlanStep = {
  id: string
  name: string
  description: string | null
  instructions: string | null
  bucket: string | null
  targetReps: number | null
  targetDurationSeconds: number | null
  sortOrder: number
}

type PlanAction = {
  id: string
  name: string
  description: string | null
  instructions: string | null
  category: string
  bucket: string | null
  targetReps: number | null
  targetDurationSeconds: number | null
  sortOrder: number
  steps: PlanStep[]
}

/** Syncs flat DailyTask rows from the active care plan for a given daily log. */
export async function syncDailyTasks(dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    select: { dogId: true, date: true }
  })

  const plan = await prisma.carePlan.findFirst({
    where: { dogId: log.dogId, isActive: true },
    include: {
      actions: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } }
        }
      }
    }
  })

  if (!plan) return

  const applicable = plan.actions.filter(a =>
    actionAppliesOnDate(a.frequency, plan.createdAt, log.date)
  ) as PlanAction[]

  const existing = await prisma.dailyTask.findMany({
    where: { dailyCareLogId, source: 'PLAN' },
    select: { id: true, careActionStepId: true, careActionId: true }
  })

  const existingStepIds = new Set(
    existing.filter(t => t.careActionStepId).map(t => t.careActionStepId!)
  )
  const existingActionOnlyIds = new Set(
    existing.filter(t => t.careActionId && !t.careActionStepId).map(t => t.careActionId!)
  )

  const toCreate: Array<{
    dailyCareLogId: string
    bucket: 'ACTIVITY' | 'MOBILITY' | 'RECOVERY'
    source: 'PLAN'
    nameSnapshot: string
    descriptionSnapshot: string | null
    instructionsSnapshot: string | null
    targetReps: number | null
    targetDurationSeconds: number | null
    careActionId: string
    careActionStepId: string | null
    sortOrder: number
    status: 'PENDING'
  }> = []

  for (const action of applicable) {
    const actionBucket = (action.bucket ??
      categoryToBucket(action.category as never)) as 'ACTIVITY' | 'MOBILITY' | 'RECOVERY'

    if (action.steps.length > 0) {
      for (const step of action.steps) {
        if (existingStepIds.has(step.id)) continue
        const bucket = (step.bucket ?? actionBucket) as 'ACTIVITY' | 'MOBILITY' | 'RECOVERY'
        toCreate.push({
          dailyCareLogId,
          bucket,
          source: 'PLAN',
          nameSnapshot: step.name,
          descriptionSnapshot: step.description,
          instructionsSnapshot: step.instructions,
          targetReps: step.targetReps,
          targetDurationSeconds: step.targetDurationSeconds,
          careActionId: action.id,
          careActionStepId: step.id,
          sortOrder: step.sortOrder,
          status: 'PENDING'
        })
      }
    } else if (!existingActionOnlyIds.has(action.id)) {
      toCreate.push({
        dailyCareLogId,
        bucket: actionBucket,
        source: 'PLAN',
        nameSnapshot: action.name,
        descriptionSnapshot: action.description,
        instructionsSnapshot: action.instructions,
        targetReps: action.targetReps,
        targetDurationSeconds: action.targetDurationSeconds,
        careActionId: action.id,
        careActionStepId: null,
        sortOrder: action.sortOrder,
        status: 'PENDING'
      })
    }
  }

  if (toCreate.length > 0) {
    await prisma.dailyTask.createMany({ data: toCreate })
  }
}
