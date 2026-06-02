import 'dotenv/config.js'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import rateLimit from '@fastify/rate-limit'
import { protectedRoutes, publicRoutes } from './plugins/routeGroups.js'
import config from './config/config.js'
import fastifyStripe from 'fastify-stripe'
import rawBody from 'fastify-raw-body'

// Import routes

import usersRoutes from './routes/userRoutes.js'
import teamRoutes from './routes/teamRoutes.js'
import sessionRoutes from './routes/sessionRoutes.js'
import subscriptionsRoutes from './routes/subscriptionsRoutes.js'
import checkoutSessionsRoutes from './routes/checkoutSessionsRoutes.js'
import webhooksRoutes from './routes/webhooksRoutes.js'
import campaignFunnelRoutes from './routes/campaignFunnelRoutes.js'
import campaignsRoutes from './routes/campaignsRoutes.js'

// Import plugins
import errorHandler from './plugins/errorHandler.js'
import { clerkPlugin } from '@clerk/fastify'

// Register core plugins
async function registerPlugins(fastify: ReturnType<typeof Fastify>) {
  // Security plugins
  await fastify.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return cb(null, true)
      }

      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []

      // In development, allow common localhost origins
      if (process.env.NODE_ENV === 'development') {
        const devOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'https://127.0.0.1:3000',
          'https://127.0.0.1:3001'
        ]
        allowedOrigins.push(...devOrigins)
      }

      // Check if origin is allowed (exact match or wildcard)
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        cb(null, true)
      } else {
        fastify.log.warn(`CORS: Origin ${origin} is not allowed`)
        cb(new Error(`Origin ${origin} not allowed by CORS`), false)
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })

  await fastify.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } }) // 25 MB for audio
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    }
  })

  await fastify.register(clerkPlugin, {
    publishableKey: config.clerk.publishableKey,
    secretKey: config.clerk.secretKey
  })

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  })

  // Swagger documentation
  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Harada Method API',
        description: 'A REST API for managing goals and habits',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'support@haradamethod.ai'
        }
      },
      host: process.env.API_HOST || 'localhost:3001',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        {
          name: 'goals',
          description: 'Goal management endpoints'
        },
        {
          name: 'users',
          description: 'User management endpoints'
        },
        {
          name: 'harada',
          description: 'Harada Method board endpoints'
        },
        {
          name: 'subscriptions',
          description: 'Subscription management endpoints'
        },
        {
          name: 'stripe',
          description: 'Stripe payment and webhook endpoints'
        }
      ]
    }
  })

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true
  })

  // Add essential JSON schemas for error responses
  fastify.addSchema({
    $id: 'errorResponse',
    type: 'object',
    properties: {
      success: { type: 'boolean', default: false },
      error: { type: 'string' },
      message: { type: 'string' },
      details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string' },
            message: { type: 'string' }
          },
          required: ['field', 'message']
        }
      }
    },
    required: ['success', 'error']
  })

  // Custom plugins
  await fastify.register(errorHandler)
  await fastify.register(fastifyStripe, {
    apiKey: process.env.STRIPE_SECRET_KEY
  })
  fastify.register(rawBody, {
    field: 'rawBody', // The field name to store the raw body on the request object
    global: false, // Set to true to apply to all routes, or specify routes array
    routes: ['/v1/stripe/webhooks'] // Apply only to specific routes
  })
}

// Register route plugins
async function registerRoutes(fastify: ReturnType<typeof Fastify>) {
  // Protected routes (require authentication)
  const protectedRouteConfigs = [
    { prefix: '/v1/users', routes: usersRoutes },
    { prefix: '/v1/teams', routes: teamRoutes },
    { prefix: '/v1/sessions', routes: sessionRoutes },
    { prefix: '/v1/subscriptions', routes: subscriptionsRoutes }
  ]

  for (const config of protectedRouteConfigs) {
    await protectedRoutes(fastify, config)
  }

  // Public routes (no authentication required)
  // Checkout sessions require auth, but webhooks don't (they use signature verification)
  await protectedRoutes(fastify, {
    prefix: '/v1/stripe/checkout-sessions',
    routes: checkoutSessionsRoutes
  })

  await publicRoutes(fastify, {
    prefix: '/v1/stripe/webhooks',
    routes: webhooksRoutes
  })

  await publicRoutes(fastify, {
    prefix: '/v1/campaign-funnel',
    routes: campaignFunnelRoutes
  })

  await publicRoutes(fastify, {
    prefix: '/v1/campaigns',
    routes: campaignsRoutes
  })
}

// Initialize the application
async function API() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      }
    },
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
        useDefaults: true
      }
    }
  })

  // Health check endpoint
  fastify.get('/health', async () => ({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  }))

  // Root endpoint
  fastify.get('/', async () => ({
    message: 'Harada Method API',
    version: '1.0.0',
    documentation: '/docs'
  }))

  try {
    await registerPlugins(fastify)
    await registerRoutes(fastify)

    fastify.log.info('Application initialized successfully')
  } catch (error) {
    fastify.log.error(`Failed to initialize application: ${error}`)
    process.exit(1)
  }

  return fastify
}

export default API
