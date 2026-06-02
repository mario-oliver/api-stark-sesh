import type { CareActionFrequency } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { daysBetweenUtc, formatCalendarDate, parseCalendarDate } from './dateUtils.js'

function actionAppliesOnDate(
  frequency: CareActionFrequency,
  planCreatedAt: Date,
  logDate: Date
): boolean {
  switch (frequency) {
    case 'DAILY':
      return true
    case 'EVERY_OTHER_DAY': {
      const dayIndex = daysBetweenUtc(planCreatedAt, logDate)
      return dayIndex % 2 === 0
    }
    case 'WEEKLY':
      return daysBetweenUtc(planCreatedAt, logDate) % 7 === 0
    case 'AS_NEEDED':
      return true
    default:
      return true
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
      await prisma.dailyCareAction.createMany({
        data: toCreate.map(a => ({
          dailyCareLogId: dailyLog!.id,
          careActionId: a.id,
          nameSnapshot: a.name,
          categorySnapshot: a.category,
          status: 'PENDING' as const
        }))
      })
    }
  }

  return loadTodayPayload(dogId, dailyLog.id)
}

export async function loadTodayPayload(dogId: string, dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    include: {
      dailyCareActions: {
        orderBy: { createdAt: 'asc' },
        include: {
          careAction: true,
          completedBy: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      },
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

  const completed = log.dailyCareActions.filter(a => a.status === 'COMPLETED').length
  const total = log.dailyCareActions.length

  return {
    dog,
    date: formatCalendarDate(log.date),
    dailyLog: log,
    progress: { completed, total }
  }
}
