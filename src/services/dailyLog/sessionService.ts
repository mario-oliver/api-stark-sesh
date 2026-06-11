import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { resolveTodayLog } from '../dailyCare/resolveTodayLog.js'
import { todayUtcDateString } from '../dailyCare/dateUtils.js'
import {
  createCareAgentSession,
  deleteCareAgentSession,
  findCareAgentSession
} from '../careAgentSession/sessionRepository.js'
import { loadDailyLogContext } from './dailyLogContext.js'
import { runDailyLogExtraction } from './extraction.js'
import {
  observationDraftSchema,
  planChangeSuggestionSchema,
  type DailyLogDraft,
  type ObservationDraft,
  type StoredMessage
} from './types.js'

/** This flow is the DAILY_LOG entry into the unified CareAgentSession (ADR-0003). */
const KIND = 'DAILY_LOG' as const

// ── Draft envelope (DAILY_LOG) ────────────────────────────────────────────────
// The unified `draft` column stores the review envelope
// `{ completions, adHocActions, observations, planChangeSuggestions }`. v1 fills
// `observations`; the other three are present-but-empty (0012/0013/0015).

function decodeDailyLogDraft(raw: unknown): DailyLogDraft {
  if (!raw || typeof raw !== 'object') {
    return { completions: [], adHocActions: [], observations: [], planChangeSuggestions: [] }
  }
  const d = raw as Record<string, unknown>

  const observations = Array.isArray(d.observations)
    ? d.observations.flatMap(o => {
        const parsed = observationDraftSchema.safeParse(o)
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
    completions: Array.isArray(d.completions) ? d.completions : [],
    adHocActions: Array.isArray(d.adHocActions) ? d.adHocActions : [],
    observations,
    planChangeSuggestions
  }
}

function encodeDailyLogDraft(draft: DailyLogDraft): Prisma.InputJsonValue {
  return {
    completions: [],
    adHocActions: [],
    observations: draft.observations,
    planChangeSuggestions: draft.planChangeSuggestions
  } as Prisma.InputJsonValue
}

// ── Create: transcript → extraction → reviewable draft ─────────────────────────

export async function createDailyLogSession(args: {
  dogId: string
  userId: string
  voiceNoteId: string
}) {
  const context = await loadDailyLogContext({
    dogId: args.dogId,
    voiceNoteId: args.voiceNoteId
  })
  if (!context) throw new Error('VoiceNote not found')

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

  const observations: ObservationDraft[] = extraction.observations.map(o => ({
    changeId: randomUUID(),
    ...o
  }))
  const draft: DailyLogDraft = {
    completions: [],
    adHocActions: [],
    observations,
    planChangeSuggestions: extraction.planChangeSuggestions
  }

  // Nothing loggable → DRAFT_READY with an empty draft + an agent message
  // (ADR-0003 decision 9). FAILED is reserved for real extraction errors above.
  const messages: StoredMessage[] = extraction.message.trim()
    ? [{ role: 'assistant', content: extraction.message.trim() }]
    : []

  const session = await createCareAgentSession({
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: 'DRAFT_READY',
    messages,
    draft: encodeDailyLogDraft(draft),
    voiceNoteId: args.voiceNoteId
  })

  return { session, error: null }
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
  const selected =
    args.selectedChangeIds && args.selectedChangeIds.length > 0
      ? draft.observations.filter(o => args.selectedChangeIds!.includes(o.changeId))
      : draft.observations

  // Reuse the single instantiation owner for today's DailyCareLog (ADR-0003 #6);
  // its own daily-action instantiation runs before the commit transaction below.
  const today = await resolveTodayLog(args.dogId, todayUtcDateString())
  const dailyCareLogId = today.dailyLog.id

  // ADR-0003: the day's outputs commit in ONE transaction — the selected
  // observations and the COMMITTED status flip succeed or fail together, so a
  // mid-commit failure can never leave orphan rows on a still-DRAFT_READY
  // session. DAILY_LOG commits HealthObservations, not a plan/action (no
  // polymorphic commit FK), so the status flip is inlined here rather than going
  // through commitCareAgentSession.
  const results = await prisma.$transaction([
    ...selected.map(o =>
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
    prisma.careAgentSession.update({
      where: { id: session.id },
      data: { status: 'COMMITTED' }
    })
  ])

  const observations = results.slice(0, selected.length)
  return { observations, committed: observations.length }
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
