import { z } from 'zod'
import { CareBucket, HealthObservationType, ObservationSeverity, Tolerance } from '../../generated/enums.js'

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
export const careBucketSchema = z.nativeEnum(CareBucket)
export const toleranceSchema = z.nativeEnum(Tolerance)

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

/**
 * One completion as the extraction pass emits it (no server-assigned `changeId`
 * yet) — a caregiver-reported activity matched to one of TODAY'S instantiated
 * `DailyCareAction`s (ADR-0003 #6, issue 0013). `dailyCareActionId` references the
 * planned row the agent matched against (by name + bucket) from the candidate list
 * injected into the prompt; the commit updates THAT row in place. `nameSnapshot` /
 * `bucket` are copied from the matched action so the draft is self-describing.
 * `actualReps` / `actualDurationSeconds` / `tolerance` are `.nullable()` (not
 * `.default`/`.optional`) for the same reason as the observation/ad-hoc fields:
 * keep zod's input type identical to its output so `withStructuredOutput` infers a
 * stable shape and the prompt emits `null` for what it cannot infer.
 */
export const extractedCompletionSchema = z.object({
  dailyCareActionId: z.string().uuid(),
  nameSnapshot: z.string().trim().min(1).max(200),
  bucket: careBucketSchema,
  actualReps: z.number().int().min(0).nullable(),
  actualDurationSeconds: z.number().int().min(0).nullable(),
  tolerance: toleranceSchema.nullable(),
  extractionConfidence: z.number().min(0).max(1),
  needsReview: z.boolean()
})
export type ExtractedCompletion = z.infer<typeof extractedCompletionSchema>

/**
 * One ad-hoc care action as the extraction pass emits it (no server-assigned id
 * yet) — an activity the caregiver reports doing that is NOT matched to a planned
 * action (issue 0012; completion matching of planned actions is 0013). `bucket` is
 * required (it lands on the non-null `DailyCareAction.bucket`); ADR-0003 out-of-scope
 * says an un-inferable bucket is defaulted + flagged `needsReview`, not asked (the
 * `AWAITING_INPUT` round is 0014). `actualReps`/`actualDurationSeconds` are
 * `.nullable()` (not `.default`/`.optional`) for the same reason as the observation
 * fields: keep zod's input type identical to its output so `withStructuredOutput`
 * infers a stable shape and the prompt emits `null` for what it cannot infer.
 */
export const extractedAdHocActionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bucket: careBucketSchema,
  actualReps: z.number().int().min(0).nullable(),
  actualDurationSeconds: z.number().int().min(0).nullable(),
  extractionConfidence: z.number().min(0).max(1),
  needsReview: z.boolean()
})
export type ExtractedAdHocAction = z.infer<typeof extractedAdHocActionSchema>

/** Inert plan-change hint. Scope (0011): emit the empty array only; populated in 0015. */
export const planChangeSuggestionSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  likelyAction: z.string().trim().min(1).max(200).nullable()
})
export type PlanChangeSuggestion = z.infer<typeof planChangeSuggestionSchema>

/** Structured output of the single DAILY_LOG extraction pass. */
export const dailyLogExtractionSchema = z.object({
  completions: z.array(extractedCompletionSchema),
  observations: z.array(extractedObservationSchema),
  adHocActions: z.array(extractedAdHocActionSchema),
  planChangeSuggestions: z.array(planChangeSuggestionSchema),
  message: z.string().trim().max(2000)
})
export type DailyLogExtraction = z.infer<typeof dailyLogExtractionSchema>

/** A draft completion once persisted: extraction fields + a stable `changeId`. */
export const completionDraftSchema = extractedCompletionSchema.extend({
  changeId: z.string().uuid()
})
export type CompletionDraft = z.infer<typeof completionDraftSchema>

/** A draft observation once persisted: extraction fields + a stable `changeId`. */
export const observationDraftSchema = extractedObservationSchema.extend({
  changeId: z.string().uuid()
})
export type ObservationDraft = z.infer<typeof observationDraftSchema>

/** A draft ad-hoc action once persisted: extraction fields + a stable `changeId`. */
export const adHocActionDraftSchema = extractedAdHocActionSchema.extend({
  changeId: z.string().uuid()
})
export type AdHocActionDraft = z.infer<typeof adHocActionDraftSchema>

/** The DAILY_LOG draft envelope stored in `CareAgentSession.draft`. */
export const dailyLogDraftSchema = z.object({
  completions: z.array(completionDraftSchema),
  adHocActions: z.array(adHocActionDraftSchema),
  observations: z.array(observationDraftSchema),
  planChangeSuggestions: z.array(planChangeSuggestionSchema)
})
export type DailyLogDraft = z.infer<typeof dailyLogDraftSchema>

/**
 * One of today's instantiated planned `DailyCareAction`s, as the matching
 * candidate list the extraction pass sees (ADR-0003 #6). The agent matches a
 * reported activity to one of these by `name` + `bucket` and returns its
 * `dailyCareActionId` as a completion; no match → an ad-hoc action instead.
 */
export type PlannedActionContext = {
  dailyCareActionId: string
  name: string
  bucket: string
  status: string
}

/** The transcript-side context loaded from the durable VoiceNote. */
export type TranscriptContext = {
  dogId: string
  dogName: string
  transcript: string
}

/**
 * Full context the extraction pass runs over: the transcript plus today's
 * instantiated planned actions to match completions against (issue 0013).
 */
export type DailyLogContext = TranscriptContext & {
  plannedActions: PlannedActionContext[]
}

export type StoredMessage = { role: 'user' | 'assistant'; content: string }
