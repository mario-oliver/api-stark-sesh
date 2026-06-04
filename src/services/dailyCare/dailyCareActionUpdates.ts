import type { DailyCareActionStatus } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { deriveExerciseStatusFromSteps } from './recomputeDailyCareActionStatus.js'

export async function cascadeExerciseStatus(
  dailyCareActionId: string,
  status: DailyCareActionStatus,
  userId: string,
  extras?: {
    notes?: string
    tolerance?: string | null
    issueObserved?: boolean
  }
) {
  const now = new Date()
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'
  const isSkipped = status === 'SKIPPED'

  const stepStatus: DailyCareActionStatus = isSkipped
    ? 'SKIPPED'
    : status === 'COMPLETED'
      ? 'COMPLETED'
      : status

  await prisma.dailyCareActionStep.updateMany({
    where: { dailyCareActionId },
    data: {
      status: stepStatus,
      completedAt: isComplete ? now : null,
      completedByUserId: isComplete ? userId : null
    }
  })

  return prisma.dailyCareAction.update({
    where: { id: dailyCareActionId },
    data: {
      status,
      completedAt: isComplete ? now : isSkipped ? null : undefined,
      completedByUserId: isComplete ? userId : isSkipped ? null : undefined,
      ...(extras?.notes !== undefined && { notes: extras.notes }),
      ...(extras?.tolerance !== undefined && { tolerance: extras.tolerance as never }),
      ...(extras?.issueObserved !== undefined && { issueObserved: extras.issueObserved })
    },
    include: {
      completedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      careAction: { select: { targetReps: true, targetDurationSeconds: true } },
      steps: {
        orderBy: { createdAt: 'asc' },
        include: {
          completedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          careActionStep: {
            select: {
              description: true,
              instructions: true,
              targetReps: true,
              targetDurationSeconds: true,
              mediaKey: true,
              mediaContentType: true
            }
          }
        }
      }
    }
  })
}

export async function updateDailyCareActionStepAndRollup(
  stepId: string,
  dogId: string,
  userId: string,
  body: {
    status?: DailyCareActionStatus
    notes?: string
  }
) {
  const step = await prisma.dailyCareActionStep.findFirst({
    where: {
      id: stepId,
      dailyCareAction: { dailyCareLog: { dogId } }
    },
    include: { dailyCareAction: { include: { steps: true } } }
  })
  if (!step) {
    return null
  }

  const now = new Date()
  const status = body.status ?? step.status
  const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

  await prisma.dailyCareActionStep.update({
    where: { id: stepId },
    data: {
      status,
      notes: body.notes !== undefined ? body.notes : step.notes,
      completedAt: isComplete ? now : status === 'SKIPPED' ? null : step.completedAt,
      completedByUserId: isComplete ? userId : step.completedByUserId
    }
  })

  const refreshedSteps = await prisma.dailyCareActionStep.findMany({
    where: { dailyCareActionId: step.dailyCareActionId }
  })

  const derived = deriveExerciseStatusFromSteps(refreshedSteps)
  if (derived) {
    const parentComplete = derived === 'COMPLETED' || derived === 'PARTIALLY_COMPLETED'
    await prisma.dailyCareAction.update({
      where: { id: step.dailyCareActionId },
      data: {
        status: derived,
        completedAt: parentComplete ? now : derived === 'SKIPPED' ? null : undefined,
        completedByUserId: derived === 'COMPLETED' ? userId : undefined
      }
    })
  }

  return step.dailyCareAction.dailyCareLogId
}
