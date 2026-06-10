import type { FastifyReply } from 'fastify'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  cancelAuditSession,
  confirmAuditSession,
  createAuditSession,
  getAuditSession,
  sendProgramAuditMessage,
  serializeSession
} from '../services/programAudit/sessionService.js'
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'

export class ProgramAuditController {
  async createSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      const { session, error } = await createAuditSession({
        dogId,
        userId: request.user.id
      })
      if (error) return sendError(reply, error, 502)
      return sendCreated(reply, serializeSession(session), 'Program audit started')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start audit'
      if (message === 'Dog not found') return sendNotFound(reply, message)
      return sendError(reply, message, 500)
    }
  }

  async getSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const session = await getAuditSession({
      dogId,
      userId: request.user.id,
      sessionId
    })
    if (!session) return sendNotFound(reply, 'Session not found')
    return sendSuccess(reply, serializeSession(session))
  }

  async sendMessage(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }
    const body = request.body as { message: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      const { session, error } = await sendProgramAuditMessage({
        dogId,
        userId: request.user.id,
        sessionId,
        message: body.message
      })
      if (error) return sendError(reply, error, 502)
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
    const body = (request.body ?? {}) as { selectedChangeIds?: string[] }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm'
      if (message.includes('not found') || message.includes('No plan')) {
        return sendNotFound(reply, message)
      }
      return sendError(reply, message, 500)
    }
  }

  async cancelSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      await cancelAuditSession({ dogId, userId: request.user.id, sessionId })
      return sendSuccess(reply, { cancelled: true })
    } catch {
      return sendNotFound(reply, 'Session not found')
    }
  }
}
