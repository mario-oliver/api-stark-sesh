import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { SubscriptionsController } from '../controllers/subscriptionsController.js'
import { AuthenticatedRequest } from '../types/auth.js'

export default async function subscriptionsRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new SubscriptionsController()

  // Get current user's subscription
  fastify.get('/', {
    handler: async (request, reply) => {
      return controller.getSubscription(request as AuthenticatedRequest, reply)
    }
  })
}
