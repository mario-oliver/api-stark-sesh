import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { resolveTodayLog } from '../dailyCare/resolveTodayLog.js'
import { todayUtcDateString } from '../dailyCare/dateUtils.js'
import {
  createCareAgentSession,
  deleteCareAgentSession,
  findCareAgentSession,
  parseStoredMessages,
  updateCareAgentSession
} from '../careAgentSession/sessionRepository.js'
import { loadDailyLogContext } from './dailyLogContext.js'
import { runDailyLogExtraction } from './extraction.js'
import {
  adHocActionDraftSchema,
  completionDraftSchema,
  observationDraftSchema,
  planChangeSuggestionSchema,
  type AdHocActionDraft,
  type CompletionDraft,
  type DailyLogDraft,
  type DailyLogExtraction,
  type ObservationDraft,
  type PlannedActionContext,
  type StoredMessage
} from './types.js'

/** This flow is the DAILY_LOG entry into the unified CareAgentSession (ADR-0003). */
const KIND = 'DAILY_LOG' as const

// ── Draft envelope (DAILY_LOG) ────────────────────────────────────────────────
// The unified `draft` column stores the review envelope
// `{ completions, adHocActions, observations, planChangeSuggestions }`. v1 fills
// `observations` (0011), `adHocActions` (0012), and `completions` (0013);
// `planChangeSuggestions` lands in 0015.

function decodeDailyLogDraft(raw: unknown): DailyLogDraft {
  if (!raw || typeof raw !== 'object') {
    return { completions: [], adHocActions: [], observations: [], planChangeSuggestions: [] }
  }
  const d = raw as Record<string, unknown>

  const completions = Array.isArray(d.completions)
    ? d.completions.flatMap(c => {
        const parsed = completionDraftSchema.safeParse(c)
        return parsed.success ? [parsed.data] : []
      })
    : []

  const observations = Array.isArray(d.observations)
    ? d.observations.flatMap(o => {
        const parsed = observationDraftSchema.safeParse(o)
        return parsed.success ? [parsed.data] : []
      })
    : []

  const adHocActions = Array.isArray(d.adHocActions)
    ? d.adHocActions.flatMap(a => {
        const parsed = adHocActionDraftSchema.safeParse(a)
        return parsed.success ? [parsed.data] : []
      })
    : []

  const planChangeSuggestions = Array.isArray(d.planChangeSuggestions)
    ? d.planChangeSuggestions.flatMap(p => {
        const parsed = planChangeSuggestionSchema.safeParse(p)
        return parsed.success ? [parsed.data] : []
      })
    : []

  return {
    completions,
    adHocActions,
    observations,
    planChangeSuggestions
  }
}

function encodeDailyLogDraft(draft: DailyLogDraft): Prisma.InputJsonValue {
  return {
    completions: draft.completions,
    adHocActions: draft.adHocActions,
    observations: draft.observations,
    planChangeSuggestions: draft.planChangeSuggestions
  } as Prisma.InputJsonValue
}

/**
 * Today's instantiated planned actions, as the matching candidate list for the
 * extraction pass (ADR-0003 #6). Drawn from `resolveTodayLog` (the single
 * instantiation owner) — planned rows are the instantiated ones (`careActionId`
 * not null); ad-hoc rows (`careActionId: null`) are never completion targets.
 */
function todaysPlannedActions(payload: unknown): PlannedActionContext[] {
  const actions = (payload as { dailyLog?: { dailyCareActions?: unknown } } | null)?.dailyLog
    ?.dailyCareActions
  if (!Array.isArray(actions)) return []
  return actions
    .filter(
      (a): a is { id: string; careActionId: string | null; nameSnapshot: string; bucket: string; status: string } =>
        !!a && typeof a === 'object' && (a as { careActionId?: unknown }).careActionId != null
    )
    .map(a => ({
      dailyCareActionId: a.id,
      name: a.nameSnapshot,
      bucket: a.bucket,
      status: a.status
    }))
}

/**
 * Collapse selected completions by `dailyCareActionId` so one matched row gets a
 * single in-place update even if the draft names it twice, merging actuals so a
 * later non-null value wins (ADR-0003 #7 — "merges later actuals"). The
 * cross-session convergence (re-logging in a new session) is handled by the
 * `@@unique([dailyCareLogId, careActionId])` row being reused by `resolveTodayLog`;
 * this is the within-draft companion.
 */
function mergeCompletionsById(completions: CompletionDraft[]): CompletionDraft[] {
  const byId = new Map<string, CompletionDraft>()
  for (const c of completions) {
    const prev = byId.get(c.dailyCareActionId)
    byId.set(
      c.dailyCareActionId,
      prev
        ? {
            ...prev,
            ...c,
            actualReps: c.actualReps ?? prev.actualReps,
            actualDurationSeconds: c.actualDurationSeconds ?? prev.actualDurationSeconds,
            tolerance: c.tolerance ?? prev.tolerance
          }
        : c
    )
  }
  return [...byId.values()]
}

/**
 * Select draft items for commit: an explicit non-empty `selectedChangeIds` curates
 * the formed draft (ADR-0003 #3); absent/empty selection commits the whole draft.
 * The two daily outputs (observations, ad-hoc actions) share one selection list
 * because one confirm commits the whole day's log in a single transaction.
 */
function selectByChangeIds<T extends { changeId: string }>(
  items: T[],
  selectedChangeIds: string[] | undefined
): T[] {
  return selectedChangeIds && selectedChangeIds.length > 0
    ? items.filter(i => selectedChangeIds.includes(i.changeId))
    : items
}

/**
 * Turn an extraction result into the stored draft envelope: keep only completions
 * matched to a REAL instantiated planned action (drop hallucinated ids server-side,
 * ADR-0003 #6) and stamp a stable `changeId` on every reviewable item. Shared by the
 * create pass and the one-round resolution pass (issue 0014) so both build the draft
 * identically; blockers live outside the draft, in `questions[]`.
 */
function buildDailyLogDraft(
  extraction: DailyLogExtraction,
  plannedActions: PlannedActionContext[]
): DailyLogDraft {
  const plannedIds = new Set(plannedActions.map(p => p.dailyCareActionId))
  const completions: CompletionDraft[] = extraction.completions
    .filter(c => plannedIds.has(c.dailyCareActionId))
    .map(c => ({ changeId: randomUUID(), ...c }))
  const observations: ObservationDraft[] = extraction.observations.map(o => ({
    changeId: randomUUID(),
    ...o
  }))
  const adHocActions: AdHocActionDraft[] = extraction.adHocActions.map(a => ({
    changeId: randomUUID(),
    ...a
  }))
  return {
    completions,
    adHocActions,
    observations,
    planChangeSuggestions: extraction.planChangeSuggestions
  }
}

/** One assistant turn from the extraction `message`, or no turn at all. */
function agentMessages(message: string): StoredMessage[] {
  return message.trim() ? [{ role: 'assistant', content: message.trim() }] : []
}

// ── Create: transcript → extraction → reviewable draft ─────────────────────────

export async function createDailyLogSession(args: {
  dogId: string
  userId: string
  voiceNoteId: string
}) {
  const transcriptContext = await loadDailyLogContext({
    dogId: args.dogId,
    voiceNoteId: args.voiceNoteId
  })
  if (!transcriptContext) throw new Error('VoiceNote not found')

  // ADR-0003 #6: matching runs against TODAY'S instantiated planned actions.
  // resolveTodayLog is the single instantiation owner — reuse it (not re-instantiate)
  // and feed its planned rows to the extraction pass as the candidate match list.
  const today = await resolveTodayLog(args.dogId, todayUtcDateString())
  const plannedActions = todaysPlannedActions(today)
  const context = { ...transcriptContext, plannedActions }

  let extraction
  try {
    extraction = await runDailyLogExtraction({ context })
  } catch (err) {
    // ADR-0003 decision 10: extraction error → session FAILED; the VoiceNote's
    // processingStatus is left untouched (transcription already succeeded).
    const error = err instanceof Error ? err.message : 'Extraction failed'
    const session = await createCareAgentSession({
      dogId: args.dogId,
      userId: args.userId,
      kind: KIND,
      status: 'FAILED',
      messages: [],
      voiceNoteId: args.voiceNoteId
    })
    return { session, error }
  }

  // Dropping unknown ids enforces "no bogus completion" server-side even if the
  // model hallucinates an id (ADR-0003 #6; issue 0013 acceptance criterion 4). The
  // partial draft holds whatever WAS placeable; a blocked item is absent here and
  // described by `questions[]` instead.
  const draft = buildDailyLogDraft(extraction, plannedActions)

  // ADR-0003 decision 5 — blocked-only, one round. A genuine blocker (a completion
  // ambiguous between multiple planned actions, or an un-inferable required field) →
  // AWAITING_INPUT with the question(s); the draft is NOT finalized for confirm.
  // Soft uncertainty never reaches here (it rides `needsReview` in the draft).
  if (extraction.questions.length > 0) {
    const session = await createCareAgentSession({
      dogId: args.dogId,
      userId: args.userId,
      kind: KIND,
      status: 'AWAITING_INPUT',
      messages: agentMessages(extraction.message),
      questions: extraction.questions,
      draft: encodeDailyLogDraft(draft),
      voiceNoteId: args.voiceNoteId
    })
    return { session, error: null }
  }

  // Nothing loggable → DRAFT_READY with an empty draft + an agent message
  // (ADR-0003 decision 9). FAILED is reserved for real extraction errors above.
  const session = await createCareAgentSession({
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: 'DRAFT_READY',
    messages: agentMessages(extraction.message),
    questions: [],
    draft: encodeDailyLogDraft(draft),
    voiceNoteId: args.voiceNoteId
  })

  return { session, error: null }
}

// ── Send a reply: resolve the one clarifying round → DRAFT_READY ────────────────

/**
 * The one round of AWAITING_INPUT (ADR-0003 decision 5, issue 0014). The caregiver's
 * reply to the blocking question re-runs extraction in RESOLUTION mode (original
 * transcript + their answer) and resolves to DRAFT_READY best-effort. The round is
 * capped: any further question the model emits is ignored — remaining uncertainty
 * rides `needsReview` — so a DAILY_LOG session never re-enters AWAITING_INPUT.
 */
export async function sendDailyLogMessage(args: {
  dogId: string
  userId: string
  sessionId: string
  message: string
}) {
  const session = await findCareAgentSession({
    id: args.sessionId,
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: 'AWAITING_INPUT'
  })
  if (!session) throw new Error('Session not found or not awaiting input')

  const priorQuestions = Array.isArray(session.questions) ? (session.questions as string[]) : []
  const answer = args.message.trim()
  const messages: StoredMessage[] = [
    ...parseStoredMessages(session.messages),
    { role: 'user', content: answer }
  ]

  // Re-derive context from the DURABLE VoiceNote (the session is transient) plus
  // today's planned actions, exactly as the create pass did.
  if (!session.voiceNoteId) throw new Error('VoiceNote not found')
  const transcriptContext = await loadDailyLogContext({
    dogId: args.dogId,
    voiceNoteId: session.voiceNoteId
  })
  if (!transcriptContext) throw new Error('VoiceNote not found')
  const today = await resolveTodayLog(args.dogId, todayUtcDateString())
  const plannedActions = todaysPlannedActions(today)
  const context = { ...transcriptContext, plannedActions }

  let extraction
  try {
    extraction = await runDailyLogExtraction({
      context,
      clarification: { questions: priorQuestions, answer }
    })
  } catch (err) {
    // Mirror create (ADR-0003 #10): a resolution error → FAILED; the durable
    // VoiceNote is left untouched. The user turn is still recorded.
    const error = err instanceof Error ? err.message : 'Extraction failed'
    const updated = await updateCareAgentSession(session.id, { status: 'FAILED', messages })
    return { session: updated, error }
  }

  const draft = buildDailyLogDraft(extraction, plannedActions)
  const updated = await updateCareAgentSession(session.id, {
    status: 'DRAFT_READY',
    messages: [...messages, ...agentMessages(extraction.message)],
    // One round only: clear the questions even if the model emitted more.
    questions: [],
    draft: encodeDailyLogDraft(draft)
  })

  return { session: updated, error: null }
}

// ── Confirm: commit selected observations onto today's log ─────────────────────

export async function confirmDailyLogSession(args: {
  dogId: string
  userId: string
  sessionId: string
  selectedChangeIds?: string[]
}) {
  const session = await findCareAgentSession({
    id: args.sessionId,
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: 'DRAFT_READY'
  })
  if (!session) throw new Error('Session not found or draft not ready')

  const draft = decodeDailyLogDraft(session.draft)
  const selectedObservations = selectByChangeIds(draft.observations, args.selectedChangeIds)
  const selectedAdHocActions = selectByChangeIds(draft.adHocActions, args.selectedChangeIds)
  // Completions update PLANNED rows in place; collapse by id so one row gets a
  // single merged update (ADR-0003 #7).
  const selectedCompletions = mergeCompletionsById(
    selectByChangeIds(draft.completions, args.selectedChangeIds)
  )

  // Reuse the single instantiation owner for today's DailyCareLog (ADR-0003 #6);
  // its own daily-action instantiation runs before the commit transaction below.
  const today = await resolveTodayLog(args.dogId, todayUtcDateString())
  const dailyCareLogId = today.dailyLog.id
  const completedAt = new Date()

  // ADR-0003: the day's outputs commit in ONE transaction — the selected
  // observations, the ad-hoc actions, the completion updates, and the COMMITTED
  // status flip succeed or fail together, so a mid-commit failure can never leave
  // orphan rows on a still-DRAFT_READY session. DAILY_LOG commits HealthObservations /
  // DailyCareActions, not a plan/action (no polymorphic commit FK), so the status
  // flip is inlined here rather than going through commitCareAgentSession.
  const results = await prisma.$transaction([
    ...selectedObservations.map(o =>
      prisma.healthObservation.create({
        data: {
          dogId: args.dogId,
          dailyCareLogId,
          userId: args.userId,
          voiceNoteId: session.voiceNoteId,
          type: o.type,
          severity: o.severity ?? undefined,
          bodyArea: o.bodyArea ?? undefined,
          note: o.note
        }
      })
    ),
    // Ad-hoc rows: an activity the caregiver reports doing that is not matched to a
    // planned action (issue 0012). source LLM_EXTRACTED + careActionId null + the
    // VoiceNote provenance (ADR-0003 #4). careActionId null is allowed alongside
    // @@unique([dailyCareLogId, careActionId]) — Postgres treats NULLs as distinct,
    // so several ad-hoc rows coexist on one log.
    ...selectedAdHocActions.map(a =>
      prisma.dailyCareAction.create({
        data: {
          dailyCareLogId,
          careActionId: null,
          voiceNoteId: session.voiceNoteId,
          bucket: a.bucket,
          source: 'LLM_EXTRACTED',
          nameSnapshot: a.name,
          status: 'COMPLETED',
          completedAt,
          completedByUserId: args.userId,
          actualReps: a.actualReps ?? undefined,
          actualDurationSeconds: a.actualDurationSeconds ?? undefined,
          extractionConfidence: a.extractionConfidence,
          needsReview: a.needsReview
        }
      })
    ),
    // Completion rows: UPDATE the matched planned DailyCareAction IN PLACE (issue
    // 0013, ADR-0003 #6/#7). Keep source PLAN (it stays a planned action), flip it
    // COMPLETED, and stamp actuals + tolerance + the completing VoiceNote. `?? undefined`
    // means a null actual never clobbers a value already on the row, so a later
    // re-log that adds "12 reps" merges rather than wipes. Re-logging in a fresh
    // session converges on this same row via @@unique([dailyCareLogId, careActionId]).
    ...selectedCompletions.map(c =>
      prisma.dailyCareAction.update({
        where: { id: c.dailyCareActionId },
        data: {
          status: 'COMPLETED',
          completedAt,
          completedByUserId: args.userId,
          voiceNoteId: session.voiceNoteId,
          actualReps: c.actualReps ?? undefined,
          actualDurationSeconds: c.actualDurationSeconds ?? undefined,
          tolerance: c.tolerance ?? undefined
        }
      })
    ),
    prisma.careAgentSession.update({
      where: { id: session.id },
      data: { status: 'COMMITTED' }
    })
  ])

  const observations = results.slice(0, selectedObservations.length)
  const adHocActions = results.slice(
    selectedObservations.length,
    selectedObservations.length + selectedAdHocActions.length
  )
  const completions = results.slice(
    selectedObservations.length + selectedAdHocActions.length,
    selectedObservations.length + selectedAdHocActions.length + selectedCompletions.length
  )
  return {
    observations,
    adHocActions,
    completions,
    committed: observations.length + adHocActions.length + completions.length
  }
}

export async function cancelDailyLogSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  const session = await findCareAgentSession({
    id: args.sessionId,
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: { notIn: ['COMMITTED'] }
  })
  if (!session) throw new Error('Session not found')
  await deleteCareAgentSession(session.id)
}

export function getDailyLogSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  return findCareAgentSession({
    id: args.sessionId,
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND
  })
}
