import type { FastifyReply } from 'fastify'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  cancelExerciseSession,
  confirmExerciseSession,
  createExerciseSession,
  getExerciseSession,
  sendExerciseAgentMessage,
  serializeSession
} from '../services/exerciseAgent/sessionService.js'
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'

export class ExerciseAgentController {
  async createSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as { message: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const { session, error } = await createExerciseSession({
        dogId,
        userId: request.user.id,
        message: body.message
      })

      if (error) {
        return sendError(reply, error, 502)
      }

      return sendCreated(reply, serializeSession(session), 'Exercise agent session started')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start session'
      if (message === 'Dog not found') {
        return sendNotFound(reply, message)
      }
      return sendError(reply, message, 500)
    }
  }

  async getSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const session = await getExerciseSession({
      dogId,
      userId: request.user.id,
      sessionId
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    return sendSuccess(reply, serializeSession(session))
  }

  async sendMessage(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }
    const body = request.body as { message: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const { session, error } = await sendExerciseAgentMessage({
        dogId,
        userId: request.user.id,
        sessionId,
        message: body.message
      })

      if (error) {
        return sendError(reply, error, 502)
      }

      return sendSuccess(reply, serializeSession(session))
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
    const body = (request.body ?? {}) as { edits?: Record<string, unknown> }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const { action } = await confirmExerciseSession({
        dogId,
        userId: request.user.id,
        sessionId,
        edits: body.edits
      })

      return sendCreated(reply, { action, status: 'committed' }, 'Exercise added to routine')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm'
      if (message.includes('not found') || message.includes('No draft')) {
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
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      await cancelExerciseSession({
        dogId,
        userId: request.user.id,
        sessionId
      })
      return sendSuccess(reply, { cancelled: true })
    } catch {
      return sendNotFound(reply, 'Session not found')
    }
  }
}
