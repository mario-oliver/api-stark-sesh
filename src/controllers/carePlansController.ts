import type { FastifyReply } from 'fastify'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  createCareAction,
  deactivateCareAction,
  getActiveCarePlan,
  getCalendarSummary,
  updateCareAction,
  updateCarePlanName
} from '../services/carePlans/carePlanService.js'
import {
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendUpdated,
  sendCreated,
  sendError
} from '../utils/responseHelpers.js'

export class CarePlansController {
  async getCarePlan(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const plan = await getActiveCarePlan(dogId)
    if (!plan) {
      return sendNotFound(reply, 'No active care plan found')
    }

    return sendSuccess(reply, plan)
  }

  async updateCarePlan(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as { name: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const plan = await updateCarePlanName(dogId, body.name)
      return sendUpdated(reply, plan)
    } catch {
      return sendNotFound(reply, 'No active care plan found')
    }
  }

  async createAction(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as Parameters<typeof createCareAction>[1]

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const action = await createCareAction(dogId, body)
      return sendCreated(reply, action, 'Care action created')
    } catch {
      return sendNotFound(reply, 'No active care plan found')
    }
  }

  async updateAction(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, actionId } = request.params as { id: string; actionId: string }
    const body = request.body as Parameters<typeof updateCareAction>[2]

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const action = await updateCareAction(dogId, actionId, body)
      return sendUpdated(reply, action)
    } catch {
      return sendNotFound(reply, 'Care action not found')
    }
  }

  async deactivateAction(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, actionId } = request.params as { id: string; actionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    try {
      const action = await deactivateCareAction(dogId, actionId)
      return sendUpdated(reply, action)
    } catch {
      return sendNotFound(reply, 'Care action not found')
    }
  }

  async getCalendar(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const query = request.query as { month?: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    if (!query.month) {
      return sendError(reply, 'month query parameter is required (YYYY-MM)', 400)
    }

    try {
      const summary = await getCalendarSummary(dogId, query.month)
      return sendSuccess(reply, summary)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid month'
      return sendError(reply, message, 400)
    }
  }
}
