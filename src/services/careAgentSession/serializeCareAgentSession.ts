/**
 * The single wire serializer for the unified care-agent HTTP surface.
 *
 * Every `/care-agent/sessions` response — regardless of `kind` — is shaped here
 * into the one `CareAgentSessionPayload` the consolidated clients consume
 * (stark-sesh `CareAgentSessionPayload`, ADR-0002). `draft` is polymorphic by
 * `kind`: a PLAN_BUILD draft is the single proposed CareAction; a PLAN_AUDIT
 * draft is the `{ report, plan }` envelope. The values were already validated on
 * write, so serialization only re-shapes the stored envelope — it does not
 * re-parse it.
 */
import {
  parseStoredMessages,
  type CareAgentSession,
  type CareAgentSessionKind,
  type CareAgentSessionStatus,
  type StoredMessage
} from './sessionRepository.js'

export interface CareAgentSessionPayload {
  id: string
  dogId: string
  kind: CareAgentSessionKind
  status: CareAgentSessionStatus
  messages: StoredMessage[]
  questions: string[]
  draft: unknown
  voiceNoteId: string | null
  createdAt: string
  updatedAt: string
}

/** Pull the kind-appropriate `draft` view out of the stored JSON envelope. */
function extractDraft(kind: CareAgentSessionKind, raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return null
  const envelope = raw as Record<string, unknown>

  if (kind === 'PLAN_BUILD') {
    // Envelope: { exercise, research }. The client draft is the exercise alone;
    // cached research snippets are an internal concern.
    return envelope.exercise ?? null
  }

  if (kind === 'PLAN_AUDIT') {
    // Envelope: { report, plan }. Surface both, or null when neither exists yet.
    const report = envelope.report ?? null
    const plan = envelope.plan ?? null
    return report === null && plan === null ? null : { report, plan }
  }

  if (kind === 'DAILY_LOG') {
    // Envelope: { completions, adHocActions, observations, planChangeSuggestions }.
    // Surface the full review draft; observations (0011) and adHocActions (0012)
    // are filled, completions stay empty until 0013 and planChangeSuggestions until
    // 0015 (ADR-0003).
    return {
      completions: Array.isArray(envelope.completions) ? envelope.completions : [],
      adHocActions: Array.isArray(envelope.adHocActions) ? envelope.adHocActions : [],
      observations: Array.isArray(envelope.observations) ? envelope.observations : [],
      planChangeSuggestions: Array.isArray(envelope.planChangeSuggestions)
        ? envelope.planChangeSuggestions
        : []
    }
  }

  return null
}

export function serializeCareAgentSession(session: CareAgentSession): CareAgentSessionPayload {
  return {
    id: session.id,
    dogId: session.dogId,
    kind: session.kind,
    status: session.status,
    messages: parseStoredMessages(session.messages),
    questions: Array.isArray(session.questions) ? (session.questions as string[]) : [],
    draft: extractDraft(session.kind, session.draft),
    voiceNoteId: session.voiceNoteId ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}
