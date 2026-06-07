import 'dotenv/config'

export default {
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    secretKey: process.env.CLERK_SECRET_KEY || '',
    webhookSecret: process.env.CLERK_WEBHOOK_SECRET || ''
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    pricePro: process.env.STRIPE_PRICE_PRO || '',
    priceBasic: process.env.STRIPE_PRICE_BASIC || ''
  },
  apple: {
    keyId: process.env.APPLE_APP_STORE_KEY_ID || '',
    issuerId: process.env.APPLE_APP_STORE_ISSUER_ID || '',
    bundleId: process.env.APPLE_BUNDLE_ID || '',
    environment: process.env.APPLE_ENVIRONMENT || 'sandbox'
  },
  app: {
    url: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  },
  server: {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0'
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
  }
}
