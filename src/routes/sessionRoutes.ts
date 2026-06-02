import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { SessionsController } from '../controllers/sessionsController.js'
import { validate, validateParams } from '../middleware/validation.js'
import { AuthenticatedRequest } from '../types/auth.js'
import {
  addDrillBodySchema,
  createSessionSchema,
  drillFromTranscriptSchema,
  drillIdParamSchema,
  derivedStatLineParamsSchema,
  editDerivedStatLineSchema,
  generatePracticePlanSchema,
  patchSessionStatMetricParamsSchema,
  patchSessionStatMetricSchema,
  replacePracticePlanSchema,
  rerunGameStatsSchema,
  rerunObservationParamsSchema,
  resolveUnrecognizedNameSchema,
  reviewDerivedStatLineSchema,
  sessionIdParamSchema,
  sessionPlayerObservationParamsSchema,
  upsertSessionStatsSchema,
  updateObservationParamsSchema,
  updateObservationSchema,
  updateDrillBodySchema
} from '../schemas/sessionSchemas.js'
import { userIdParamSchema } from '../schemas/sharedSchemas.js'

export default async function sessionRoutes(fastify: FastifyInstance, _options: FastifyPluginOptions) {
  const controller = new SessionsController()

  fastify.post('/', {
    preHandler: validate(createSessionSchema),
    handler: async (request, reply) => {
      return controller.createSession(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id/plan', {
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.getPracticePlan(request as AuthenticatedRequest, reply)
    }
  })

  fastify.put('/:id/plan', {
    preHandler: [validateParams(sessionIdParamSchema), validate(replacePracticePlanSchema)],
    handler: async (request, reply) => {
      return controller.replacePracticePlan(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/plan/generate', {
    preHandler: [validateParams(sessionIdParamSchema), validate(generatePracticePlanSchema)],
    handler: async (request, reply) => {
      return controller.generatePracticePlan(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/plan/drills', {
    preHandler: [validateParams(sessionIdParamSchema), validate(addDrillBodySchema)],
    handler: async (request, reply) => {
      return controller.addPracticeDrill(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/plan/drills/from-transcript', {
    preHandler: [validateParams(sessionIdParamSchema), validate(drillFromTranscriptSchema)],
    handler: async (request, reply) => {
      return controller.createDrillFromTranscript(request as AuthenticatedRequest, reply)
    }
  })

  fastify.patch('/:id/plan/drills/:drillId', {
    preHandler: [validateParams(drillIdParamSchema), validate(updateDrillBodySchema)],
    handler: async (request, reply) => {
      return controller.updatePracticeDrill(request as AuthenticatedRequest, reply)
    }
  })

  fastify.delete('/:id/plan/drills/:drillId', {
    preHandler: validateParams(drillIdParamSchema),
    handler: async (request, reply) => {
      return controller.deletePracticeDrill(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id/observations/player/:teamMemberId', {
    preHandler: validateParams(sessionPlayerObservationParamsSchema),
    handler: async (request, reply) => {
      return controller.getPlayerObservationView(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id', {
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.getSession(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/users/:id', {
    preHandler: validateParams(userIdParamSchema),
    handler: async (request, reply) => {
      return controller.getSessions(request as AuthenticatedRequest, reply)
    }
  })

  fastify.patch('/:id/observations/:observationId', {
    preHandler: [validateParams(updateObservationParamsSchema), validate(updateObservationSchema)],
    handler: async (request, reply) => {
      return controller.updateObservation(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/transcribe', {
    config: { bodyLimit: 26 * 1024 * 1024 },
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.transcribeAndStore(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id/stats', {
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.getSessionStats(request as AuthenticatedRequest, reply)
    }
  })

  fastify.put('/:id/stats', {
    preHandler: [validateParams(sessionIdParamSchema), validate(upsertSessionStatsSchema)],
    handler: async (request, reply) => {
      return controller.replaceSessionStats(request as AuthenticatedRequest, reply)
    }
  })

  fastify.patch('/:id/stats/:playerId/:metric', {
    preHandler: [
      validateParams(patchSessionStatMetricParamsSchema),
      validate(patchSessionStatMetricSchema)
    ],
    handler: async (request, reply) => {
      return controller.patchSessionStatMetric(request as AuthenticatedRequest, reply)
    }
  })

  fastify.get('/:id/observation-jobs', {
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.getObservationJobs(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/observations/:observationId/rerun', {
    preHandler: validateParams(rerunObservationParamsSchema),
    handler: async (request, reply) => {
      return controller.rerunObservationProcessing(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/observations/:observationId/unrecognized-name/resolve', {
    preHandler: [validateParams(rerunObservationParamsSchema), validate(resolveUnrecognizedNameSchema)],
    handler: async (request, reply) => {
      return controller.resolveUnrecognizedName(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/stats/rerun', {
    preHandler: [validateParams(sessionIdParamSchema), validate(rerunGameStatsSchema)],
    handler: async (request, reply) => {
      return controller.rerunGameStats(request as AuthenticatedRequest, reply)
    }
  })

  fastify.patch('/:id/stats/lines/:lineId', {
    preHandler: [validateParams(derivedStatLineParamsSchema), validate(editDerivedStatLineSchema)],
    handler: async (request, reply) => {
      return controller.editDerivedStatLine(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/stats/lines/:lineId/approve', {
    preHandler: [validateParams(derivedStatLineParamsSchema), validate(reviewDerivedStatLineSchema)],
    handler: async (request, reply) => {
      return controller.approveDerivedStatLine(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/stats/lines/:lineId/reject', {
    preHandler: [validateParams(derivedStatLineParamsSchema), validate(reviewDerivedStatLineSchema)],
    handler: async (request, reply) => {
      return controller.rejectDerivedStatLine(request as AuthenticatedRequest, reply)
    }
  })

  fastify.post('/:id/stats/transcribe', {
    config: { bodyLimit: 26 * 1024 * 1024 },
    preHandler: validateParams(sessionIdParamSchema),
    handler: async (request, reply) => {
      return controller.transcribeAndStoreStats(request as AuthenticatedRequest, reply)
    }
  })
}
