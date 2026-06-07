import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { sendError, sendSuccess } from '../utils/responseHelpers.js'
import { getStripeClient, isStripeConfigured } from '../services/billing/stripeClient.js'
import { syncStripeSubscription, syncStripeSubscriptionByCustomerId } from '../services/billing/syncStripeSubscription.js'
import { getStripePriceIds } from '../config/plans.js'

const ALLOWED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.payment_succeeded',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled'
] as const

function getAppUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function extractCustomerId(event: { data: { object: Record<string, unknown> } }): string | null {
  const customer = event.data.object.customer
  if (!customer) return null
  if (typeof customer === 'string') return customer
  if (typeof customer === 'object' && customer !== null && 'id' in customer) {
    return String((customer as { id: string }).id)
  }
  return null
}

export class StripeController {
  async createCheckout(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isStripeConfigured()) {
      return sendError(reply, 'Stripe is not configured', 503)
    }

    const { priceId } = request.body as { priceId?: string }
    const allowedPrices = Object.values(getStripePriceIds()).filter(Boolean) as string[]
    if (!priceId || !allowedPrices.includes(priceId)) {
      return sendError(reply, 'Invalid price ID', 400)
    }

    await ensureUserExists(request)
    const userId = request.user.id

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return sendError(reply, 'User not found', 404)
    }

    const stripe = getStripeClient()
    let stripeCustomerId = user.stripeCustomerId

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId }
      })
      stripeCustomerId = customer.id
      await prisma.user.update({
        where: { id: userId },
        data: { stripeCustomerId }
      })
    }

    const appUrl = getAppUrl()
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { userId }
    })

    if (!session.url) {
      return sendError(reply, 'Failed to create checkout session', 500)
    }

    return sendSuccess(reply, { url: session.url, sessionId: session.id })
  }

  async syncSubscription(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isStripeConfigured()) {
      return sendError(reply, 'Stripe is not configured', 503)
    }

    await ensureUserExists(request)
    await syncStripeSubscription(request.user.id)

    return sendSuccess(reply, { synced: true })
  }

  async createPortalSession(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isStripeConfigured()) {
      return sendError(reply, 'Stripe is not configured', 503)
    }

    const user = await prisma.user.findUnique({ where: { id: request.user.id } })
    if (!user?.stripeCustomerId) {
      return sendError(reply, 'No Stripe customer found', 404)
    }

    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getAppUrl()}/today`
    })

    return sendSuccess(reply, { url: session.url })
  }

  async handleWebhook(request: { rawBody?: Buffer; headers: Record<string, string | string[] | undefined>; log: { error: (err: unknown, msg?: string) => void } }, reply: FastifyReply) {
    if (!isStripeConfigured()) {
      return reply.status(503).send({ error: 'Stripe is not configured' })
    }

    const sig = request.headers['stripe-signature']
    if (!sig || typeof sig !== 'string') {
      return reply.status(400).send({ error: 'Missing stripe-signature header' })
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return reply.status(503).send({ error: 'STRIPE_WEBHOOK_SECRET is not configured' })
    }

    const rawBody = request.rawBody
    if (!rawBody) {
      return reply.status(400).send({ error: 'Missing raw body' })
    }

    let event: { type: string; data: { object: Record<string, unknown> } }
    try {
      const stripe = getStripeClient()
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret) as unknown as {
        type: string
        data: { object: Record<string, unknown> }
      }
    } catch (err) {
      request.log.error(err, 'Stripe webhook signature verification failed')
      return reply.status(400).send({ error: 'Invalid signature' })
    }

    if (!(ALLOWED_STRIPE_EVENTS as readonly string[]).includes(event.type)) {
      return reply.status(200).send({ received: true, skipped: true })
    }

    try {
      const customerId = extractCustomerId(event)
      if (customerId) {
        await syncStripeSubscriptionByCustomerId(customerId)
      }
    } catch (err) {
      request.log.error(err, 'Stripe webhook sync failed')
    }

    return reply.status(200).send({ received: true })
  }
}
