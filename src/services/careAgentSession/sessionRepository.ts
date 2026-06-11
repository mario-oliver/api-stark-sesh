/**
 * Unified persistence for the single conversational producer, CareAgentSession.
 *
 * Both per-agent flows (exercise build → kind PLAN_BUILD, program audit →
 * kind PLAN_AUDIT) converge on this one repo keyed by `kind`. Only the
 * persistence layer and status enum are shared here — each agent keeps its own
 * graph/prompt orchestration and owns the shape of the JSON it stashes in
 * `draft`. See context.md#CareAgentSession.
 */
import { prisma } from '../../lib/prisma.js'
import type {
  CareAgentSession,
  CareAgentSessionKind,
  CareAgentSessionStatus,
  Prisma
} from '../../generated/client.js'

export type { CareAgentSession, CareAgentSessionKind, CareAgentSessionStatus }

/** A single conversational turn, persisted in `messages`. */
export type StoredMessage = { role: 'user' | 'assistant'; content: string }

/** Status filter accepted by the lookup helpers. */
type StatusFilter =
  | CareAgentSessionStatus
  | { in: CareAgentSessionStatus[] }
  | { notIn: CareAgentSessionStatus[] }

export type CreateCareAgentSessionInput = {
  dogId: string
  userId: string
  kind: CareAgentSessionKind
  status: CareAgentSessionStatus
  messages: Prisma.InputJsonValue
  questions?: Prisma.InputJsonValue
  draft?: Prisma.InputJsonValue
  voiceNoteId?: string | null
}

export function createCareAgentSession(
  input: CreateCareAgentSessionInput
): Promise<CareAgentSession> {
  return prisma.careAgentSession.create({
    data: {
      dogId: input.dogId,
      userId: input.userId,
      kind: input.kind,
      status: input.status,
      messages: input.messages,
      questions: input.questions,
      draft: input.draft,
      voiceNoteId: input.voiceNoteId ?? undefined
    }
  })
}

/** Look up a session scoped to its kind + owner (optionally filtered by status). */
export function findCareAgentSession(args: {
  id: string
  dogId: string
  userId: string
  kind: CareAgentSessionKind
  status?: StatusFilter
}): Promise<CareAgentSession | null> {
  return prisma.careAgentSession.findFirst({
    where: {
      id: args.id,
      dogId: args.dogId,
      userId: args.userId,
      kind: args.kind,
      ...(args.status !== undefined ? { status: args.status } : {})
    }
  })
}

/**
 * Look up a session by id scoped to its owner, WITHOUT a kind filter — the
 * unified controller uses this to read the stored `kind` and then dispatch to
 * the matching agent service.
 */
export function findCareAgentSessionForUser(args: {
  id: string
  dogId: string
  userId: string
}): Promise<CareAgentSession | null> {
  return prisma.careAgentSession.findFirst({
    where: { id: args.id, dogId: args.dogId, userId: args.userId }
  })
}

export type UpdateCareAgentSessionData = {
  status?: CareAgentSessionStatus
  messages?: Prisma.InputJsonValue
  questions?: Prisma.InputJsonValue
  draft?: Prisma.InputJsonValue
}

export function updateCareAgentSession(
  id: string,
  data: UpdateCareAgentSessionData
): Promise<CareAgentSession> {
  return prisma.careAgentSession.update({ where: { id }, data })
}

/**
 * Mark the session COMMITTED and record the polymorphic commit FK(s) — the
 * moment a draft becomes durable rows.
 */
export function commitCareAgentSession(
  id: string,
  commit: { committedCarePlanId?: string | null; committedCareActionId?: string | null }
): Promise<CareAgentSession> {
  return prisma.careAgentSession.update({
    where: { id },
    data: {
      status: 'COMMITTED',
      committedCarePlanId: commit.committedCarePlanId ?? undefined,
      committedCareActionId: commit.committedCareActionId ?? undefined
    }
  })
}

export function deleteCareAgentSession(id: string): Promise<CareAgentSession> {
  return prisma.careAgentSession.delete({ where: { id } })
}

// ── Shared JSON helpers ───────────────────────────────────────────────────────

export function parseStoredMessages(raw: unknown): StoredMessage[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is StoredMessage =>
      typeof m === 'object' &&
      m !== null &&
      'role' in m &&
      'content' in m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  )
}
