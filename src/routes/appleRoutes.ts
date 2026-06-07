import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { AppleController } from '../controllers/appleController.js'
import { validate } from '../middleware/validation.js'
import { AuthenticatedRequest } from '../types/auth.js'
import { z } from 'zod'

const verifyTransactionSchema = z.object({
  signedTransaction: z.string().min(1)
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

export default async function appleRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new AppleController()

  fastify.post('/verify-transaction', {
    preHandler: validate(verifyTransactionSchema),
    handler: async (request, reply) => {
      return controller.verifyTransaction(request as AuthenticatedRequest, reply)
    }
  })
}

export async function appleNotificationRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  registerRawBodyParser(fastify)
  const controller = new AppleController()

  fastify.post('/notifications', {
    handler: async (request, reply) => {
      return controller.handleNotification(request, reply)
    }
  })
}
