import { prisma } from '../lib/prisma.js'

/**
 * Stripe Service
 * Handles syncing subscription data from Stripe to the database
 */

export interface SubscriptionData {
  stripeSubscriptionId?: string
  status: string
  currentPeriodEnd?: number
  currentPeriodStart?: number
  cancelAtPeriodEnd?: boolean
}

/**
 * Sync subscription data from Stripe to database
 * Fetches the latest subscription from Stripe and updates/creates the database record
 */
export async function syncStripeDataToDb(
  stripe: any,
  stripeCustomerId: string,
  userId: string
): Promise<SubscriptionData> {
  try {
    // Fetch latest subscription data from Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      limit: 1,
      status: 'all'
    })

    if (subscriptions.data.length === 0) {
      const subData: SubscriptionData = { status: 'none' }
      await prisma.subscriptions.upsert({
        where: { userId },
        create: {
          stripeCustomerId: stripeCustomerId,
          status: subData.status,
          userId
        },
        update: {
          status: subData.status
        }
      })
      return subData
    }

    // If a user can have multiple subscriptions, that's your problem
    const subscription = subscriptions.data[0]

    // Store complete subscription state
    const subData: SubscriptionData = {
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodEnd: subscription.current_period_end,
      currentPeriodStart: subscription.current_period_start,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    }

    // Store the data in the database
    await prisma.subscriptions.upsert({
      where: { userId },
      create: {
        ...subData,
        stripeCustomerId: stripeCustomerId,
        userId
      },
      update: subData
    })

    return subData
  } catch (error) {
    console.error('Error syncing stripe data:', error)
    throw error
  }
}
