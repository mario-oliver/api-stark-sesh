import { prisma } from '../../lib/prisma.js'
import { actionAppliesOnDate } from './actionAppliesOnDate.js'
import { formatCalendarDate, parseCalendarDate } from './dateUtils.js'
import { syncDailyCareActionSteps } from './syncDailyCareActionSteps.js'
import { serializeDailyCareAction } from './serializeDailyCare.js'

const dailyActionInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    completedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    careAction: { select: { targetReps: true, targetDurationSeconds: true } },
    steps: {
      orderBy: { createdAt: 'asc' as const },
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
}

export async function resolveTodayLog(dogId: string, dateInput: string) {
  const logDate = parseCalendarDate(dateInput)
  if (!logDate) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.')
  }

  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true },
    include: {
      actions: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' }
      }
    }
  })

  let dailyLog = await prisma.dailyCareLog.findUnique({
    where: { dogId_date: { dogId, date: logDate } }
  })

  if (!dailyLog) {
    dailyLog = await prisma.dailyCareLog.create({
      data: { dogId, date: logDate }
    })
  }

  if (plan) {
    const applicable = plan.actions.filter(a =>
      actionAppliesOnDate(a.frequency, plan.createdAt, logDate)
    )

    const existing = await prisma.dailyCareAction.findMany({
      where: { dailyCareLogId: dailyLog.id },
      select: { careActionId: true }
    })
    const existingIds = new Set(existing.map(e => e.careActionId))

    const toCreate = applicable.filter(a => !existingIds.has(a.id))
    if (toCreate.length > 0) {
      const created = await prisma.$transaction(
        toCreate.map(a =>
          prisma.dailyCareAction.create({
            data: {
              dailyCareLogId: dailyLog!.id,
              careActionId: a.id,
              nameSnapshot: a.name,
              categorySnapshot: a.category,
              targetReps: a.targetReps,
              targetDurationSeconds: a.targetDurationSeconds,
              status: 'PENDING'
            }
          })
        )
      )

      for (const dailyAction of created) {
        const templateSteps = await prisma.careActionStep.findMany({
          where: { careActionId: dailyAction.careActionId, isActive: true },
          orderBy: { sortOrder: 'asc' }
        })
        if (templateSteps.length > 0) {
          await prisma.dailyCareActionStep.createMany({
            data: templateSteps.map(step => ({
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
    }
  }

  await syncDailyCareActionSteps(dailyLog.id)

  return loadTodayPayload(dogId, dailyLog.id)
}

export async function loadTodayPayload(dogId: string, dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    include: {
      dailyCareActions: dailyActionInclude,
      voiceNotes: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      },
      healthObservations: {
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      }
    }
  })

  const dog = await prisma.dog.findUniqueOrThrow({ where: { id: dogId } })
  const dailyCareActions = await Promise.all(log.dailyCareActions.map(serializeDailyCareAction))

  const completed = dailyCareActions.filter(a => a.status === 'COMPLETED').length
  const total = dailyCareActions.length

  return {
    dog,
    date: formatCalendarDate(log.date),
    dailyLog: {
      id: log.id,
      summary: log.summary,
      dailyCareActions,
      voiceNotes: log.voiceNotes.map(note => ({
        ...note,
        createdAt: note.createdAt.toISOString()
      })),
      healthObservations: log.healthObservations.map(obs => ({
        ...obs,
        observedAt: obs.observedAt?.toISOString() ?? null,
        createdAt: obs.createdAt.toISOString()
      }))
    },
    progress: { completed, total }
  }
}
