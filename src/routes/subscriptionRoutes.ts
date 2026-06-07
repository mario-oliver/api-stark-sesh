import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { SubscriptionController } from '../controllers/subscriptionController.js'
import { AuthenticatedRequest } from '../types/auth.js'

export default async function subscriptionRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new SubscriptionController()

  fastify.get('/', {
    handler: async (request, reply) => {
      return controller.getSubscription(request as AuthenticatedRequest, reply)
    }
  })
}
