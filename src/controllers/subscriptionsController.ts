import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../types/auth.js'
import { syncStripeDataToDb } from '../services/stripe.js'
import { sendInternalError, sendSuccess } from '../utils/responseHelpers.js'

/**
 * Subscriptions Controller
 * Handles subscription-related operations
 */

export class SubscriptionsController {
  /**
   * Get subscription for current user
   * Syncs with Stripe and returns the latest subscription data
   * Middleware: auth (automatic)
   */
  async getSubscription(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      const subscription = await prisma.subscriptions.findFirst({
        where: { userId: request.user.id }
      })

      if (!subscription) {
        return sendSuccess(reply, null, 200, 'SUBSCRIPTION_NOT_FOUND')
      }

      if (!subscription.stripeCustomerId) {
        return sendSuccess(reply, null, 200, 'SUBSCRIPTION_MISSING_STRIPE_ID')
      }

      // We sync every time we hit this endpoint
      const stripe = request.server.stripe
      if (!stripe) {
        return sendInternalError(reply, 'Stripe plugin not available')
      }
      const subData = await syncStripeDataToDb(stripe, subscription.stripeCustomerId, request.user.id)

      // Return null for canceled subscriptions (user needs to resubscribe)
      if (subData.status === 'canceled') {
        return sendSuccess(reply, null, 200, 'Subscription canceled')
      }

      // Fetch the updated subscription from database
      const updatedSubscription = await prisma.subscriptions.findFirst({
        where: { userId: request.user.id }
      })

      return reply.status(200).send({
        success: true,
        data: updatedSubscription
      })
    } catch (error) {
      request.log.error(error, 'Error getting subscription details:')
      return reply.status(500).send({
        success: false,
        error: 'Error getting subscription details.'
      })
    }
  }
}
