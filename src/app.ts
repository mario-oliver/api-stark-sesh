import 'dotenv/config.js'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import rateLimit from '@fastify/rate-limit'
import { protectedRoutes } from './plugins/routeGroups.js'
import config from './config/config.js'

import usersRoutes from './routes/userRoutes.js'
import dogRoutes from './routes/dogRoutes.js'
import uploadsRoutes from './routes/uploadsRoutes.js'

import errorHandler from './plugins/errorHandler.js'
import { clerkPlugin } from '@clerk/fastify'

async function registerPlugins(fastify: ReturnType<typeof Fastify>) {
  await fastify.register(cors, {
    origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      if (!origin) {
        return cb(null, true)
      }

      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()) || []

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

  await fastify.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } })
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

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  })

  await fastify.register(swagger, {
    swagger: {
      info: {
        title: 'Stark Health API',
        description: 'Voice-first dog PT care coordination API',
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
          name: 'users',
          description: 'User management endpoints'
        },
        {
          name: 'dogs',
          description: 'Dog care plan and daily log endpoints'
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

  await fastify.register(errorHandler)
}

async function registerRoutes(fastify: ReturnType<typeof Fastify>) {
  const protectedRouteConfigs = [
    { prefix: '/v1/users', routes: usersRoutes },
    { prefix: '/v1/dogs', routes: dogRoutes },
    { prefix: '/v1/uploads', routes: uploadsRoutes }
  ]

  for (const config of protectedRouteConfigs) {
    await protectedRoutes(fastify, config)
  }
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

  fastify.get('/health', async () => ({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  }))

  fastify.get('/', async () => ({
    message: 'Stark Health API',
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
