import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { VideoClipsController } from '../controllers/videoClipsController.js'
import { validate, validateParams } from '../middleware/validation.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { dogIdParamSchema } from '../schemas/dogSchemas.js'
import {
  dogClipIdParamSchema,
  presignVideoClipSchema,
  registerVideoClipSchema
} from '../schemas/videoClipSchemas.js'

/**
 * VideoClip routes (issue 0022 — frozen contract; web and iOS mock against
 * these paths verbatim). Registered inside dogRoutes, i.e. inside the
 * protected /v1/dogs group, so requireAuth applies; each handler then enforces
 * assertDogMemberAccess.
 */
export default async function videoClipRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const videoClips = new VideoClipsController()

  fastify.post('/:id/video-clips/presign', {
    preHandler: [validateParams(dogIdParamSchema), validate(presignVideoClipSchema)],
    handler: async (request, reply) =>
      videoClips.presign(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/video-clips', {
    preHandler: [validateParams(dogIdParamSchema), validate(registerVideoClipSchema)],
    handler: async (request, reply) =>
      videoClips.register(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/video-clips/:clipId/url', {
    preHandler: validateParams(dogClipIdParamSchema),
    handler: async (request, reply) =>
      videoClips.getUrl(request as AuthenticatedRequest, reply)
  })

  fastify.delete('/:id/video-clips/:clipId', {
    preHandler: validateParams(dogClipIdParamSchema),
    handler: async (request, reply) =>
      videoClips.remove(request as AuthenticatedRequest, reply)
  })
}
