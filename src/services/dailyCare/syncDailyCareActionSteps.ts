import { prisma } from '../../lib/prisma.js'

/** Ensures each daily exercise has instances for all active template movements. */
export async function syncDailyCareActionSteps(dailyCareLogId: string) {
  const dailyActions = await prisma.dailyCareAction.findMany({
    where: { dailyCareLogId },
    include: {
      careAction: {
        include: {
          steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } }
        }
      },
      steps: { select: { careActionStepId: true } }
    }
  })

  for (const dailyAction of dailyActions) {
    const existingStepIds = new Set(dailyAction.steps.map(s => s.careActionStepId))
    const toCreate = dailyAction.careAction.steps.filter(s => !existingStepIds.has(s.id))
    if (toCreate.length === 0) continue

    await prisma.dailyCareActionStep.createMany({
      data: toCreate.map(step => ({
        dailyCareActionId: dailyAction.id,
        careActionStepId: step.id,
        nameSnapshot: step.name,
        targetReps: step.targetReps,
        targetDurationSeconds: step.targetDurationSeconds,
        status: 'PENDING' as const
      }))
    })
  }
}
