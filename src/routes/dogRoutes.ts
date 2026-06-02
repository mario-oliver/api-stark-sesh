import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { DogsController } from '../controllers/dogsController.js'
import { DailyCareController } from '../controllers/dailyCareController.js'
import { VoiceNotesController } from '../controllers/voiceNotesController.js'
import { validate, validateParams, validateQuery } from '../middleware/validation.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  addDogMemberSchema,
  createObservationSchema,
  dogActionIdParamSchema,
  dogIdParamSchema,
  dogNoteIdParamSchema,
  dogObsIdParamSchema,
  historyQuerySchema,
  todayQuerySchema,
  updateDailyActionSchema,
  updateObservationSchema
} from '../schemas/dogSchemas.js'

export default async function dogRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const dogs = new DogsController()
  const dailyCare = new DailyCareController()
  const voiceNotes = new VoiceNotesController()

  fastify.get('/', {
    handler: async (request, reply) => dogs.listDogs(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) => dogs.getDog(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/today', {
    preHandler: [validateParams(dogIdParamSchema), validateQuery(todayQuerySchema)],
    handler: async (request, reply) => dogs.getToday(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/history', {
    preHandler: [validateParams(dogIdParamSchema), validateQuery(historyQuerySchema)],
    handler: async (request, reply) => dogs.getHistory(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/members', {
    preHandler: [validateParams(dogIdParamSchema), validate(addDogMemberSchema)],
    handler: async (request, reply) => dogs.addMember(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/voice-notes/transcribe', {
    preHandler: validateParams(dogIdParamSchema),
    config: { bodyLimit: 26 * 1024 * 1024 },
    handler: async (request, reply) =>
      voiceNotes.transcribeAndStore(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/voice-notes/:noteId', {
    preHandler: validateParams(dogNoteIdParamSchema),
    handler: async (request, reply) =>
      voiceNotes.getVoiceNote(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/daily-actions/:actionId', {
    preHandler: [validateParams(dogActionIdParamSchema), validate(updateDailyActionSchema)],
    handler: async (request, reply) =>
      dailyCare.updateDailyAction(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/observations', {
    preHandler: [validateParams(dogIdParamSchema), validate(createObservationSchema)],
    handler: async (request, reply) =>
      dailyCare.createObservation(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/observations/:obsId', {
    preHandler: [validateParams(dogObsIdParamSchema), validate(updateObservationSchema)],
    handler: async (request, reply) =>
      dailyCare.updateObservation(request as AuthenticatedRequest, reply)
  })
}
