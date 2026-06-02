import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { CheckoutSessionsController } from '../controllers/checkoutSessionsController.js'
import { AuthenticatedRequest } from '../types/auth.js'

export default async function checkoutSessionsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const controller = new CheckoutSessionsController()

  // Create checkout session
  fastify.post('/', {
    handler: async (request, reply) => {
      return controller.createCheckoutSession(request as AuthenticatedRequest, reply)
    }
  })
}


