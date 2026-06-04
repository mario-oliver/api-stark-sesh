import { prisma } from '../../lib/prisma.js'
import type { ExerciseAgentSessionStatus } from '../../generated/client.js'
import { createCareActionWithSteps } from '../carePlans/carePlanService.js'
import { runExerciseAgentGraph } from './graph.js'
import { loadDogAgentContext } from './tools/routineContext.js'
import {
  proposedExerciseSchema,
  type ProposedExercise,
  type StoredMessage
} from './types.js'

function parseMessages(raw: unknown): StoredMessage[] {
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

function mapGraphToStatus(
  questions: string[],
  draft: ProposedExercise | null
): ExerciseAgentSessionStatus {
  if (draft) return 'DRAFT_READY'
  if (questions.length > 0) return 'AWAITING_INPUT'
  return 'ACTIVE'
}

export async function createExerciseAgentSession(args: {
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
    const session = await prisma.exerciseAgentSession.create({
      data: {
        dogId: args.dogId,
        userId: args.userId,
        status: 'FAILED',
        messages,
        questions: []
      }
    })
    return { session, error }
  }

  const allMessages = graphResult.messages
  const status = mapGraphToStatus(graphResult.questions, graphResult.draft)

  const session = await prisma.exerciseAgentSession.create({
    data: {
      dogId: args.dogId,
      userId: args.userId,
      status,
      messages: allMessages,
      questions: graphResult.questions.length > 0 ? graphResult.questions : undefined,
      draft: graphResult.draft ?? undefined,
      research: graphResult.research.length > 0 ? graphResult.research : undefined
    }
  })

  return { session, error: null }
}

export async function sendExerciseAgentMessage(args: {
  dogId: string
  userId: string
  sessionId: string
  message: string
}) {
  const session = await prisma.exerciseAgentSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: { in: ['ACTIVE', 'AWAITING_INPUT', 'DRAFT_READY'] }
    }
  })

  if (!session) {
    throw new Error('Session not found')
  }

  const dogContext = await loadDogAgentContext(args.dogId)
  if (!dogContext) {
    throw new Error('Dog not found')
  }

  const priorMessages = parseMessages(session.messages)
  const messages: StoredMessage[] = [
    ...priorMessages,
    { role: 'user', content: args.message.trim() }
  ]

  const cachedResearch = Array.isArray(session.research) ? session.research : []
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
    await prisma.exerciseAgentSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', messages }
    })
    return { session: { ...session, status: 'FAILED' as const, messages }, error }
  }

  const status = mapGraphToStatus(graphResult.questions, graphResult.draft)

  const updated = await prisma.exerciseAgentSession.update({
    where: { id: session.id },
    data: {
      status,
      messages: graphResult.messages,
      questions:
        graphResult.questions.length > 0 ? graphResult.questions : undefined,
      draft: graphResult.draft ?? session.draft ?? undefined,
      research:
        graphResult.research.length > 0 ? graphResult.research : session.research ?? undefined
    }
  })

  return { session: updated, error: null }
}

export async function getExerciseAgentSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  return prisma.exerciseAgentSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId
    }
  })
}

export async function confirmExerciseAgentSession(args: {
  dogId: string
  userId: string
  sessionId: string
  edits?: Partial<ProposedExercise>
}) {
  const session = await prisma.exerciseAgentSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: 'DRAFT_READY'
    }
  })

  if (!session) {
    throw new Error('Session not found or draft not ready')
  }

  const rawDraft = session.draft
  if (!rawDraft || typeof rawDraft !== 'object') {
    throw new Error('No draft to confirm')
  }

  const merged = { ...(rawDraft as object), ...(args.edits ?? {}) }
  const draft = proposedExerciseSchema.parse(merged)

  const { movements, rationale: _r, safetyNotes: _s, researchSummary: _rs, ...actionFields } =
    draft

  const action = await createCareActionWithSteps(args.dogId, {
    ...actionFields,
    steps: movements.map((m, index) => ({
      name: m.name,
      description: m.description ?? null,
      instructions: m.instructions ?? null,
      sortOrder: m.sortOrder ?? index + 1
    }))
  })

  await prisma.exerciseAgentSession.update({
    where: { id: session.id },
    data: { status: 'COMMITTED' }
  })

  return { action, draft }
}

export async function cancelExerciseAgentSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  const session = await prisma.exerciseAgentSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: { notIn: ['COMMITTED'] }
    }
  })

  if (!session) {
    throw new Error('Session not found')
  }

  await prisma.exerciseAgentSession.delete({ where: { id: session.id } })
}

export function serializeSession(session: {
  id: string
  dogId: string
  status: ExerciseAgentSessionStatus
  messages: unknown
  draft: unknown
  research: unknown
  questions: unknown
  createdAt: Date
  updatedAt: Date
}) {
  const messages = parseMessages(session.messages)
  const questions = Array.isArray(session.questions)
    ? (session.questions as string[])
    : []

  let draft: ProposedExercise | null = null
  if (session.draft) {
    const parsed = proposedExerciseSchema.safeParse(session.draft)
    if (parsed.success) draft = parsed.data
  }

  return {
    id: session.id,
    dogId: session.dogId,
    status: session.status,
    messages,
    questions,
    draft,
    research: session.research,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}
