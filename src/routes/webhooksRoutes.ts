import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { WebhooksController } from '../controllers/webhooksController.js'

export default async function webhooksRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new WebhooksController()

  fastify.post('/', {
    handler: async (request, reply) => {
      return controller.handleWebhook(request, reply)
    }
  })
}
