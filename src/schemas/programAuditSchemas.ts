import { z } from 'zod'

export const programAuditSessionIdParamSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid()
})

export const sendProgramAuditMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000)
})

export const confirmAuditSessionSchema = z.object({
  selectedChangeIds: z.array(z.string().uuid()).optional()
})
