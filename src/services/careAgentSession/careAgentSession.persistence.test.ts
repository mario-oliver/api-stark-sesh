/**
 * CareAgentSession persistence + commit — machine proof for issue 0003.
 *
 * Drives the REAL service paths (exercise = PLAN_BUILD, program audit =
 * PLAN_AUDIT) against an in-memory Prisma fake, so it runs in the unit gate with
 * no database. The agent graphs/context loaders are mocked (deterministic, no
 * OpenAI). Asserts that each kind: persists a session keyed by `kind`, advances
 * status, and records a polymorphic commit FK on confirm.
 *
 * Mocks are registered BEFORE the dynamic import of production code so that the
 * services (and carePlanService, transitively) bind to the fake prisma.
 */
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

type Row = Record<string, unknown>
const sessions = new Map<string, Row>()
let seq = 0

type StatusFilter =
  | string
  | { in?: string[]; notIn?: string[] }
  | undefined

function matchStatus(rowStatus: unknown, filter: StatusFilter): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'string') return rowStatus === filter
  if (filter.in) return filter.in.includes(rowStatus as string)
  if (filter.notIn) return !filter.notIn.includes(rowStatus as string)
  return true
}

const fakePrisma = {
  careAgentSession: {
    async create({ data }: { data: Row }) {
      const id = (data.id as string) ?? `sess-${++seq}`
      const now = new Date()
      const row: Row = {
        id,
        dogId: data.dogId,
        userId: data.userId,
        kind: data.kind,
        status: data.status ?? 'ACTIVE',
        messages: data.messages ?? [],
        questions: data.questions ?? null,
        draft: data.draft ?? null,
        voiceNoteId: data.voiceNoteId ?? null,
        committedCarePlanId: data.committedCarePlanId ?? null,
        committedCareActionId: data.committedCareActionId ?? null,
        createdAt: now,
        updatedAt: now
      }
      sessions.set(id, row)
      return { ...row }
    },
    async findFirst({ where }: { where: Row }) {
      for (const row of sessions.values()) {
        if (where.id !== undefined && row.id !== where.id) continue
        if (where.dogId !== undefined && row.dogId !== where.dogId) continue
        if (where.userId !== undefined && row.userId !== where.userId) continue
        if (where.kind !== undefined && row.kind !== where.kind) continue
        if (!matchStatus(row.status, where.status as StatusFilter)) continue
        return { ...row }
      }
      return null
    },
    async update({ where, data }: { where: { id: string }; data: Row }) {
      const row = sessions.get(where.id)
      if (!row) throw new Error(`session ${where.id} not found`)
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined) row[key] = data[key]
      }
      row.updatedAt = new Date()
      return { ...row }
    },
    async delete({ where }: { where: { id: string } }) {
      const row = sessions.get(where.id)
      sessions.delete(where.id)
      return row ? { ...row } : null
    }
  },
  carePlan: {
    async findFirst() {
      return { id: 'plan-1', dogId: 'dog-1', name: 'Test Plan', isActive: true, actions: [] }
    }
  },
  careAction: {
    async create({ data }: { data: Row }) {
      const now = new Date()
      return {
        id: `action-${++seq}`,
        carePlanId: data.carePlanId,
        name: data.name,
        description: data.description ?? null,
        bucket: data.bucket,
        frequency: data.frequency,
        timeOfDay: data.timeOfDay ?? null,
        targetReps: data.targetReps ?? null,
        targetDurationSeconds: data.targetDurationSeconds ?? null,
        instructions: data.instructions ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: true,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

// ── Deterministic agent mocks ─────────────────────────────────────────────────

const validProposedExercise = {
  name: 'Evening stretch',
  description: null,
  bucket: 'MOBILITY' as const,
  frequency: 'DAILY' as const,
  timeOfDay: 'EVENING' as const,
  targetReps: null,
  targetDurationSeconds: null,
  instructions: null,
  rationale: 'Helps stiffness.',
  safetyNotes: 'Consult your vet.',
  researchSummary: 'General canine stretch info.'
}

const dogAgentContext = {
  dogId: 'dog-1',
  dogName: 'Rex',
  breed: 'Lab',
  age: 4,
  condition: 'hip',
  notes: null,
  routineSummary: 'one stretch'
}

async function mockRunExerciseAgentGraph() {
  return {
    messages: [
      { role: 'user' as const, content: 'add an evening stretch' },
      { role: 'assistant' as const, content: 'Here is a draft.' }
    ],
    questions: [] as string[],
    research: [{ query: 'dog stretches', summary: 'gentle is good' }],
    draft: validProposedExercise
  }
}

const auditDogContext = {
  dogId: 'dog-1',
  dogName: 'Rex',
  breed: 'Lab',
  age: 4,
  condition: 'hip',
  notes: null,
  actions: []
}

const fixtureReport = {
  summary: 'Fixture audit summary',
  strengths: ['Good frequency'],
  gaps: ['Missing cool-down'],
  observations: [],
  overallRating: 'FAIR' as const
}

async function mockRunAuditGraph(input: {
  dogContext: unknown
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  existingReport?: unknown
}) {
  if (!input.existingReport) {
    return {
      dogContext: input.dogContext,
      report: fixtureReport,
      plan: null,
      messages: [{ role: 'assistant' as const, content: 'Audit complete.' }],
      phase: 'done' as const
    }
  }
  const lastUser = [...(input.messages ?? [])].reverse().find(m => m.role === 'user')
  const wantsChanges = lastUser?.content.toLowerCase().includes('propose changes') ?? false
  if (wantsChanges) {
    return {
      dogContext: input.dogContext,
      report: input.existingReport,
      plan: {
        summary: 'Fixture plan summary',
        changes: [
          {
            id: randomUUID(),
            type: 'CREATE' as const,
            newAction: {
              name: 'New cool-down',
              description: null,
              bucket: 'MOBILITY' as const,
              frequency: 'DAILY' as const,
              timeOfDay: null,
              targetReps: null,
              targetDurationSeconds: 30,
              instructions: null,
              rationale: 'Add a cool-down.',
              safetyNotes: 'Go slow.',
              researchSummary: 'Cool-downs help.'
            },
            reason: 'Add missing cool-down'
          }
        ]
      },
      messages: [...(input.messages ?? []), { role: 'assistant' as const, content: 'Proposed.' }],
      phase: 'done' as const
    }
  }
  return {
    dogContext: input.dogContext,
    report: input.existingReport,
    plan: null,
    messages: [...(input.messages ?? []), { role: 'assistant' as const, content: 'Reply.' }],
    phase: 'done' as const
  }
}

// ── Production code, imported after mocks are in place ────────────────────────

let exerciseService: typeof import('../exerciseAgent/sessionService.js')
let auditService: typeof import('../programAudit/sessionService.js')

before(async () => {
  const here = import.meta.url
  await mock.module(new URL('../../lib/prisma.ts', here).href, {
    namedExports: { prisma: fakePrisma }
  })
  await mock.module(new URL('../exerciseAgent/graph.ts', here).href, {
    namedExports: { runExerciseAgentGraph: mockRunExerciseAgentGraph }
  })
  await mock.module(new URL('../exerciseAgent/tools/routineContext.ts', here).href, {
    namedExports: { loadDogAgentContext: async () => dogAgentContext }
  })
  await mock.module(new URL('../programAudit/graphRunner.ts', here).href, {
    namedExports: { runAuditGraph: mockRunAuditGraph }
  })
  await mock.module(new URL('../programAudit/programContext.ts', here).href, {
    namedExports: { loadAuditContext: async () => auditDogContext }
  })

  exerciseService = await import('../exerciseAgent/sessionService.js')
  auditService = await import('../programAudit/sessionService.js')
})

// ── PLAN_BUILD (exercise agent) ───────────────────────────────────────────────

describe('CareAgentSession — PLAN_BUILD persists, advances, commits', () => {
  it('creates a kind=PLAN_BUILD session that advances to DRAFT_READY', async () => {
    const { session, error } = await exerciseService.createExerciseSession({
      dogId: 'dog-1',
      userId: 'user-1',
      message: 'add an evening stretch'
    })
    assert.equal(error, null)
    assert.equal(session.kind, 'PLAN_BUILD')
    assert.equal(session.status, 'DRAFT_READY')
    // draft persisted as the unified envelope
    const draft = session.draft as { exercise: { name: string } }
    assert.equal(draft.exercise.name, 'Evening stretch')
  })

  it('confirm commits the session: status COMMITTED + commit FKs recorded', async () => {
    const { session } = await exerciseService.createExerciseSession({
      dogId: 'dog-1',
      userId: 'user-1',
      message: 'add an evening stretch'
    })

    const { action } = await exerciseService.confirmExerciseSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.ok(action.id, 'a care action was created on commit')

    const committed = await exerciseService.getExerciseSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.ok(committed, 'committed session is retrievable')
    assert.equal(committed.status, 'COMMITTED')
    assert.equal(committed.committedCareActionId, action.id)
    assert.equal(committed.committedCarePlanId, action.carePlanId)
  })
})

// ── PLAN_AUDIT (program audit agent) ──────────────────────────────────────────

describe('CareAgentSession — PLAN_AUDIT persists, advances, commits', () => {
  it('creates a kind=PLAN_AUDIT session that advances to AWAITING_INPUT with a report', async () => {
    const { session, error } = await auditService.createAuditSession({
      dogId: 'dog-1',
      userId: 'user-1'
    })
    assert.equal(error, null)
    assert.equal(session.kind, 'PLAN_AUDIT')
    assert.equal(session.status, 'AWAITING_INPUT')
    const draft = session.draft as { report: { summary: string } }
    assert.equal(draft.report.summary, 'Fixture audit summary')
  })

  it('propose-changes advances to DRAFT_READY, then confirm commits with a commit FK', async () => {
    const created = await auditService.createAuditSession({
      dogId: 'dog-1',
      userId: 'user-1'
    })

    const { session: planSession } = await auditService.sendProgramAuditMessage({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: created.session.id,
      message: 'propose changes please'
    })
    assert.equal(planSession.status, 'DRAFT_READY')

    const { changesApplied } = await auditService.confirmAuditSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: created.session.id
    })
    assert.equal(changesApplied, 1)

    const committed = await auditService.getAuditSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: created.session.id
    })
    assert.ok(committed, 'committed session is retrievable')
    assert.equal(committed.status, 'COMMITTED')
    assert.equal(committed.committedCarePlanId, 'plan-1')
  })
})
