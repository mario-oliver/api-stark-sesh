import { prisma } from '../../lib/prisma.js'
import type { ProgramAuditSessionStatus } from '../../generated/client.js'
import {
  createCareActionWithSteps,
  deactivateCareAction,
  updateCareAction
} from '../carePlans/carePlanService.js'
import { runAuditGraph } from './graph.js'
import { loadAuditContext } from './programContext.js'
import {
  auditReportSchema,
  proposedProgramChangesSchema,
  type AuditReport,
  type ProposedChange,
  type ProposedProgramChanges,
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

function parseReport(raw: unknown): AuditReport | null {
  if (!raw) return null
  const result = auditReportSchema.safeParse(raw)
  return result.success ? result.data : null
}

function parsePlan(raw: unknown): ProposedProgramChanges | null {
  if (!raw) return null
  const result = proposedProgramChangesSchema.safeParse(raw)
  return result.success ? result.data : null
}

function mapToStatus(
  report: AuditReport | null,
  plan: ProposedProgramChanges | null
): ProgramAuditSessionStatus {
  if (plan) return 'PLAN_READY'
  if (report) return 'REPORT_READY'
  return 'ACTIVE'
}

export function serializeSession(session: {
  id: string
  dogId: string
  status: ProgramAuditSessionStatus
  messages: unknown
  report: unknown
  plan: unknown
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: session.id,
    dogId: session.dogId,
    status: session.status,
    messages: parseMessages(session.messages),
    report: parseReport(session.report),
    plan: parsePlan(session.plan),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createProgramAuditSession(args: { dogId: string; userId: string }) {
  const dogContext = await loadAuditContext(args.dogId)
  if (!dogContext) throw new Error('Dog not found')

  let graphResult
  try {
    graphResult = await runAuditGraph({ dogContext })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    const session = await prisma.programAuditSession.create({
      data: {
        dogId: args.dogId,
        userId: args.userId,
        status: 'FAILED',
        messages: []
      }
    })
    return { session, error }
  }

  const status = mapToStatus(graphResult.report, graphResult.plan)
  const session = await prisma.programAuditSession.create({
    data: {
      dogId: args.dogId,
      userId: args.userId,
      status,
      messages: graphResult.messages,
      report: graphResult.report ?? undefined,
      plan: graphResult.plan ?? undefined
    }
  })

  return { session, error: null }
}

export async function sendProgramAuditMessage(args: {
  dogId: string
  userId: string
  sessionId: string
  message: string
}) {
  const session = await prisma.programAuditSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: { in: ['ACTIVE', 'AWAITING_INPUT', 'REPORT_READY', 'PLAN_READY'] }
    }
  })
  if (!session) throw new Error('Session not found')

  const dogContext = await loadAuditContext(args.dogId)
  if (!dogContext) throw new Error('Dog not found')

  const priorMessages = parseMessages(session.messages)
  const messages: StoredMessage[] = [
    ...priorMessages,
    { role: 'user', content: args.message.trim() }
  ]
  const existingReport = parseReport(session.report)

  let graphResult
  try {
    graphResult = await runAuditGraph({ dogContext, messages, existingReport })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    await prisma.programAuditSession.update({
      where: { id: session.id },
      data: { status: 'FAILED', messages }
    })
    return { session: { ...session, status: 'FAILED' as const, messages }, error }
  }

  const status = mapToStatus(graphResult.report, graphResult.plan)
  const updated = await prisma.programAuditSession.update({
    where: { id: session.id },
    data: {
      status,
      messages: graphResult.messages,
      report: graphResult.report ?? session.report ?? undefined,
      plan: graphResult.plan ?? session.plan ?? undefined
    }
  })

  return { session: updated, error: null }
}

export async function getProgramAuditSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  return prisma.programAuditSession.findFirst({
    where: { id: args.sessionId, dogId: args.dogId, userId: args.userId }
  })
}

export async function confirmProgramAuditSession(args: {
  dogId: string
  userId: string
  sessionId: string
  selectedChangeIds?: string[]
}) {
  const session = await prisma.programAuditSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: 'PLAN_READY'
    }
  })
  if (!session) throw new Error('Session not found or plan not ready')

  const plan = parsePlan(session.plan)
  if (!plan || plan.changes.length === 0) throw new Error('No plan to confirm')

  const changesToApply: ProposedChange[] =
    args.selectedChangeIds && args.selectedChangeIds.length > 0
      ? plan.changes.filter(c => args.selectedChangeIds!.includes(c.id))
      : plan.changes

  const applied: Awaited<ReturnType<typeof updateCareAction>>[] = []

  for (const change of changesToApply) {
    if (change.type === 'DEACTIVATE' && change.actionId) {
      const result = await deactivateCareAction(args.dogId, change.actionId)
      applied.push(result)
    } else if (change.type === 'UPDATE' && change.actionId && change.updates) {
      const result = await updateCareAction(args.dogId, change.actionId, change.updates)
      applied.push(result)
    } else if (change.type === 'CREATE' && change.newAction) {
      const { movements, rationale: _r, safetyNotes: _s, researchSummary: _rs, ...actionFields } =
        change.newAction
      const result = await createCareActionWithSteps(args.dogId, {
        ...actionFields,
        steps: movements.map((m, index) => ({
          name: m.name,
          description: m.description ?? null,
          instructions: m.instructions ?? null,
          sortOrder: m.sortOrder ?? index + 1
        }))
      })
      applied.push(result)
    }
  }

  await prisma.programAuditSession.update({
    where: { id: session.id },
    data: { status: 'COMMITTED' }
  })

  return { applied, changesApplied: applied.length }
}

export async function cancelProgramAuditSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  const session = await prisma.programAuditSession.findFirst({
    where: {
      id: args.sessionId,
      dogId: args.dogId,
      userId: args.userId,
      status: { notIn: ['COMMITTED'] }
    }
  })
  if (!session) throw new Error('Session not found')
  await prisma.programAuditSession.delete({ where: { id: session.id } })
}
