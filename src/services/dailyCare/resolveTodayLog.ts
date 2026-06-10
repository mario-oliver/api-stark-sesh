import { prisma } from '../../lib/prisma.js'
import { actionAppliesOnDate } from './actionAppliesOnDate.js'
import { formatCalendarDate, parseCalendarDate } from './dateUtils.js'
import { serializeDog } from '../../lib/serializeDog.js'
import { syncDailyTasks } from './syncDailyTasks.js'
import { serializeDailyCareAction } from './serializeDailyCare.js'
import {
  bucketProgress,
  dailyTaskInclude,
  parseBucketScores,
  serializeDailyTask,
  serializeObservation,
  type DailyTaskWithRelations
} from './serializeDailyTask.js'
import type { CareBucket } from '../../generated/client.js'

const dailyActionInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    completedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
    careAction: { select: { targetReps: true, targetDurationSeconds: true } }
  }
}

export async function resolveTodayLog(dogId: string, dateInput: string) {
  const logDate = parseCalendarDate(dateInput)
  if (!logDate) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.')
  }

  // Empty-transcript notes were saved as PENDING with no processing job; mark them terminal.
  await prisma.voiceNote.updateMany({
    where: { dogId, processingStatus: 'PENDING', transcript: '' },
    data: { processingStatus: 'FAILED' }
  })

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
      await prisma.$transaction(
        toCreate.map(a =>
          prisma.dailyCareAction.create({
            data: {
              dailyCareLogId: dailyLog!.id,
              careActionId: a.id,
              nameSnapshot: a.name,
              targetReps: a.targetReps,
              targetDurationSeconds: a.targetDurationSeconds,
              status: 'PENDING'
            }
          })
        )
      )
    }
  }

  await syncDailyTasks(dailyLog.id)

  return loadTodayPayload(dogId, dailyLog.id)
}

function groupByBucket<T extends { bucket: string | null }>(
  items: T[],
  bucket: CareBucket
): T[] {
  return items.filter(i => i.bucket === bucket)
}

export async function loadTodayPayload(dogId: string, dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    include: {
      dailyCareActions: dailyActionInclude,
      dailyTasks: {
        orderBy: [{ bucket: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: dailyTaskInclude
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

  const dog = await serializeDog(await prisma.dog.findUniqueOrThrow({ where: { id: dogId } }))
  const dailyCareActions = await Promise.all(log.dailyCareActions.map(serializeDailyCareAction))
  const tasks = await Promise.all(
    log.dailyTasks.map(t => serializeDailyTask(t as DailyTaskWithRelations))
  )
  const observations = log.healthObservations.map(serializeObservation)

  const activityTasks = tasks.filter(t => t.bucket === 'ACTIVITY')
  const mobilityTasks = tasks.filter(t => t.bucket === 'MOBILITY')
  const recoveryTasks = tasks.filter(t => t.bucket === 'RECOVERY')

  const bucketScores = parseBucketScores(log.bucketScores)
  const latestVoiceNote = log.voiceNotes[0] ?? null

  const voiceNotes = log.voiceNotes.map(note => ({
    ...note,
    createdAt: note.createdAt.toISOString()
  }))

  const completed = dailyCareActions.filter(a => a.status === 'COMPLETED').length
  const total = dailyCareActions.length

  return {
    dog,
    date: formatCalendarDate(log.date),
    dailyLog: {
      id: log.id,
      summary: log.summary,
      bucketScores,
      scoreComputedAt: log.scoreComputedAt?.toISOString() ?? null,
      scoreInputVersion: log.scoreInputVersion,
      latestVoiceNoteAt: latestVoiceNote?.createdAt.toISOString() ?? null,
      dailyCareActions,
      voiceNotes,
      healthObservations: observations
    },
    buckets: {
      activity: {
        tasks: activityTasks,
        observations: groupByBucket(observations, 'ACTIVITY'),
        progress: bucketProgress(activityTasks),
        score: bucketScores?.activity ?? null
      },
      mobility: {
        tasks: mobilityTasks,
        observations: groupByBucket(observations, 'MOBILITY'),
        progress: bucketProgress(mobilityTasks),
        score: bucketScores?.mobility ?? null
      },
      recovery: {
        tasks: recoveryTasks,
        observations: groupByBucket(observations, 'RECOVERY'),
        score: bucketScores?.recovery ?? null
      }
    },
    progress: { completed, total }
  }
}
