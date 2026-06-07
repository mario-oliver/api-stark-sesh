import type { SubscriptionStatus } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { resolveStripePlanSlug } from '../../config/plans.js'
import { getStripeClient } from './stripeClient.js'

function mapStripeStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled'
    case 'incomplete':
    case 'paused':
    default:
      return 'none'
  }
}

export async function syncStripeSubscription(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user?.stripeCustomerId) return

  const stripe = getStripeClient()
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    limit: 1,
    status: 'all',
    expand: ['data.items.data.price']
  })

  const baseData = {
    userId: user.id,
    source: 'stripe' as const
  }

  if (subscriptions.data.length === 0) {
    await prisma.subscription.upsert({
      where: {
        userId_source: { userId: user.id, source: 'stripe' }
      },
      update: {
        status: 'none',
        planSlug: '',
        stripeSubId: null,
        stripePriceId: null,
        periodEnd: null,
        cancelAtPeriodEnd: false
      },
      create: {
        ...baseData,
        status: 'none',
        planSlug: ''
      }
    })
    return
  }

  const sub = subscriptions.data[0]
  const priceId = sub.items.data[0]?.price?.id ?? ''
  const periodEnd = sub.items.data[0]?.current_period_end
    ? new Date(sub.items.data[0].current_period_end * 1000)
    : null

  await prisma.subscription.upsert({
    where: {
      userId_source: { userId: user.id, source: 'stripe' }
    },
    update: {
      stripeSubId: sub.id,
      status: mapStripeStatus(sub.status),
      planSlug: resolveStripePlanSlug(priceId),
      stripePriceId: priceId,
      periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end
    },
    create: {
      ...baseData,
      stripeSubId: sub.id,
      status: mapStripeStatus(sub.status),
      planSlug: resolveStripePlanSlug(priceId),
      stripePriceId: priceId,
      periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end
    }
  })
}

export async function syncStripeSubscriptionByCustomerId(stripeCustomerId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { stripeCustomerId } })
  if (!user) return
  await syncStripeSubscription(user.id)
}
