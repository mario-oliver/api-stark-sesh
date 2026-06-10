import type { Prisma } from '../../generated/client.js'
import {
  createCareAction,
  deactivateCareAction,
  updateCareAction
} from '../carePlans/carePlanService.js'
import {
  commitCareAgentSession,
  createCareAgentSession,
  deleteCareAgentSession,
  findCareAgentSession,
  parseStoredMessages,
  updateCareAgentSession,
  type CareAgentSessionStatus
} from '../careAgentSession/sessionRepository.js'
import { runAuditGraph } from './graphRunner.js'
import { loadAuditContext } from './programContext.js'
import {
  auditReportSchema,
  proposedProgramChangesSchema,
  type AuditReport,
  type ProposedChange,
  type ProposedProgramChanges,
  type StoredMessage
} from './types.js'

/** This agent is the PLAN_AUDIT entry into the unified CareAgentSession. */
const KIND = 'PLAN_AUDIT' as const

// ── Draft envelope (PLAN_AUDIT) ───────────────────────────────────────────────
// The unified `draft` column folds the former `report` and `plan` columns into
// one JSON envelope. Status collapses onto the shared enum: a ready report =
// AWAITING_INPUT (awaiting the user's direction); a ready plan = DRAFT_READY
// (a committable draft exists).

type PlanAuditDraft = {
  report: AuditReport | null
  plan: ProposedProgramChanges | null
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

function decodePlanAuditDraft(raw: unknown): PlanAuditDraft {
  if (!raw || typeof raw !== 'object') return { report: null, plan: null }
  const d = raw as Record<string, unknown>
  return { report: parseReport(d.report), plan: parsePlan(d.plan) }
}

function encodePlanAuditDraft(
  report: AuditReport | null,
  plan: ProposedProgramChanges | null
): Prisma.InputJsonValue | undefined {
  if (!report && !plan) return undefined
  return { report: report ?? null, plan: plan ?? null } as Prisma.InputJsonValue
}

function mapToStatus(
  report: AuditReport | null,
  plan: ProposedProgramChanges | null
): CareAgentSessionStatus {
  if (plan) return 'DRAFT_READY'
  if (report) return 'AWAITING_INPUT'
  return 'ACTIVE'
}

export function serializeSession(session: {
  id: string
  dogId: string
  status: CareAgentSessionStatus
  messages: unknown
  draft: unknown
  createdAt: Date
  updatedAt: Date
}) {
  const { report, plan } = decodePlanAuditDraft(session.draft)
  return {
    id: session.id,
    dogId: session.dogId,
    status: session.status,
    messages: parseStoredMessages(session.messages),
    report,
    plan,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createAuditSession(args: { dogId: string; userId: string }) {
  const dogContext = await loadAuditContext(args.dogId)
  if (!dogContext) throw new Error('Dog not found')

  let graphResult
  try {
    graphResult = await runAuditGraph({ dogContext })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    const session = await createCareAgentSession({
      dogId: args.dogId,
      userId: args.userId,
      kind: KIND,
      status: 'FAILED',
      messages: []
    })
    return { session, error }
  }

  const status = mapToStatus(graphResult.report, graphResult.plan)
  const session = await createCareAgentSession({
    dogId: args.dogId,
    userId: args.userId,
    kind: KIND,
    status,
    messages: graphResult.messages,
    draft: encodePlanAuditDraft(graphResult.report, graphResult.plan)
  })

  return { session, error: null }
}

export async function sendProgramAuditMessage(args: {
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
  if (!session) throw new Error('Session not found')

  const dogContext = await loadAuditContext(args.dogId)
  if (!dogContext) throw new Error('Dog not found')

  const prior = decodePlanAuditDraft(session.draft)
  const priorMessages = parseStoredMessages(session.messages)
  const messages: StoredMessage[] = [
    ...priorMessages,
    { role: 'user', content: args.message.trim() }
  ]

  let graphResult
  try {
    graphResult = await runAuditGraph({ dogContext, messages, existingReport: prior.report })
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Agent failed'
    const updated = await updateCareAgentSession(session.id, {
      status: 'FAILED',
      messages
    })
    return { session: updated, error }
  }

  const status = mapToStatus(graphResult.report, graphResult.plan)
  const newReport = graphResult.report ?? prior.report
  const newPlan = graphResult.plan ?? prior.plan
  const updated = await updateCareAgentSession(session.id, {
    status,
    messages: graphResult.messages,
    draft: encodePlanAuditDraft(newReport, newPlan)
  })

  return { session: updated, error: null }
}

export async function getAuditSession(args: {
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

export async function confirmAuditSession(args: {
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
  if (!session) throw new Error('Session not found or plan not ready')

  const { plan } = decodePlanAuditDraft(session.draft)
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
      const { rationale: _r, safetyNotes: _s, researchSummary: _rs, ...actionFields } =
        change.newAction
      const result = await createCareAction(args.dogId, actionFields)
      applied.push(result)
    }
  }

  await commitCareAgentSession(session.id, {
    committedCarePlanId: applied[0]?.carePlanId ?? null
  })

  return { applied, changesApplied: applied.length }
}

export async function cancelAuditSession(args: {
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
