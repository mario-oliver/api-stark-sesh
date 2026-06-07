import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { StripeController } from '../controllers/stripeController.js'
import { validate } from '../middleware/validation.js'
import { AuthenticatedRequest } from '../types/auth.js'
import { z } from 'zod'

const checkoutSchema = z.object({
  priceId: z.string().min(1)
})

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

function registerRawBodyParser(fastify: FastifyInstance) {
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      req.rawBody = body as Buffer
      try {
        const json = JSON.parse(body.toString('utf8'))
        done(null, json)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )
}

export default async function stripeRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new StripeController()

  fastify.post('/checkout', {
    preHandler: validate(checkoutSchema),
    handler: async (request, reply) => {
      return controller.createCheckout(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/sync', {
    handler: async (request, reply) => {
      return controller.syncSubscription(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/portal', {
    handler: async (request, reply) => {
      return controller.createPortalSession(request as AuthenticatedRequest, reply)
    }
  })
}

export async function stripeWebhookRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  registerRawBodyParser(fastify)
  const controller = new StripeController()

  fastify.post('/webhook', {
    handler: async (request, reply) => {
      return controller.handleWebhook(request, reply)
    }
  })
}
