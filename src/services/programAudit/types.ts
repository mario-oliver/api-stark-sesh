import { z } from 'zod'
import { proposedExerciseSchema } from '../exerciseAgent/types.js'

// ── Audit report ──────────────────────────────────────────────────────────────

export const auditObservationSchema = z.object({
  actionId: z.string(),
  actionName: z.string(),
  finding: z.string().trim().min(1).max(2000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  recommendation: z.string().trim().min(1).max(2000)
})

export const auditReportSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  strengths: z.array(z.string().trim().min(1).max(1000)).max(10),
  gaps: z.array(z.string().trim().min(1).max(1000)).max(10),
  observations: z.array(auditObservationSchema).max(20),
  overallRating: z.enum(['GOOD', 'FAIR', 'NEEDS_WORK'])
})

export type AuditReport = z.infer<typeof auditReportSchema>
export type AuditObservation = z.infer<typeof auditObservationSchema>

// ── Proposed changes ──────────────────────────────────────────────────────────

const proposedChangeUpdatesSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z
    .enum(['STRETCH', 'STRENGTH', 'MOBILITY', 'WALK', 'GENERAL_CARE', 'OBSERVATION_CHECKPOINT'])
    .optional(),
  frequency: z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']).optional(),
  timeOfDay: z.enum(['MORNING', 'EVENING', 'ANYTIME']).nullable().optional(),
  instructions: z.string().trim().max(2000).nullable().optional()
})

export const proposedChangeSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['UPDATE', 'DEACTIVATE', 'CREATE']),
  actionId: z.string().optional(),
  actionName: z.string().optional(),
  updates: proposedChangeUpdatesSchema.optional(),
  newAction: proposedExerciseSchema.optional(),
  reason: z.string().trim().min(1).max(2000)
})

export const proposedProgramChangesSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  changes: z.array(proposedChangeSchema).min(1).max(20)
})

export type ProposedChange = z.infer<typeof proposedChangeSchema>
export type ProposedChangeUpdates = z.infer<typeof proposedChangeUpdatesSchema>
export type ProposedProgramChanges = z.infer<typeof proposedProgramChangesSchema>

// ── Graph discriminated output for refineOrPropose node ───────────────────────

export const refineOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('reply'),
    content: z.string().trim().min(1).max(4000)
  }),
  z.object({
    type: z.literal('plan'),
    summary: z.string().trim().min(1).max(4000),
    changes: z.array(proposedChangeSchema).min(1).max(20)
  })
])

export type RefineOutput = z.infer<typeof refineOutputSchema>

// ── Shared message/context types ──────────────────────────────────────────────

export type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AuditActionContext = {
  id: string
  name: string
  category: string
  frequency: string
  timeOfDay: string | null
  description: string | null
  instructions: string | null
  steps: Array<{ name: string; instructions: string | null }>
}

export type AuditDogContext = {
  dogId: string
  dogName: string
  breed: string | null
  age: number | null
  condition: string | null
  notes: string | null
  actions: AuditActionContext[]
}

export type AuditGraphState = {
  dogContext: AuditDogContext
  messages: StoredMessage[]
  report: AuditReport | null
  plan: ProposedProgramChanges | null
  phase: 'analyze' | 'refine' | 'done'
}
