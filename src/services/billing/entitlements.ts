import { prisma } from '../../lib/prisma.js'
import { PLAN_RANK } from '../../config/plans.js'

export interface EntitlementResult {
  planSlug: string | null
  hasPro: boolean
  hasBasic: boolean
  source: 'stripe' | 'apple' | null
  status: string | null
  periodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export async function getActiveEntitlement(userId: string): Promise<EntitlementResult> {
  const subs = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['active', 'trialing'] }
    }
  })

  const best = subs.sort((a, b) => PLAN_RANK[b.planSlug] - PLAN_RANK[a.planSlug])[0]

  return {
    planSlug: best?.planSlug ?? null,
    hasPro: best?.planSlug === 'pro',
    hasBasic: best?.planSlug === 'basic' || best?.planSlug === 'pro',
    source: best?.source ?? null,
    status: best?.status ?? null,
    periodEnd: best?.periodEnd ?? null,
    cancelAtPeriodEnd: best?.cancelAtPeriodEnd ?? false
  }
}

export async function getUserSubscriptions(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { source: 'asc' }
  })
}
