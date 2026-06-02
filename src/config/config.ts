import 'dotenv/config'

export default {
  clerk: {
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
    secretKey: process.env.CLERK_SECRET_KEY || ''
  },
  server: {
    port: Number(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0'
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []
  }
}
