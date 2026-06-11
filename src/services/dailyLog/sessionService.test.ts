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
import type { DailyLogExtraction } from './types.js'

// ── In-memory Prisma fake ─────────────────────────────────────────────────────

type Row = Record<string, unknown>
const sessions = new Map<string, Row>()
const observations: Row[] = []
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

let nextExtraction: () => Promise<DailyLogExtraction> = async () => ({
  observations: [],
  planChangeSuggestions: [],
  message: ''
})

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
    namedExports: { runDailyLogExtraction: async () => nextExtraction() }
  })
  await mock.module(new URL('./dailyLogContext.ts', here).href, {
    namedExports: { loadDailyLogContext: async () => nextContext() }
  })
  await mock.module(new URL('../dailyCare/resolveTodayLog.ts', here).href, {
    namedExports: {
      resolveTodayLog: async () => ({ dailyLog: { id: 'log-today' } }),
      loadTodayPayload: async () => ({ dailyLog: { id: 'log-today' } })
    }
  })

  service = await import('./sessionService.js')
})

beforeEach(() => {
  sessions.clear()
  observations.length = 0
  voiceNotes.clear()
  voiceNoteWrites = 0
  nextContext = async () => ({
    dogId: 'dog-1',
    dogName: 'Rex',
    transcript: 'he was limping on his left front leg'
  })
})

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
