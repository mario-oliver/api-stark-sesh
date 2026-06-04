import type { FastifyReply } from 'fastify'
import type { DailyCareActionStatus } from '../generated/client.js'
import { prisma } from '../lib/prisma.js'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { loadTodayPayload } from '../services/dailyCare/resolveTodayLog.js'
import { todayUtcDateString, parseCalendarDate } from '../services/dailyCare/dateUtils.js'
import {
  cascadeExerciseStatus,
  updateDailyCareActionStepAndRollup
} from '../services/dailyCare/dailyCareActionUpdates.js'
import { serializeDailyCareAction } from '../services/dailyCare/serializeDailyCare.js'
import {
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendUpdated
} from '../utils/responseHelpers.js'

export class DailyCareController {
  async updateDailyAction(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, actionId } = request.params as { id: string; actionId: string }
    const body = request.body as {
      status?: DailyCareActionStatus
      notes?: string
      tolerance?: string | null
      issueObserved?: boolean
    }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const action = await prisma.dailyCareAction.findFirst({
      where: { id: actionId, dailyCareLog: { dogId } },
      include: { steps: true }
    })
    if (!action) {
      return sendNotFound(reply, 'Daily care action not found')
    }

    const status = body.status ?? action.status

    if (
      action.steps.length > 0 &&
      (status === 'COMPLETED' || status === 'SKIPPED' || status === 'PARTIALLY_COMPLETED')
    ) {
      const updated = await cascadeExerciseStatus(actionId, status, request.user.id, {
        notes: body.notes !== undefined ? body.notes : undefined,
        tolerance: body.tolerance !== undefined ? body.tolerance : undefined,
        issueObserved: body.issueObserved
      })
      const serialized = await serializeDailyCareAction(updated as never)
      return sendUpdated(reply, serialized)
    }

    const now = new Date()
    const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'

    const updated = await prisma.dailyCareAction.update({
      where: { id: actionId },
      data: {
        status,
        notes: body.notes !== undefined ? body.notes : action.notes,
        tolerance:
          body.tolerance !== undefined
            ? (body.tolerance as typeof action.tolerance)
            : action.tolerance,
        issueObserved: body.issueObserved ?? action.issueObserved,
        completedAt: isComplete ? now : status === 'SKIPPED' ? null : action.completedAt,
        completedByUserId: isComplete ? request.user.id : action.completedByUserId
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

    const serialized = await serializeDailyCareAction(updated as never)
    return sendUpdated(reply, serialized)
  }

  async updateDailyActionStep(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, stepId } = request.params as { id: string; stepId: string }
    const body = request.body as {
      status?: DailyCareActionStatus
      notes?: string
    }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const logId = await updateDailyCareActionStepAndRollup(
      stepId,
      dogId,
      request.user.id,
      body
    )
    if (!logId) {
      return sendNotFound(reply, 'Movement not found')
    }

    const payload = await loadTodayPayload(dogId, logId)
    const step = payload.dailyLog.dailyCareActions
      .flatMap(a => a.steps)
      .find(s => s.id === stepId)

    if (!step) {
      return sendNotFound(reply, 'Movement not found')
    }

    return sendUpdated(reply, step)
  }

  async createObservation(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as {
      type: string
      severity?: string
      bodyArea?: string | null
      note: string
      observedAt?: string
      date?: string
    }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const dateStr = body.date ?? todayUtcDateString()
    const logDate = parseCalendarDate(dateStr)
    if (!logDate) {
      return sendNotFound(reply, 'Invalid date')
    }

    let log = await prisma.dailyCareLog.findUnique({
      where: { dogId_date: { dogId, date: logDate } }
    })
    if (!log) {
      log = await prisma.dailyCareLog.create({ data: { dogId, date: logDate } })
    }

    const obs = await prisma.healthObservation.create({
      data: {
        dogId,
        dailyCareLogId: log.id,
        userId: request.user.id,
        type: body.type as never,
        severity: (body.severity as never) ?? null,
        bodyArea: body.bodyArea ?? null,
        note: body.note,
        observedAt: body.observedAt ? new Date(body.observedAt) : null
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    return sendSuccess(reply, obs, 201)
  }

  async updateObservation(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, obsId } = request.params as { id: string; obsId: string }
    const body = request.body as {
      type?: string
      severity?: string | null
      bodyArea?: string | null
      note?: string
    }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const existing = await prisma.healthObservation.findFirst({
      where: { id: obsId, dogId }
    })
    if (!existing) {
      return sendNotFound(reply, 'Observation not found')
    }

    const updated = await prisma.healthObservation.update({
      where: { id: obsId },
      data: {
        type: (body.type as never) ?? existing.type,
        severity: body.severity !== undefined ? (body.severity as never) : existing.severity,
        bodyArea: body.bodyArea !== undefined ? body.bodyArea : existing.bodyArea,
        note: body.note ?? existing.note
      },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    return sendUpdated(reply, updated)
  }

  async getTodayAfterMutation(dogId: string, dailyCareLogId: string) {
    return loadTodayPayload(dogId, dailyCareLogId)
  }
}
