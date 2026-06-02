import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { UploadsController } from '../controllers/uploadsController.js'
import { validate } from '../middleware/validation.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { presignDogPhotoSchema } from '../schemas/uploadSchemas.js'

export default async function uploadsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const controller = new UploadsController()

  fastify.post('/dog-photo/presign', {
    preHandler: validate(presignDogPhotoSchema),
    handler: async (request, reply) =>
      controller.presignDogPhoto(request as AuthenticatedRequest, reply)
  })
}
