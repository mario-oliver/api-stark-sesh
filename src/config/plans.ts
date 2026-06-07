export const PLAN_SLUGS = ['pro', 'basic', 'unknown'] as const
export type PlanSlug = (typeof PLAN_SLUGS)[number]

export const PLAN_RANK: Record<string, number> = {
  pro: 2,
  basic: 1,
  unknown: 0
}

function stripePriceMap(): Record<string, PlanSlug> {
  const map: Record<string, PlanSlug> = {}
  if (process.env.STRIPE_PRICE_PRO) map[process.env.STRIPE_PRICE_PRO] = 'pro'
  if (process.env.STRIPE_PRICE_BASIC) map[process.env.STRIPE_PRICE_BASIC] = 'basic'
  return map
}

function appleProductMap(): Record<string, PlanSlug> {
  const map: Record<string, PlanSlug> = {}
  if (process.env.APPLE_PRODUCT_PRO) map[process.env.APPLE_PRODUCT_PRO] = 'pro'
  if (process.env.APPLE_PRODUCT_BASIC) map[process.env.APPLE_PRODUCT_BASIC] = 'basic'
  return map
}

export function resolveStripePlanSlug(priceId: string): PlanSlug {
  return stripePriceMap()[priceId] ?? 'unknown'
}

export function resolveApplePlanSlug(productId: string): PlanSlug {
  return appleProductMap()[productId] ?? 'unknown'
}

export function getStripePriceIds(): { pro?: string; basic?: string } {
  return {
    pro: process.env.STRIPE_PRICE_PRO,
    basic: process.env.STRIPE_PRICE_BASIC
  }
}

export function getAppleProductIds(): { pro?: string; basic?: string } {
  return {
    pro: process.env.APPLE_PRODUCT_PRO,
    basic: process.env.APPLE_PRODUCT_BASIC
  }
}
