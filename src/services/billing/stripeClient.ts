import Stripe from 'stripe'

type StripeClient = InstanceType<typeof Stripe>

let stripe: StripeClient | null = null

export function getStripeClient(): StripeClient {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripe = new Stripe(key)
  }
  return stripe
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}
