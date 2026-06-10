import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { DogsController } from '../controllers/dogsController.js'
import { DailyCareController } from '../controllers/dailyCareController.js'
import { CarePlansController } from '../controllers/carePlansController.js'
import { VoiceNotesController } from '../controllers/voiceNotesController.js'
import { ExerciseAgentController } from '../controllers/exerciseAgentController.js'
import { ProgramAuditController } from '../controllers/programAuditController.js'
import { validate, validateParams, validateQuery } from '../middleware/validation.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  addDogMemberSchema,
  calendarQuerySchema,
  createCareActionSchema,
  createDogSchema,
  joinByShareCodeSchema,
  joinPreviewQuerySchema,
  createObservationSchema,
  dogActionIdParamSchema,
  dogCareActionIdParamSchema,
  dogIdParamSchema,
  dogNoteIdParamSchema,
  dogObsIdParamSchema,
  historyQuerySchema,
  todayQuerySchema,
  updateCareActionSchema,
  updateCarePlanSchema,
  updateDailyActionSchema,
  updateDailyTaskSchema,
  createDailyTaskSchema,
  reviewDailyTaskSchema,
  dogDailyTaskIdParamSchema,
  dogDailyLogIdParamSchema,
  updateDogSchema,
  updateObservationSchema
} from '../schemas/dogSchemas.js'
import {
  confirmExerciseAgentSessionSchema,
  createExerciseAgentSessionSchema,
  exerciseAgentSessionIdParamSchema,
  sendExerciseAgentMessageSchema
} from '../schemas/exerciseAgentSchemas.js'
import {
  confirmProgramAuditSessionSchema,
  programAuditSessionIdParamSchema,
  sendProgramAuditMessageSchema
} from '../schemas/programAuditSchemas.js'
import { createSpriteSessionSchema } from '../schemas/spriteGenSchemas.js'
import { SpriteGenController } from '../controllers/spriteGenController.js'

export default async function dogRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const dogs = new DogsController()
  const dailyCare = new DailyCareController()
  const carePlans = new CarePlansController()
  const voiceNotes = new VoiceNotesController()
  const exerciseAgent = new ExerciseAgentController()
  const programAudit = new ProgramAuditController()
  const spriteGen = new SpriteGenController()

  fastify.get('/', {
    handler: async (request, reply) => dogs.listDogs(request as AuthenticatedRequest, reply)
  })

  fastify.post('/', {
    preHandler: validate(createDogSchema),
    handler: async (request, reply) => dogs.createDog(request as AuthenticatedRequest, reply)
  })

  fastify.get('/join/preview', {
    preHandler: validateQuery(joinPreviewQuerySchema),
    handler: async (request, reply) => dogs.previewJoin(request as AuthenticatedRequest, reply)
  })

  fastify.post('/join', {
    preHandler: validate(joinByShareCodeSchema),
    handler: async (request, reply) => dogs.joinByShareCode(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) => dogs.getDog(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/photo', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) => dogs.getDogPhoto(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id', {
    preHandler: [validateParams(dogIdParamSchema), validate(updateDogSchema)],
    handler: async (request, reply) => dogs.updateDog(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/today', {
    preHandler: [validateParams(dogIdParamSchema), validateQuery(todayQuerySchema)],
    handler: async (request, reply) => dogs.getToday(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/history', {
    preHandler: [validateParams(dogIdParamSchema), validateQuery(historyQuerySchema)],
    handler: async (request, reply) => dogs.getHistory(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/care-plan', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) => carePlans.getCarePlan(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/care-plan', {
    preHandler: [validateParams(dogIdParamSchema), validate(updateCarePlanSchema)],
    handler: async (request, reply) => carePlans.updateCarePlan(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/exercise-agent/sessions', {
    preHandler: [
      validateParams(dogIdParamSchema),
      validate(createExerciseAgentSessionSchema)
    ],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (request, reply) =>
      exerciseAgent.createSession(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/exercise-agent/sessions/:sessionId', {
    preHandler: validateParams(exerciseAgentSessionIdParamSchema),
    handler: async (request, reply) =>
      exerciseAgent.getSession(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/exercise-agent/sessions/:sessionId/messages', {
    preHandler: [
      validateParams(exerciseAgentSessionIdParamSchema),
      validate(sendExerciseAgentMessageSchema)
    ],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (request, reply) =>
      exerciseAgent.sendMessage(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/exercise-agent/sessions/:sessionId/confirm', {
    preHandler: [
      validateParams(exerciseAgentSessionIdParamSchema),
      validate(confirmExerciseAgentSessionSchema)
    ],
    handler: async (request, reply) =>
      exerciseAgent.confirmSession(request as AuthenticatedRequest, reply)
  })

  fastify.delete('/:id/exercise-agent/sessions/:sessionId', {
    preHandler: validateParams(exerciseAgentSessionIdParamSchema),
    handler: async (request, reply) =>
      exerciseAgent.cancelSession(request as AuthenticatedRequest, reply)
  })

  // ── Program Audit Agent ────────────────────────────────────────────────────

  fastify.post('/:id/program-audit/sessions', {
    preHandler: validateParams(dogIdParamSchema),
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    handler: async (request, reply) =>
      programAudit.createSession(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/program-audit/sessions/:sessionId', {
    preHandler: validateParams(programAuditSessionIdParamSchema),
    handler: async (request, reply) =>
      programAudit.getSession(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/program-audit/sessions/:sessionId/messages', {
    preHandler: [
      validateParams(programAuditSessionIdParamSchema),
      validate(sendProgramAuditMessageSchema)
    ],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (request, reply) =>
      programAudit.sendMessage(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/program-audit/sessions/:sessionId/confirm', {
    preHandler: [
      validateParams(programAuditSessionIdParamSchema),
      validate(confirmProgramAuditSessionSchema)
    ],
    handler: async (request, reply) =>
      programAudit.confirmSession(request as AuthenticatedRequest, reply)
  })

  fastify.delete('/:id/program-audit/sessions/:sessionId', {
    preHandler: validateParams(programAuditSessionIdParamSchema),
    handler: async (request, reply) =>
      programAudit.cancelSession(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/care-plan/actions', {
    preHandler: [validateParams(dogIdParamSchema), validate(createCareActionSchema)],
    handler: async (request, reply) => carePlans.createAction(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/care-plan/actions/:actionId', {
    preHandler: [
      validateParams(dogCareActionIdParamSchema),
      validate(updateCareActionSchema)
    ],
    handler: async (request, reply) => carePlans.updateAction(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/care-plan/actions/:actionId/deactivate', {
    preHandler: validateParams(dogCareActionIdParamSchema),
    handler: async (request, reply) =>
      carePlans.deactivateAction(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/calendar', {
    preHandler: [validateParams(dogIdParamSchema), validateQuery(calendarQuerySchema)],
    handler: async (request, reply) => carePlans.getCalendar(request as AuthenticatedRequest, reply)
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

  fastify.patch('/:id/daily-tasks/:taskId', {
    preHandler: [validateParams(dogDailyTaskIdParamSchema), validate(updateDailyTaskSchema)],
    handler: async (request, reply) =>
      dailyCare.updateDailyTaskHandler(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/daily-tasks', {
    preHandler: [validateParams(dogIdParamSchema), validate(createDailyTaskSchema)],
    handler: async (request, reply) =>
      dailyCare.createDailyTaskHandler(request as AuthenticatedRequest, reply)
  })

  fastify.patch('/:id/daily-tasks/:taskId/review', {
    preHandler: [validateParams(dogDailyTaskIdParamSchema), validate(reviewDailyTaskSchema)],
    handler: async (request, reply) =>
      dailyCare.reviewDailyTaskHandler(request as AuthenticatedRequest, reply)
  })

  fastify.post('/:id/daily-logs/:logId/recompute-scores', {
    preHandler: validateParams(dogDailyLogIdParamSchema),
    handler: async (request, reply) =>
      dailyCare.recomputeScores(request as AuthenticatedRequest, reply)
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

  // ── Sprite Generation ────────────────────────────────────────────────────────

  fastify.post('/:id/sprite-sessions', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    preHandler: [validateParams(dogIdParamSchema), validate(createSpriteSessionSchema)],
    handler: async (request, reply) =>
      spriteGen.createSession(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/sprite-sessions/:sessionId', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) =>
      spriteGen.getSession(request as AuthenticatedRequest, reply)
  })

  fastify.delete('/:id/sprite-sessions/:sessionId', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) =>
      spriteGen.cancelSession(request as AuthenticatedRequest, reply)
  })

  fastify.get('/:id/sprite-set', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) =>
      spriteGen.getSpriteSet(request as AuthenticatedRequest, reply)
  })

  // Serves individual frames — cached immutably in browser
  fastify.get('/:id/sprites/:animation/:frame', {
    preHandler: validateParams(dogIdParamSchema),
    handler: async (request, reply) =>
      spriteGen.streamFrame(request as AuthenticatedRequest, reply)
  })
}
