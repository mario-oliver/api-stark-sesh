import { z } from 'zod'

/**
 * Request schemas for the unified `/care-agent/sessions` surface. One route
 * family serves every conversational agent flow, discriminated by `kind`
 * (ADR-0002). Each kind carries its own required input: `PLAN_BUILD` needs a
 * `message`, `DAILY_LOG` needs the `voiceNoteId` of the transcript it extracts
 * over (ADR-0003). A create missing its kind's required field fails validation
 * with 400.
 */

export const careAgentSessionIdParamSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid()
})

export const createCareAgentSessionSchema = z
  .object({
    kind: z.enum(['PLAN_BUILD', 'PLAN_AUDIT', 'DAILY_LOG']),
    message: z.string().trim().min(1).max(4000).optional(),
    voiceNoteId: z.string().uuid().optional()
  })
  .refine(value => value.kind !== 'PLAN_BUILD' || Boolean(value.message), {
    message: 'message is required to start a PLAN_BUILD session',
    path: ['message']
  })
  .refine(value => value.kind !== 'DAILY_LOG' || Boolean(value.voiceNoteId), {
    message: 'voiceNoteId is required to start a DAILY_LOG session',
    path: ['voiceNoteId']
  })

export const sendCareAgentMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const confirmCareAgentSessionSchema = z.object({
  selectedChangeIds: z.array(z.string().uuid()).optional()
})
