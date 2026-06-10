import type { Prisma } from '../../generated/client.js'
import { createCareAction } from '../carePlans/carePlanService.js'
import {
  commitCareAgentSession,
  createCareAgentSession,
  deleteCareAgentSession,
  findCareAgentSession,
  parseStoredMessages,
  updateCareAgentSession,
  type CareAgentSession,
  type CareAgentSessionStatus
} from '../careAgentSession/sessionRepository.js'
import { runExerciseAgentGraph } from './graph.js'
import { loadDogAgentContext } from './tools/routineContext.js'
import {
  normalizeProposedExerciseInput,
  proposedExerciseSchema,
  type ProposedExercise,
  type ResearchSnippet,
  type StoredMessage
} from './types.js'

/** This agent is the PLAN_BUILD entry into the unified CareAgentSession. */
const KIND = 'PLAN_BUILD' as const

// ── Draft envelope (PLAN_BUILD) ───────────────────────────────────────────────
// The unified `draft` column folds the former `draft` (proposed exercise) and
// `research` columns into one JSON envelope.

type PlanBuildDraft = {
  exercise: ProposedExercise | null
  research: ResearchSnippet[]
}

function decodePlanBuildDraft(raw: unknown): PlanBuildDraft {
  if (!raw || typeof raw !== 'object') return { exercise: null, research: [] }
  const d = raw as Record<string, unknown>
  let exercise: ProposedExercise | null = null
  if (d.exercise) {
    const parsed = proposedExerciseSchema.safeParse(
      normalizeProposedExerciseInput(d.exercise)
    )
    if (parsed.success) exercise = parsed.data
  }
  const research = Array.isArray(d.research) ? (d.research as ResearchSnippet[]) : []
  return { exercise, research }
}

function encodePlanBuildDraft(
  exercise: ProposedExercise | null,
  research: ResearchSnippet[]
): Prisma.InputJsonValue | undefined {
  if (!exercise && research.length === 0) return undefined
  return { exercise: exercise ?? null, research } as Prisma.InputJsonValue
}

function mapGraphToStatus(
  questions: string[],
  draft: ProposedExercise | null
): CareAgentSessionStatus {
  if (draft) return 'DRAFT_READY'
  if (questions.length > 0) return 'AWAITING_INPUT'
  return 'ACTIVE'
}

export async function createExerciseSession(args: {
  dogId: string
  userId: string
  message: string
}) {
  const dogContext = await loadDogAgentContext(args.dogId)
  if (!dogContext) {
    throw new Error('Dog not found')
  }

  const messages: StoredMessage[] = [{ role: 'user', content: args.message.trim() }]

  let graphResult
  try {
    graphResult = await runExerciseAgentGraph({ dogContext, messages })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    const session = await createCareAgentSession({
      dogId: args.dogId,
      userId: args.userId,
      kind: KIND,
      status: 'FAILED',
      messages,
      questions: []
    })
    return { session, error }
  }

  const allMessages = graphResult.messages
  const status = mapGraphToStatus(graphResult.questions, graphResult.draft)

  const session = await createCareAgentSession({
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status,
    messages: allMessages,
    questions: graphResult.questions.length > 0 ? graphResult.questions : undefined,
    draft: encodePlanBuildDraft(graphResult.draft, graphResult.research)
  })

  return { session, error: null }
}

export async function sendExerciseAgentMessage(args: {
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
    status: { in: ['ACTIVE', 'AWAITING_INPUT', 'DRAFT_READY'] }
  })

  if (!session) {
    throw new Error('Session not found')
  }

  const dogContext = await loadDogAgentContext(args.dogId)
  if (!dogContext) {
    throw new Error('Dog not found')
  }

  const prior = decodePlanBuildDraft(session.draft)
  const priorMessages = parseStoredMessages(session.messages)
  const messages: StoredMessage[] = [
    ...priorMessages,
    { role: 'user', content: args.message.trim() }
  ]

  const cachedResearch = prior.research
  const skipResearch = session.status === 'DRAFT_READY' && cachedResearch.length > 0

  let graphResult
  try {
    graphResult = await runExerciseAgentGraph({
      dogContext,
      messages,
      skipResearch,
      cachedResearch: cachedResearch as Parameters<typeof runExerciseAgentGraph>[0]['cachedResearch']
    })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    const updated = await updateCareAgentSession(session.id, {
      status: 'FAILED',
      messages
    })
    return { session: updated, error }
  }

  const status = mapGraphToStatus(graphResult.questions, graphResult.draft)
  const newExercise = graphResult.draft ?? prior.exercise
  const newResearch = graphResult.research.length > 0 ? graphResult.research : prior.research

  const updated = await updateCareAgentSession(session.id, {
    status,
    messages: graphResult.messages,
    questions: graphResult.questions.length > 0 ? graphResult.questions : undefined,
    draft: encodePlanBuildDraft(newExercise, newResearch)
  })

  return { session: updated, error: null }
}

export async function getExerciseSession(args: {
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

export async function confirmExerciseSession(args: {
  dogId: string
  userId: string
  sessionId: string
  edits?: Partial<ProposedExercise>
}) {
  const session = await findCareAgentSession({
    id: args.sessionId,
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status: 'DRAFT_READY'
  })

  if (!session) {
    throw new Error('Session not found or draft not ready')
  }

  const { exercise } = decodePlanBuildDraft(session.draft)
  if (!exercise) {
    throw new Error('No draft to confirm')
  }

  const merged = { ...exercise, ...(args.edits ?? {}) }
  const draft = proposedExerciseSchema.parse(normalizeProposedExerciseInput(merged))

  const { rationale: _r, safetyNotes: _s, researchSummary: _rs, ...actionFields } = draft

  const action = await createCareAction(args.dogId, actionFields)

  await commitCareAgentSession(session.id, {
    committedCarePlanId: action.carePlanId,
    committedCareActionId: action.id
  })

  return { action, draft }
}

export async function cancelExerciseSession(args: {
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

  if (!session) {
    throw new Error('Session not found')
  }

  await deleteCareAgentSession(session.id)
}

export function serializeSession(session: {
  id: string
  dogId: string
  status: CareAgentSession['status']
  messages: unknown
  draft: unknown
  questions: unknown
  createdAt: Date
  updatedAt: Date
}) {
  const messages = parseStoredMessages(session.messages)
  const questions = Array.isArray(session.questions)
    ? (session.questions as string[])
    : []

  const { exercise, research } = decodePlanBuildDraft(session.draft)

  return {
    id: session.id,
    dogId: session.dogId,
    status: session.status,
    messages,
    questions,
    draft: exercise,
    research,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}
