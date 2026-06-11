/**
 * DAILY_LOG session shell — machine proof for issue 0011.
 *
 * Drives the REAL service paths (create → extract → draft → confirm → commit)
 * against an in-memory Prisma fake, so it runs in the unit gate with no
 * database. The LLM extraction pass, the transcript loader, and resolveTodayLog
 * are module-mocked (deterministic, no OpenAI). Per ADR-0003 we assert on
 * ROUTING and COMMIT, not on model wording.
 *
 * Mocks are registered BEFORE the dynamic import of production code so the
 * service binds to the fakes.
 */
import { describe, it, before, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { DailyLogContext, DailyLogExtraction, ExtractedCompletion } from './types.js'
import type { DailyCareActionGroupByOutputType } from '../../generated/models/DailyCareAction.js'

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

type Row = Record<string, unknown>
const sessions = new Map<string, Row>()
const observations: Row[] = []
const dailyCareActions: Row[] = []
const voiceNotes = new Map<string, Row>()
let voiceNoteWrites = 0
let seq = 0

type StatusFilter = string | { in?: string[]; notIn?: string[] } | undefined

function matchStatus(rowStatus: unknown, filter: StatusFilter): boolean {
  if (filter === undefined) return true
  if (typeof filter === 'string') return rowStatus === filter
  if (filter.in) return filter.in.includes(rowStatus as string)
  if (filter.notIn) return !filter.notIn.includes(rowStatus as string)
  return true
}

const fakePrisma = {
  // Array-form $transaction: the fake ops execute eagerly when built, so awaiting
  // them together is enough to model atomic-commit ordering for the unit gate.
  async $transaction(ops: Array<Promise<unknown>>) {
    return Promise.all(ops)
  },
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
  healthObservation: {
    async create({ data }: { data: Row }) {
      const now = new Date()
      const row: Row = { id: `obs-${++seq}`, createdAt: now, updatedAt: now, ...data }
      observations.push(row)
      return { ...row }
    }
  },
  dailyCareAction: {
    async create({ data }: { data: Row }) {
      const now = new Date()
      const row: Row = { createdAt: now, updatedAt: now, ...data, id: (data.id as string) ?? `dca-${++seq}` }
      dailyCareActions.push(row)
      return { ...row }
    },
    // In-place update by id (issue 0013 completion commit). Mirrors Prisma: only
    // the keys present in `data` are written, so `?? undefined` callers merge
    // rather than clobber existing values.
    async update({ where, data }: { where: { id: string }; data: Row }) {
      const row = dailyCareActions.find(r => r.id === where.id)
      if (!row) throw new Error(`dailyCareAction ${where.id} not found`)
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined) row[key] = data[key]
      }
      row.updatedAt = new Date()
      return { ...row }
    }
  },
  // present so an accidental processingStatus write would be observable
  voiceNote: {
    async update({ where, data }: { where: { id: string }; data: Row }) {
      voiceNoteWrites++
      const row = voiceNotes.get(where.id) ?? {}
      Object.assign(row, data)
      voiceNotes.set(where.id, row)
      return { ...row }
    },
    async updateMany() {
      voiceNoteWrites++
      return { count: 0 }
    }
  }
}

// ── Deterministic seam mocks (mutable per test) ───────────────────────────────

const VOICE_NOTE_ID = '11111111-1111-4111-8111-111111111111'

// Returns a Partial so a test only states the buckets it cares about; the mock
// wrapper fills the rest (notably `completions: []`) to a full DailyLogExtraction.
let nextExtraction: () => Promise<Partial<DailyLogExtraction>> = async () => ({})

// Captures what createDailyLogSession fed the extraction pass — used to prove
// today's planned actions are injected as the matching candidate list (0013).
let lastExtractionInput: { context: DailyLogContext } | null = null

let nextContext: () => Promise<{ dogId: string; dogName: string; transcript: string } | null> =
  async () => ({ dogId: 'dog-1', dogName: 'Rex', transcript: 'he was limping on his left front leg' })

// ── Production code, imported after mocks are in place ────────────────────────

let service: typeof import('./sessionService.js')

before(async () => {
  const here = import.meta.url
  await mock.module(new URL('../../lib/prisma.ts', here).href, {
    namedExports: { prisma: fakePrisma }
  })
  await mock.module(new URL('./extraction.ts', here).href, {
    namedExports: {
      runDailyLogExtraction: async (input: { context: DailyLogContext }) => {
        lastExtractionInput = input
        const e = await nextExtraction()
        return {
          completions: [],
          observations: [],
          adHocActions: [],
          planChangeSuggestions: [],
          message: '',
          ...e
        }
      }
    }
  })
  await mock.module(new URL('./dailyLogContext.ts', here).href, {
    namedExports: { loadDailyLogContext: async () => nextContext() }
  })
  // resolveTodayLog is the instantiation owner; its planned rows (careActionId not
  // null) are the live contents of the dailyCareActions fake, so seedPlannedAction
  // shows up both in the matching candidate list and as an updatable row.
  await mock.module(new URL('../dailyCare/resolveTodayLog.ts', here).href, {
    namedExports: {
      resolveTodayLog: async () => ({
        dailyLog: { id: 'log-today', dailyCareActions: dailyCareActions.filter(a => a.careActionId != null) }
      }),
      loadTodayPayload: async () => ({ dailyLog: { id: 'log-today' } })
    }
  })

  service = await import('./sessionService.js')
})

beforeEach(() => {
  sessions.clear()
  observations.length = 0
  dailyCareActions.length = 0
  voiceNotes.clear()
  voiceNoteWrites = 0
  lastExtractionInput = null
  nextExtraction = async () => ({})
  nextContext = async () => ({
    dogId: 'dog-1',
    dogName: 'Rex',
    transcript: 'he was limping on his left front leg'
  })
})

/**
 * Seed one of today's instantiated PLANNED DailyCareActions (source PLAN,
 * careActionId set) into the fake. resolveTodayLog's mock surfaces it as a match
 * candidate and the completion commit updates it in place.
 */
function seedPlannedAction(overrides: Partial<Row> & { name?: string } = {}): Row {
  const id = (overrides.id as string) ?? randomUUID()
  const row: Row = {
    id,
    dailyCareLogId: 'log-today',
    careActionId: (overrides.careActionId as string) ?? randomUUID(),
    bucket: overrides.bucket ?? 'MOBILITY',
    source: 'PLAN',
    nameSnapshot: overrides.name ?? 'morning stretches',
    status: overrides.status ?? 'PENDING',
    actualReps: overrides.actualReps ?? null,
    actualDurationSeconds: overrides.actualDurationSeconds ?? null,
    tolerance: overrides.tolerance ?? null,
    voiceNoteId: null,
    completedAt: null,
    completedByUserId: null
  }
  dailyCareActions.push(row)
  return row
}

// ── Create over a seeded observation transcript ───────────────────────────────

describe('DAILY_LOG create — extraction → reviewable draft', () => {
  it('seeded observation transcript → DRAFT_READY with the expected observations[]', async () => {
    nextExtraction = async () => ({
      observations: [
        {
          type: 'LIMPING',
          severity: 'MILD',
          bodyArea: 'left front leg',
          note: 'limping on left front leg',
          extractionConfidence: 0.9,
          needsReview: false
        },
        {
          type: 'LOW_ENERGY',
          severity: null,
          bodyArea: null,
          note: 'seemed tired afterward',
          extractionConfidence: 0.4,
          needsReview: true
        }
      ],
      adHocActions: [],
      planChangeSuggestions: [],
      message: 'Logged a limp and low energy.'
    })

    const { session, error } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    assert.equal(error, null)
    assert.equal(session.kind, 'DAILY_LOG')
    assert.equal(session.status, 'DRAFT_READY')
    assert.equal(session.voiceNoteId, VOICE_NOTE_ID)

    const draft = session.draft as {
      observations: Array<{ changeId: string; type: string; needsReview: boolean }>
      planChangeSuggestions: unknown[]
      completions: unknown[]
      adHocActions: unknown[]
    }
    assert.equal(draft.observations.length, 2)
    assert.equal(draft.observations[0].type, 'LIMPING')
    assert.equal(draft.observations[0].needsReview, false)
    assert.equal(draft.observations[1].type, 'LOW_ENERGY')
    assert.equal(draft.observations[1].needsReview, true)
    // each carries a server-assigned changeId
    assert.ok(draft.observations.every(o => typeof o.changeId === 'string' && o.changeId.length > 0))
    // contract envelope: the other buckets are present-but-empty
    assert.deepEqual(draft.completions, [])
    assert.deepEqual(draft.adHocActions, [])
    assert.deepEqual(draft.planChangeSuggestions, [])
  })

  it('no-care transcript → DRAFT_READY, empty draft, non-empty agent message (not FAILED)', async () => {
    nextExtraction = async () => ({
      observations: [],
      adHocActions: [],
      planChangeSuggestions: [],
      message: "I didn't catch any care to log."
    })

    const { session, error } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    assert.equal(error, null)
    assert.equal(session.status, 'DRAFT_READY')
    assert.notEqual(session.status, 'FAILED')
    const draft = session.draft as { observations: unknown[] }
    assert.deepEqual(draft.observations, [])
    const messages = session.messages as Array<{ role: string; content: string }>
    assert.equal(messages.length, 1)
    assert.equal(messages[0].role, 'assistant')
    assert.ok(messages[0].content.length > 0)
  })

  it('forced extraction error → FAILED; VoiceNote.processingStatus untouched', async () => {
    nextExtraction = async () => {
      throw new Error('LLM unavailable')
    }

    const { session, error } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    assert.equal(session.status, 'FAILED')
    assert.equal(error, 'LLM unavailable')
    // ADR-0003 #10: the durable VoiceNote is never written on extraction failure
    assert.equal(voiceNoteWrites, 0, 'no VoiceNote.processingStatus write on FAILED')
  })

  it('missing VoiceNote → throws VoiceNote not found (controller maps to 404)', async () => {
    nextContext = async () => null
    await assert.rejects(
      service.createDailyLogSession({ dogId: 'dog-1', userId: 'user-1', voiceNoteId: VOICE_NOTE_ID }),
      /VoiceNote not found/
    )
  })
})

// ── Confirm commits selected observations onto today's log ────────────────────

describe('DAILY_LOG confirm — selected observations become HealthObservation rows', () => {
  async function seedTwoObservationDraft() {
    nextExtraction = async () => ({
      observations: [
        {
          type: 'LIMPING',
          severity: 'MILD',
          bodyArea: 'left front leg',
          note: 'limping on left front leg',
          extractionConfidence: 0.9,
          needsReview: false
        },
        {
          type: 'STIFFNESS',
          severity: null,
          bodyArea: null,
          note: 'stiff getting up',
          extractionConfidence: 0.6,
          needsReview: true
        }
      ],
      adHocActions: [],
      planChangeSuggestions: [],
      message: 'Two observations.'
    })
    const { session } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })
    return session
  }

  it('commits exactly the selectedChangeIds onto today log, voiceNoteId set, status COMMITTED', async () => {
    const session = await seedTwoObservationDraft()
    const draft = session.draft as { observations: Array<{ changeId: string; type: string }> }
    const chosen = draft.observations[0]

    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id,
      selectedChangeIds: [chosen.changeId]
    })

    assert.equal(committed, 1, 'exactly the one selected observation is committed')
    assert.equal(observations.length, 1)
    const row = observations[0]
    assert.equal(row.type, 'LIMPING')
    assert.equal(row.dailyCareLogId, 'log-today')
    assert.equal(row.voiceNoteId, VOICE_NOTE_ID)
    assert.equal(row.userId, 'user-1')
    assert.equal(row.dogId, 'dog-1')

    const committedSession = await service.getDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.ok(committedSession)
    assert.equal(committedSession.status, 'COMMITTED')
  })

  it('confirm with no selection commits all draft observations', async () => {
    const session = await seedTwoObservationDraft()
    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.equal(committed, 2)
    assert.equal(observations.length, 2)
  })
})

// ── Ad-hoc DailyCareActions (issue 0012) ──────────────────────────────────────
// Extraction emits adHocActions[]; confirm commits the selected ones as
// DailyCareAction(source: LLM_EXTRACTED, careActionId: null, voiceNoteId).

describe('DAILY_LOG create — extraction → adHocActions[] in the draft', () => {
  it('seeded ad-hoc transcript → DRAFT_READY with the expected adHocActions[] (name/bucket)', async () => {
    nextExtraction = async () => ({
      observations: [],
      adHocActions: [
        {
          name: 'surprise 10-minute walk',
          bucket: 'ACTIVITY',
          actualReps: null,
          actualDurationSeconds: 600,
          extractionConfidence: 0.85,
          needsReview: false
        },
        {
          name: 'shoulder stretch',
          bucket: 'MOBILITY',
          actualReps: 5,
          actualDurationSeconds: null,
          extractionConfidence: 0.4,
          needsReview: true
        }
      ],
      planChangeSuggestions: [],
      message: 'Logged a walk and a stretch.'
    })

    const { session, error } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    assert.equal(error, null)
    assert.equal(session.status, 'DRAFT_READY')

    const draft = session.draft as {
      adHocActions: Array<{
        changeId: string
        name: string
        bucket: string
        actualDurationSeconds: number | null
        actualReps: number | null
        needsReview: boolean
      }>
      observations: unknown[]
    }
    assert.equal(draft.adHocActions.length, 2)
    assert.equal(draft.adHocActions[0].name, 'surprise 10-minute walk')
    assert.equal(draft.adHocActions[0].bucket, 'ACTIVITY')
    assert.equal(draft.adHocActions[0].actualDurationSeconds, 600)
    assert.equal(draft.adHocActions[0].needsReview, false)
    assert.equal(draft.adHocActions[1].name, 'shoulder stretch')
    assert.equal(draft.adHocActions[1].bucket, 'MOBILITY')
    assert.equal(draft.adHocActions[1].actualReps, 5)
    assert.equal(draft.adHocActions[1].needsReview, true)
    // each carries a server-assigned changeId
    assert.ok(draft.adHocActions.every(a => typeof a.changeId === 'string' && a.changeId.length > 0))
    // observation bucket of the same envelope stays empty here
    assert.deepEqual(draft.observations, [])
  })
})

describe('DAILY_LOG confirm — selected ad-hoc actions become DailyCareAction rows', () => {
  async function seedAdHocAndObservationDraft() {
    nextExtraction = async () => ({
      observations: [
        {
          type: 'LIMPING',
          severity: 'MILD',
          bodyArea: 'left front leg',
          note: 'limping on left front leg',
          extractionConfidence: 0.9,
          needsReview: false
        }
      ],
      adHocActions: [
        {
          name: 'surprise 10-minute walk',
          bucket: 'ACTIVITY',
          actualReps: null,
          actualDurationSeconds: 600,
          extractionConfidence: 0.85,
          needsReview: false
        },
        {
          name: 'laser therapy',
          bucket: 'RECOVERY',
          actualReps: null,
          actualDurationSeconds: 300,
          extractionConfidence: 0.5,
          needsReview: true
        }
      ],
      planChangeSuggestions: [],
      message: 'A walk, laser, and a limp.'
    })
    const { session } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })
    return session
  }

  it('commits selected ad-hoc as LLM_EXTRACTED, careActionId null, voiceNoteId set', async () => {
    const session = await seedAdHocAndObservationDraft()
    const draft = session.draft as { adHocActions: Array<{ changeId: string; name: string }> }
    const chosen = draft.adHocActions[0]

    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id,
      selectedChangeIds: [chosen.changeId]
    })

    assert.equal(committed, 1, 'exactly the one selected ad-hoc action is committed')
    assert.equal(dailyCareActions.length, 1)
    assert.equal(observations.length, 0, 'no observation was selected')
    const row = dailyCareActions[0]
    assert.equal(row.source, 'LLM_EXTRACTED')
    assert.equal(row.careActionId, null)
    assert.equal(row.voiceNoteId, VOICE_NOTE_ID)
    assert.equal(row.dailyCareLogId, 'log-today')
    assert.equal(row.nameSnapshot, 'surprise 10-minute walk')
    assert.equal(row.bucket, 'ACTIVITY')
    assert.equal(row.actualDurationSeconds, 600)
    assert.equal(row.status, 'COMPLETED')
    assert.equal(row.completedByUserId, 'user-1')
    assert.equal(row.needsReview, false)

    const committedSession = await service.getDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.equal(committedSession?.status, 'COMMITTED')
  })

  it('multiple ad-hoc rows commit together (careActionId null is not deduped)', async () => {
    const session = await seedAdHocAndObservationDraft()
    const draft = session.draft as { adHocActions: Array<{ changeId: string }> }

    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id,
      selectedChangeIds: draft.adHocActions.map(a => a.changeId)
    })

    assert.equal(committed, 2)
    assert.equal(dailyCareActions.length, 2)
    assert.deepEqual(
      dailyCareActions.map(r => r.nameSnapshot).sort(),
      ['laser therapy', 'surprise 10-minute walk']
    )
    assert.ok(dailyCareActions.every(r => r.careActionId === null && r.voiceNoteId === VOICE_NOTE_ID))
  })

  it('mixed selection commits the observation (with voiceNoteId) AND the ad-hoc action', async () => {
    const session = await seedAdHocAndObservationDraft()
    const draft = session.draft as {
      observations: Array<{ changeId: string }>
      adHocActions: Array<{ changeId: string }>
    }

    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id,
      selectedChangeIds: [draft.observations[0].changeId, draft.adHocActions[0].changeId]
    })

    assert.equal(committed, 2)
    // 0011 observation path still commits with voiceNoteId set
    assert.equal(observations.length, 1)
    assert.equal(observations[0].voiceNoteId, VOICE_NOTE_ID)
    // alongside the new ad-hoc DailyCareAction
    assert.equal(dailyCareActions.length, 1)
    assert.equal(dailyCareActions[0].voiceNoteId, VOICE_NOTE_ID)
  })

  it('confirm with no selection commits all observations AND all ad-hoc actions', async () => {
    const session = await seedAdHocAndObservationDraft()
    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.equal(committed, 3, '1 observation + 2 ad-hoc actions')
    assert.equal(observations.length, 1)
    assert.equal(dailyCareActions.length, 2)
  })
})

// ── Completions: match today's planned actions, update in place, idempotently ──
// Issue 0013. Extraction is mocked (per ADR-0003 we assert routing + commit, not
// model wording); these prove the injection of today's planned actions, the
// completions[] draft, the in-place COMPLETED update keeping source PLAN, and the
// convergence/merge on re-log.

describe('DAILY_LOG create — completion matching against today\'s planned actions', () => {
  it('injects today\'s planned actions as match context and emits a completions[] item referencing the matched dailyCareActionId', async () => {
    const planned = seedPlannedAction({ name: 'hamstring stretches', bucket: 'MOBILITY', status: 'PENDING' })
    nextExtraction = async () => ({
      completions: [
        {
          dailyCareActionId: planned.id as string,
          nameSnapshot: 'hamstring stretches',
          bucket: 'MOBILITY',
          actualReps: 12,
          actualDurationSeconds: null,
          tolerance: 'GOOD',
          extractionConfidence: 0.9,
          needsReview: false
        }
      ],
      message: 'Logged his stretches.'
    })

    const { session, error } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    assert.equal(error, null)
    assert.equal(session.status, 'DRAFT_READY')

    // (criterion 1, injection half) today's planned action is fed to extraction as a candidate
    assert.ok(lastExtractionInput, 'extraction received an input')
    assert.deepEqual(
      lastExtractionInput.context.plannedActions.map(p => p.dailyCareActionId),
      [planned.id]
    )
    assert.equal(lastExtractionInput.context.plannedActions[0].name, 'hamstring stretches')
    assert.equal(lastExtractionInput.context.plannedActions[0].bucket, 'MOBILITY')
    assert.equal(lastExtractionInput.context.plannedActions[0].status, 'PENDING')

    // (criterion 1, draft half) the completion references the correct dailyCareActionId
    const draft = session.draft as {
      completions: Array<{
        changeId: string
        dailyCareActionId: string
        nameSnapshot: string
        bucket: string
        actualReps: number | null
        tolerance: string | null
      }>
      adHocActions: unknown[]
      observations: unknown[]
    }
    assert.equal(draft.completions.length, 1)
    assert.equal(draft.completions[0].dailyCareActionId, planned.id)
    assert.equal(draft.completions[0].nameSnapshot, 'hamstring stretches')
    assert.equal(draft.completions[0].bucket, 'MOBILITY')
    assert.equal(draft.completions[0].actualReps, 12)
    assert.equal(draft.completions[0].tolerance, 'GOOD')
    assert.ok(typeof draft.completions[0].changeId === 'string' && draft.completions[0].changeId.length > 0)
    // the other buckets of the same envelope stay empty here
    assert.deepEqual(draft.adHocActions, [])
    assert.deepEqual(draft.observations, [])
  })

  it('(criterion 4) an activity with no confident match routes to ad-hoc, not a bogus completion', async () => {
    // no planned action seeded; the model routes the surprise walk to ad-hoc
    nextExtraction = async () => ({
      adHocActions: [
        {
          name: 'surprise 10-minute walk',
          bucket: 'ACTIVITY',
          actualReps: null,
          actualDurationSeconds: 600,
          extractionConfidence: 0.8,
          needsReview: false
        }
      ],
      message: 'Logged a walk.'
    })

    const { session } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    const draft = session.draft as { completions: unknown[]; adHocActions: Array<{ name: string }> }
    assert.equal(draft.completions.length, 0, 'no bogus completion')
    assert.equal(draft.adHocActions.length, 1)
    assert.equal(draft.adHocActions[0].name, 'surprise 10-minute walk')
  })

  it('(criterion 4, defensive) a completion referencing an unknown action id is dropped server-side', async () => {
    seedPlannedAction({ name: 'hamstring stretches', bucket: 'MOBILITY' })
    nextExtraction = async () => ({
      completions: [
        {
          dailyCareActionId: randomUUID(), // not one of today's planned ids
          nameSnapshot: 'hamstring stretches',
          bucket: 'MOBILITY',
          actualReps: 10,
          actualDurationSeconds: null,
          tolerance: null,
          extractionConfidence: 0.9,
          needsReview: false
        }
      ],
      message: ''
    })

    const { session } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })

    const draft = session.draft as { completions: unknown[] }
    assert.equal(draft.completions.length, 0, 'hallucinated id dropped — no bogus completion')
  })
})

describe('DAILY_LOG confirm — completions update the matched planned row in place', () => {
  async function seedPlannedCompletionDraft(opts?: {
    actualReps?: number | null
    tolerance?: ExtractedCompletion['tolerance']
  }) {
    const planned = seedPlannedAction({ name: 'hamstring stretches', bucket: 'MOBILITY', status: 'PENDING' })
    // `in`-checks so an explicit `null` means "no value stated", not "use the default".
    const actualReps = opts && 'actualReps' in opts ? opts.actualReps ?? null : 12
    const tolerance = opts && 'tolerance' in opts ? opts.tolerance ?? null : 'GOOD'
    nextExtraction = async () => ({
      completions: [
        {
          dailyCareActionId: planned.id as string,
          nameSnapshot: 'hamstring stretches',
          bucket: 'MOBILITY',
          actualReps,
          actualDurationSeconds: null,
          tolerance,
          extractionConfidence: 0.9,
          needsReview: false
        }
      ],
      message: ''
    })
    const { session } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })
    return { session, planned }
  }

  it('(criterion 2) sets the matched row COMPLETED with actuals + voiceNoteId, keeps source PLAN, no new row', async () => {
    const { session, planned } = await seedPlannedCompletionDraft()
    const before = dailyCareActions.length

    const { committed } = await service.confirmDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })

    assert.equal(committed, 1)
    assert.equal(dailyCareActions.length, before, 'updated in place — no second row created')
    const row = dailyCareActions.find(r => r.id === planned.id)!
    assert.ok(row)
    assert.equal(row.status, 'COMPLETED')
    assert.equal(row.actualReps, 12)
    assert.equal(row.tolerance, 'GOOD')
    assert.equal(row.voiceNoteId, VOICE_NOTE_ID)
    assert.equal(row.completedByUserId, 'user-1')
    assert.ok(row.completedAt)
    assert.equal(row.source, 'PLAN', 'completion keeps source PLAN')
    assert.equal(row.careActionId, planned.careActionId, 'still bound to its CareAction')

    const committedSession = await service.getDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      sessionId: session.id
    })
    assert.equal(committedSession?.status, 'COMMITTED')
  })

  it('(criterion 3) re-logging the same completion converges on the same row and merges later actuals', async () => {
    // First session: "we did his stretches" — no reps stated.
    const { session: s1, planned } = await seedPlannedCompletionDraft({ actualReps: null, tolerance: null })
    await service.confirmDailyLogSession({ dogId: 'dog-1', userId: 'user-1', sessionId: s1.id })

    assert.equal(dailyCareActions.length, 1)
    let row = dailyCareActions.find(r => r.id === planned.id)!
    assert.equal(row.status, 'COMPLETED')
    assert.equal(row.actualReps ?? null, null, 'no reps yet')

    // Second session over the SAME planned row (resolveTodayLog reuses it): "...12 reps".
    nextExtraction = async () => ({
      completions: [
        {
          dailyCareActionId: planned.id as string,
          nameSnapshot: 'hamstring stretches',
          bucket: 'MOBILITY',
          actualReps: 12,
          actualDurationSeconds: null,
          tolerance: 'GOOD',
          extractionConfidence: 0.92,
          needsReview: false
        }
      ],
      message: ''
    })
    const { session: s2 } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })
    await service.confirmDailyLogSession({ dogId: 'dog-1', userId: 'user-1', sessionId: s2.id })

    assert.equal(dailyCareActions.length, 1, 'no second row — converged on the unique planned row')
    row = dailyCareActions.find(r => r.id === planned.id)!
    assert.equal(row.actualReps, 12, 'later actuals merged in')
    assert.equal(row.tolerance, 'GOOD')
  })

  it('a null actual on re-log does not clobber a value already on the row (merge, not overwrite)', async () => {
    // First: 12 reps recorded.
    const { session: s1, planned } = await seedPlannedCompletionDraft({ actualReps: 12, tolerance: 'GOOD' })
    await service.confirmDailyLogSession({ dogId: 'dog-1', userId: 'user-1', sessionId: s1.id })
    assert.equal(dailyCareActions.find(r => r.id === planned.id)!.actualReps, 12)

    // Re-log with no reps stated — must keep the 12.
    nextExtraction = async () => ({
      completions: [
        {
          dailyCareActionId: planned.id as string,
          nameSnapshot: 'hamstring stretches',
          bucket: 'MOBILITY',
          actualReps: null,
          actualDurationSeconds: null,
          tolerance: null,
          extractionConfidence: 0.8,
          needsReview: false
        }
      ],
      message: ''
    })
    const { session: s2 } = await service.createDailyLogSession({
      dogId: 'dog-1',
      userId: 'user-1',
      voiceNoteId: VOICE_NOTE_ID
    })
    await service.confirmDailyLogSession({ dogId: 'dog-1', userId: 'user-1', sessionId: s2.id })

    const row = dailyCareActions.find(r => r.id === planned.id)!
    assert.equal(row.actualReps, 12, 'existing actual preserved through a null re-log')
  })
})

// ── Migration proof: voiceNoteId on the generated DailyCareAction client ───────
// Type-level assertion, enforced by `tsc --noEmit` / `npm run build`: the additive
// migration's column is present on the generated client. `DailyCareActionGroupByOutputType`
// is red (→ `never`, unassignable) before `prisma generate`, green after (see
// [[api-stark-sesh-prisma-field-removal-proof]] — the inverse, presence not absence).
type _DcaHasVoiceNoteId =
  'voiceNoteId' extends keyof DailyCareActionGroupByOutputType ? true : never
const _dcaVoiceNoteIdProof: _DcaHasVoiceNoteId = true

describe('migration — DailyCareAction.voiceNoteId on the generated client', () => {
  it('voiceNoteId is a key of the generated DailyCareAction type', () => {
    assert.equal(_dcaVoiceNoteIdProof, true)
  })
})
