import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { AuthenticatedRequest } from '../types/auth.js'
import { sendError, sendSuccess } from '../utils/responseHelpers.js'

/**
 * Checkout Sessions Controller
 * Handles Stripe checkout session creation for subscriptions
 */

export class CheckoutSessionsController {
  /**
   * Create a Stripe checkout session
   * Middleware: auth (automatic)
   */
  async createCheckoutSession(request: AuthenticatedRequest, reply: FastifyReply) {
    try {
      const { priceId, isTrial } = request.body as { priceId: string; isTrial?: boolean }

      if (!priceId) {
        return sendError(reply, 'priceId is required', 400)
      }

      // Get user email from Clerk user data (already available in request.user)
      const emailAddress = request.user.email

      // Check for existing subscription
      const existingSubscription = await prisma.subscriptions.findUnique({
        where: { userId: request.user.id }
      })

      if (existingSubscription && existingSubscription?.status === 'active') {
        return sendError(reply, 'Existing subscription', 400)
      }

      const stripe = request.server.stripe
      if (!stripe) {
        return reply.status(500).send({
          success: false,
          error: 'Stripe plugin not available'
        })
      }

      // Delete any existing subscription record with status 'none' (abandoned checkout)
      if (existingSubscription?.status === 'none') {
        // Delete the Stripe customer if it exists
        if (existingSubscription.stripeCustomerId) {
          try {
            await stripe.customers.del(existingSubscription.stripeCustomerId)
          } catch (error) {
            request.log.error(error, 'Error deleting Stripe customer:')
            // Continue execution even if Stripe deletion fails
          }
        }
        await prisma.subscriptions.delete({
          where: { userId: request.user.id }
        })
      }

      let stripeCustomer
      if (existingSubscription?.status === 'canceled' && existingSubscription.stripeCustomerId) {
        // Find existing customer in Stripe
        stripeCustomer = await stripe.customers.retrieve(existingSubscription.stripeCustomerId)
        request.log.info({ stripeCustomer }, 'existing stripeCustomer')
        // Deal with a user who has canceled a subscription and is trying to subscribe again
        await prisma.subscriptions.update({
          where: { userId: request.user.id },
          data: {
            status: 'inactive'
          }
        })
      } else {
        // Create a new user in Stripe and connect to the userId in the backend
        stripeCustomer = await stripe.customers.create({
          email: emailAddress,
          metadata: {
            userId: request.user.id // DO NOT FORGET THIS
          }
        })
        request.log.info({ stripeCustomer }, 'newCustomer')
        // Create a new subscription in the database
        await prisma.subscriptions.create({
          data: {
            userId: request.user.id,
            stripeCustomerId: stripeCustomer.id
          }
        })
      }

      const sessionEvent = {
        customer: stripeCustomer.id,
        line_items: [
          // https://docs.stripe.com/checkout/quickstart?client=react
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription' as const,
        // Metadata for checkout.session events
        metadata: {
          userId: request.user.id // Pass the userId here
        },
        allow_promotion_codes: true,
        success_url: `${process.env.DOMAIN}/success`,
        // TODO: is canceled how I can delete the subscription for the user?
        cancel_url: `${process.env.DOMAIN}/?canceled=true`,
        // Automatic tax calculation requires customer address
        automatic_tax: { enabled: true },
        // Save billing address entered in Checkout to the Customer
        customer_update: {
          address: 'auto' as const
        },
        ...(isTrial && {
          subscription_data: {
            trial_period_days: 7
          }
        })
      }

      const session = await stripe.checkout.sessions.create(sessionEvent)

      return sendSuccess(reply, { url: session.url, sessionId: session.id })
    } catch (error) {
      request.log.error(error, 'Error with stripe')
      return sendError(reply, 'Error creating checkout session', 500)
    }
  }
}
