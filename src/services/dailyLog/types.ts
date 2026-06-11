import { z } from 'zod'
import { HealthObservationType, ObservationSeverity } from '../../generated/enums.js'

/**
 * DAILY_LOG draft contract (ADR-0003, frozen by issue 0011).
 *
 * The `draft` envelope a DAILY_LOG `CareAgentSession` carries — and that
 * `serializeCareAgentSession` surfaces on the wire — is
 * `{ completions, adHocActions, observations, planChangeSuggestions }`. v1
 * realizes the `observations[]` (extract → review → commit) and emits the other
 * three as present-but-empty arrays: `completions`/`adHocActions` land in
 * 0012/0013, `planChangeSuggestions` is populated in 0015.
 *
 * Enums are derived from the generated Prisma enums so the taxonomy can never
 * drift back — e.g. `MEDICATION` was dropped from `HealthObservationType`
 * (ADR-0002) and cannot be reintroduced here by hand.
 */

export const healthObservationTypeSchema = z.nativeEnum(HealthObservationType)
export const observationSeveritySchema = z.nativeEnum(ObservationSeverity)

/**
 * One observation as the extraction pass emits it (no server-assigned id yet).
 * `severity`/`bodyArea` are `.nullable()` (not `.default(null)`) on purpose: a
 * default makes zod's input type diverge from its output type, and
 * `withStructuredOutput` infers the input type — the prompt instructs the model
 * to emit `null` for fields it cannot infer (mirrors `proposedExerciseSchema`).
 */
export const extractedObservationSchema = z.object({
  type: healthObservationTypeSchema,
  severity: observationSeveritySchema.nullable(),
  bodyArea: z.string().trim().min(1).max(200).nullable(),
  note: z.string().trim().min(1).max(2000),
  extractionConfidence: z.number().min(0).max(1),
  needsReview: z.boolean()
})
export type ExtractedObservation = z.infer<typeof extractedObservationSchema>

/** Inert plan-change hint. Scope (0011): emit the empty array only; populated in 0015. */
export const planChangeSuggestionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  likelyAction: z.string().trim().min(1).max(200).nullable()
})
export type PlanChangeSuggestion = z.infer<typeof planChangeSuggestionSchema>

/** Structured output of the single DAILY_LOG extraction pass. */
export const dailyLogExtractionSchema = z.object({
  observations: z.array(extractedObservationSchema),
  planChangeSuggestions: z.array(planChangeSuggestionSchema),
  message: z.string().trim().max(2000)
})
export type DailyLogExtraction = z.infer<typeof dailyLogExtractionSchema>

/** A draft observation once persisted: extraction fields + a stable `changeId`. */
export const observationDraftSchema = extractedObservationSchema.extend({
  changeId: z.string().uuid()
})
export type ObservationDraft = z.infer<typeof observationDraftSchema>

/** The DAILY_LOG draft envelope stored in `CareAgentSession.draft`. */
export const dailyLogDraftSchema = z.object({
  completions: z.array(z.unknown()),
  adHocActions: z.array(z.unknown()),
  observations: z.array(observationDraftSchema),
  planChangeSuggestions: z.array(planChangeSuggestionSchema)
})
export type DailyLogDraft = z.infer<typeof dailyLogDraftSchema>

/** Minimal context the extraction pass runs over. */
export type DailyLogContext = {
  dogId: string
  dogName: string
  transcript: string
}

export type StoredMessage = { role: 'user' | 'assistant'; content: string }
