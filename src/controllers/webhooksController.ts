import { FastifyReply, FastifyRequest } from 'fastify'
import { syncStripeDataToDb } from '../services/stripe.js'

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

// Allowed webhook events
const allowedEvents: string[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.pending_update_applied',
  'customer.subscription.pending_update_expired',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.upcoming',
  'invoice.marked_uncollectible',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled'
]

/**
 * Webhooks Controller
 * Handles Stripe webhook events
 */
/**
 *
 * TO ACTIVATE LOCAL WEBHOOK:
 *      1. stripe login
 *      2. stripe listen --forward-to localhost:3000/api/v1/stripe/webhooks
 * for api server instead of frontend hosted server
 *      2a. stripe listen --forward-to localhost:3036/v1/stripe/webhooks
 */
export class WebhooksController {
  /**
   * Handle Stripe webhook events
   * No auth required, but signature verification is performed
   */
  async handleWebhook(request: FastifyRequest, reply: FastifyReply) {
    // Otherwise, this is a direct Stripe webhook - verify signature
    const rawBody = request.rawBody // Access the raw body here
    const sig = request.headers['stripe-signature'] as string

    if (!sig) {
      return reply.status(400).send({ error: 'Missing stripe-signature header' })
    }

    if (!rawBody) {
      return reply.status(400).send({ error: 'Missing request body' })
    }

    // Access Stripe from Fastify plugin
    const stripe = request.server.stripe

    if (!stripe) {
      return reply.status(500).send({ error: 'Stripe plugin not available' })
    }

    let event

    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret!)
    } catch (err) {
      request.log.error(err, 'Error verifying webhook signature:')
      return reply.status(400).send({ error: `Webhook Error: ${err}` })
    }

    try {
      // Check if event is in allowedEvents array
      if (allowedEvents.includes(event.type)) {
        await this.processEvent(event, request)
      }

      return reply.status(200).send({ received: true })
    } catch (err) {
      request.log.error(err, `Error processing event ${event.id}:`)
      return reply.status(500).send({ error: 'Error processing webhook' })
    }
  }

  /**
   * Process individual webhook events
   */
  private async processEvent(event: any, request: FastifyRequest) {
    // Extract customer ID from event - different events have it in different places
    let customerId: string | null = null

    // Most events have customer directly on the object
    if (event.data?.object?.customer) {
      customerId = event.data.object.customer
    }

    // Some events (like checkout.session.completed) might have it nested
    if (!customerId && event.data?.object?.subscription) {
      // For subscription events, retrieve the subscription to get customer
      try {
        const stripe = request.server.stripe
        if (stripe) {
          const subscription = await stripe.subscriptions.retrieve(event.data.object.subscription)
          customerId = subscription.customer as string
        }
      } catch (error) {
        request.log.error(error, 'Error retrieving subscription:')
      }
    }

    // This helps make it typesafe and also lets us know if our assumption is wrong
    if (typeof customerId !== 'string') {
      request.log.warn(
        { eventType: event.type, eventData: event.data?.object },
        'No customer ID found in webhook event'
      )
      return
    }

    // Get userId from customer metadata
    let userId: string | null = null

    try {
      const stripe = request.server.stripe
      if (stripe) {
        const customer = await stripe.customers.retrieve(customerId)
        if ('metadata' in customer) {
          userId = (customer.metadata as { userId?: string })?.userId || null
        }
      }
    } catch (error) {
      request.log.error(error, 'Error retrieving customer:')
    }

    // Fallback: try to get userId from event object metadata (for checkout sessions)
    if (!userId && event.data?.object?.metadata?.userId) {
      userId = event.data.object.metadata.userId
    }

    if (!userId) {
      request.log.warn({ eventType: event.type, customerId }, 'No userId found in webhook event')
      return
    }

    // Sync subscription data
    const stripe = request.server.stripe
    if (!stripe) {
      request.log.error('Stripe plugin not available')
      return
    }
    await syncStripeDataToDb(stripe, customerId, userId)
  }
}
