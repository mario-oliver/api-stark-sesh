import { z } from 'zod'
import { proposedExerciseSchema } from '../services/exerciseAgent/types.js'

export const exerciseAgentSessionIdParamSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid()
})

export const createExerciseAgentSessionSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const sendExerciseAgentMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const confirmExerciseAgentSessionSchema = z.object({
  edits: proposedExerciseSchema.partial().optional()
})
