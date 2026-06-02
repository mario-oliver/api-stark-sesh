import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { UsersController } from '../controllers/usersController.js'
import { validate, validateParams, validateQuery } from '../middleware/validation.js'
import { AuthenticatedRequest } from '../types/auth.js'

// Import schemas from shared package
import { userIdParamSchema } from '../schemas/sharedSchemas.js'
import { updateUserSchema, userListQuerySchema } from '../schemas/userSchemas.js'

export default async function usersRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new UsersController()

  // Create user (called during sign-up)
  fastify.post('/', {
    handler: async (request, reply) => {
      return controller.createUser(request as AuthenticatedRequest, reply)
    }
  })

  // Get current user profile
  fastify.get('/me', {
    handler: async (request, reply) => {
      return controller.getProfile(request as AuthenticatedRequest, reply)
    }
  })

  // Update current user profile
  fastify.patch('/me', {
    preHandler: validate(updateUserSchema),
    handler: async (request, reply) => {
      return controller.updateProfile(request as AuthenticatedRequest, reply)
    }
  })

  // List all users (paginated)
  fastify.get('/', {
    preHandler: validateQuery(userListQuerySchema),
    handler: async (request, reply) => {
      return controller.getUsers(request as AuthenticatedRequest, reply)
    }
  })

  // Get specific user by ID
  fastify.get('/:id', {
    preHandler: validateParams(userIdParamSchema),
    handler: async (request, reply) => {
      return controller.getUser(request as AuthenticatedRequest, reply)
    }
  })

  // Update specific user (only the user themselves can update their profile)
  fastify.patch('/:id', {
    preHandler: [validateParams(userIdParamSchema), validate(updateUserSchema)],
    handler: async (request, reply) => {
      return controller.updateUser(request as AuthenticatedRequest, reply)
    }
  })
}
