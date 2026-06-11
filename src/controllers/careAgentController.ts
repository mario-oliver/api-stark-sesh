import type { FastifyReply } from 'fastify'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { findCareAgentSessionForUser } from '../services/careAgentSession/sessionRepository.js'
import { serializeCareAgentSession } from '../services/careAgentSession/serializeCareAgentSession.js'
import {
  cancelExerciseSession,
  confirmExerciseSession,
  createExerciseSession,
  sendExerciseAgentMessage
} from '../services/exerciseAgent/sessionService.js'
import {
  cancelAuditSession,
  confirmAuditSession,
  createAuditSession,
  sendProgramAuditMessage
} from '../services/programAudit/sessionService.js'
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'

/**
 * The single conversational-agent HTTP surface (ADR-0002). One route family,
 * `/v1/dogs/:id/care-agent/sessions`, dispatches by `kind` onto the existing
 * per-agent orchestration (PLAN_BUILD → exercise agent, PLAN_AUDIT → program
 * audit) and serializes every response through `serializeCareAgentSession`.
 * The agents already persist to the unified `CareAgentSession` table, so this
 * layer only routes and shapes — it owns no agent logic of its own.
 */
export class CareAgentController {
  async createSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as { kind: 'PLAN_BUILD' | 'PLAN_AUDIT'; message?: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      if (body.kind === 'PLAN_BUILD') {
        const { session, error } = await createExerciseSession({
          dogId,
          userId: request.user.id,
          message: body.message as string
        })
        if (error) return sendError(reply, error, 502)
        return sendCreated(reply, serializeCareAgentSession(session), 'Care agent session started')
      }

      if (body.kind === 'PLAN_AUDIT') {
        const { session, error } = await createAuditSession({ dogId, userId: request.user.id })
        if (error) return sendError(reply, error, 502)
        return sendCreated(reply, serializeCareAgentSession(session), 'Care agent session started')
      }

      return sendError(reply, 'Unsupported session kind', 400)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      if (message === 'Dog not found') return sendNotFound(reply, message)
      return sendError(reply, message, 500)
    }
  }

  async getSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const session = await findCareAgentSessionForUser({ id: sessionId, dogId, userId: request.user.id })
    if (!session) return sendNotFound(reply, 'Session not found')

    return sendSuccess(reply, serializeCareAgentSession(session))
  }

  async sendMessage(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }
    const body = request.body as { message: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const existing = await findCareAgentSessionForUser({ id: sessionId, dogId, userId: request.user.id })
    if (!existing) return sendNotFound(reply, 'Session not found')

    try {
      const result =
        existing.kind === 'PLAN_BUILD'
          ? await sendExerciseAgentMessage({ dogId, userId: request.user.id, sessionId, message: body.message })
          : existing.kind === 'PLAN_AUDIT'
            ? await sendProgramAuditMessage({ dogId, userId: request.user.id, sessionId, message: body.message })
            : null
      if (!result) return sendError(reply, 'Unsupported session kind', 400)
      if (result.error) return sendError(reply, result.error, 502)
      return sendSuccess(reply, serializeCareAgentSession(result.session))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process message'
      if (message === 'Session not found' || message === 'Dog not found') {
        return sendNotFound(reply, message)
      }
      return sendError(reply, message, 500)
    }
  }

  async confirmSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }
    const body = (request.body ?? {}) as { selectedChangeIds?: string[] }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const existing = await findCareAgentSessionForUser({ id: sessionId, dogId, userId: request.user.id })
    if (!existing) return sendNotFound(reply, 'Session not found')

    try {
      if (existing.kind === 'PLAN_BUILD') {
        const { action } = await confirmExerciseSession({ dogId, userId: request.user.id, sessionId })
        return sendCreated(reply, { action, status: 'committed' }, 'Exercise added to routine')
      }

      if (existing.kind === 'PLAN_AUDIT') {
        const { applied, changesApplied } = await confirmAuditSession({
          dogId,
          userId: request.user.id,
          sessionId,
          selectedChangeIds: body.selectedChangeIds
        })
        return sendCreated(
          reply,
          { applied, changesApplied, status: 'committed' },
          `Applied ${changesApplied} change${changesApplied === 1 ? '' : 's'} to routine`
        )
      }

      return sendError(reply, 'Unsupported session kind', 400)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm'
      if (message.includes('not found') || message.includes('No draft') || message.includes('No plan')) {
        return sendNotFound(reply, message)
      }
      if (err instanceof Error && err.name === 'ZodError') {
        return sendError(reply, 'Invalid draft data', 400)
      }
      return sendError(reply, message, 500)
    }
  }

  async cancelSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const existing = await findCareAgentSessionForUser({ id: sessionId, dogId, userId: request.user.id })
    if (!existing) return sendNotFound(reply, 'Session not found')

    try {
      if (existing.kind === 'PLAN_BUILD') {
        await cancelExerciseSession({ dogId, userId: request.user.id, sessionId })
      } else if (existing.kind === 'PLAN_AUDIT') {
        await cancelAuditSession({ dogId, userId: request.user.id, sessionId })
      } else {
        return sendError(reply, 'Unsupported session kind', 400)
      }
      return sendSuccess(reply, { cancelled: true })
    } catch {
      return sendNotFound(reply, 'Session not found')
    }
  }
}
