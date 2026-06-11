import { z } from 'zod'

/**
 * Request schemas for the unified `/care-agent/sessions` surface. One route
 * family serves every conversational agent flow, discriminated by `kind`
 * (ADR-0002). `DAILY_LOG` is an enum value in the data model but not yet a
 * supported entry point here, so it is intentionally absent from the accepted
 * create kinds — a `DAILY_LOG` create fails validation with 400.
 */

export const careAgentSessionIdParamSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid()
})

export const createCareAgentSessionSchema = z
  .object({
    kind: z.enum(['PLAN_BUILD', 'PLAN_AUDIT']),
    message: z.string().trim().min(1).max(4000).optional()
  })
  .refine(value => value.kind !== 'PLAN_BUILD' || Boolean(value.message), {
    message: 'message is required to start a PLAN_BUILD session',
    path: ['message']
  })

export const sendCareAgentMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const confirmCareAgentSessionSchema = z.object({
  selectedChangeIds: z.array(z.string().uuid()).optional()
})
