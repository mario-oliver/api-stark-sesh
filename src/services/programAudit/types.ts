import { z } from 'zod'
import { randomUUID } from 'crypto'
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
  bucket: z.enum(['ACTIVITY', 'MOBILITY', 'RECOVERY']).optional(),
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
// OpenAI structured output requires every field be present; use null for absent values.

const structuredProposedChangeUpdatesSchema = z.object({
  name: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(2000).nullable(),
  bucket: z.enum(['ACTIVITY', 'MOBILITY', 'RECOVERY']).nullable(),
  frequency: z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']).nullable(),
  timeOfDay: z.enum(['MORNING', 'EVENING', 'ANYTIME']).nullable(),
  instructions: z.string().trim().max(2000).nullable()
})

const structuredProposedChangeSchema = z.object({
  id: z.string().nullable(),
  type: z.enum(['UPDATE', 'DEACTIVATE', 'CREATE']),
  actionId: z.string().nullable(),
  actionName: z.string().nullable(),
  updates: structuredProposedChangeUpdatesSchema.nullable(),
  newAction: proposedExerciseSchema.nullable(),
  reason: z.string().trim().min(1).max(2000)
})

export const refineOutputStructuredSchema = z.object({
  responseType: z.enum(['reply', 'plan']),
  replyContent: z.string().trim().max(4000).nullable(),
  planSummary: z.string().trim().max(4000).nullable(),
  planChanges: z.array(structuredProposedChangeSchema).max(20).nullable()
})

export type RefineOutputStructured = z.infer<typeof refineOutputStructuredSchema>

function stripNullRecord<T extends Record<string, unknown>>(raw: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== null)
  ) as Partial<T>
}

export function normalizeStructuredRefineOutput(
  result: RefineOutputStructured
): { reply?: string; plan?: ProposedProgramChanges } {
  if (result.responseType === 'reply') {
    const content = result.replyContent?.trim()
    if (!content) throw new Error('Model returned reply without content')
    return { reply: content }
  }

  const summary = result.planSummary?.trim()
  const rawChanges = result.planChanges ?? []
  if (!summary || rawChanges.length === 0) {
    throw new Error('Model returned plan without summary or changes')
  }

  const changes = rawChanges.map(change => {
    const updates = change.updates ? stripNullRecord(change.updates) : undefined
    const normalized = {
      id: change.id,
      type: change.type,
      actionId: change.actionId,
      actionName: change.actionName,
      updates: updates && Object.keys(updates).length > 0 ? updates : undefined,
      newAction: change.newAction,
      reason: change.reason
    }
    return proposedChangeSchema.parse({
      ...normalized,
      id:
        normalized.id && /^[0-9a-f-]{36}$/i.test(normalized.id)
          ? normalized.id
          : randomUUID(),
      actionId: normalized.actionId ?? undefined,
      actionName: normalized.actionName ?? undefined,
      newAction: normalized.newAction ?? undefined
    })
  })

  return { plan: { summary, changes } }
}

// ── Shared message/context types ──────────────────────────────────────────────

export type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type AuditActionContext = {
  id: string
  name: string
  bucket: string
  frequency: string
  timeOfDay: string | null
  description: string | null
  instructions: string | null
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
