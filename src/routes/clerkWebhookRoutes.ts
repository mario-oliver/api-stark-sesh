import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ClerkWebhookController } from '../controllers/clerkWebhookController.js'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer
  }
}

export default async function clerkWebhookRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
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

  const controller = new ClerkWebhookController()

  fastify.post('/', {
    handler: async (request, reply) => {
      return controller.handleWebhook(request, reply)
    }
  })
}
