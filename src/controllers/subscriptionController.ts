import { FastifyReply } from 'fastify'
import type { AuthenticatedRequest } from '../types/auth.js'
import { sendSuccess } from '../utils/responseHelpers.js'
import { getActiveEntitlement, getUserSubscriptions } from '../services/billing/entitlements.js'

export class SubscriptionController {
  async getSubscription(request: AuthenticatedRequest, reply: FastifyReply) {
    const [entitlement, subscriptions] = await Promise.all([
      getActiveEntitlement(request.user.id),
      getUserSubscriptions(request.user.id)
    ])

    return sendSuccess(reply, {
      entitlement,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        status: sub.status,
        planSlug: sub.planSlug,
        source: sub.source,
        periodEnd: sub.periodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd
      }))
    })
  }
}
