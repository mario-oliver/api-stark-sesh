/**
 * History payload exposes tier on daily rows — machine proof for issue 0020.
 *
 * The history endpoint's log entries gain a `dailyCareActions` array whose rows
 * carry tier + dosage of the LINKED CareAction via the relation join (null for
 * ad-hoc rows), so the web can compute the weekly workout counter (0025).
 * Membership and Prisma are module-mocked; this asserts payload shape, not DB
 * behaviour. `completedCount` keeps its pre-0020 meaning (COMPLETED only).
 */
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyReply } from 'fastify'
import type { DogsController } from './dogsController.js'
import type { AuthenticatedRequest } from '../types/auth.js'

const SIX_FIELDS = [
  'tier',
  'daysPerWeek',
  'targetHoldSeconds',
  'targetSets',
  'restBetweenSetsSeconds',
  'referenceUrl'
] as const

const JOINED_DOSAGE = {
  tier: 'CORE',
  daysPerWeek: 3,
  targetHoldSeconds: 30,
  targetSets: 3,
  restBetweenSetsSeconds: 60,
  referenceUrl: 'https://equicantis.com/exercises/cookie-stretch'
}

type Row = Record<string, unknown>
let capturedFindManyArgs: Row | null = null

const logRow = {
  id: 'log-1',
  date: new Date(Date.UTC(2026, 6, 15)),
  summary: 'good day',
  _count: { dailyCareActions: 3, healthObservations: 1, voiceNotes: 2 },
  dailyCareActions: [
    { id: 'dca-core', careActionId: 'ca-1', status: 'COMPLETED', careAction: { ...JOINED_DOSAGE } },
    { id: 'dca-partial', careActionId: 'ca-2', status: 'PARTIALLY_COMPLETED', careAction: { ...JOINED_DOSAGE, tier: 'ROUTINE' } },
    { id: 'dca-adhoc', careActionId: null, status: 'PENDING', careAction: null }
  ]
}

const fakePrisma = {
  dailyCareLog: {
    async findMany(args: Row) {
      capturedFindManyArgs = args
      return [logRow]
    },
    async count() {
      return 1
    }
  }
}

function fakeReply() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined }
  const reply = {
    status(code: number) {
      state.statusCode = code
      return reply
    },
    send(body: unknown) {
      state.body = body
      return reply
    },
    _state: state
  }
  return reply
}

let controller: DogsController

before(async () => {
  const url = (rel: string) => new URL(rel, import.meta.url).href
  await mock.module(url('../lib/prisma.ts'), {
    namedExports: { prisma: fakePrisma }
  })
  await mock.module(url('../lib/dogAccess.ts'), {
    namedExports: {
      assertDogMemberAccess: async () => ({ role: 'caregiver' }),
      getDogForMember: async () => null
    }
  })
  const mod = await import('./dogsController.js')
  controller = new mod.DogsController()
})

describe('GET /dogs/:id/history — rows expose tier via the CareAction join (0020)', () => {
  it('log entries carry dailyCareActions rows with tier + dosage; ad-hoc rows null', async () => {
    const reply = fakeReply()
    const request = {
      params: { id: 'dog-1' },
      query: {},
      user: { id: 'user-1' }
    } as unknown as AuthenticatedRequest

    await controller.getHistory(request, reply as unknown as FastifyReply)

    assert.equal(reply._state.statusCode, 200)
    const body = reply._state.body as {
      data: {
        logs: Array<Row & { dailyCareActions: Row[] }>
        pagination: Row
      }
    }
    const log = body.data.logs[0]
    assert.ok(log, 'history must return the log entry')

    // The query must join the new columns (no snapshot on DailyCareAction).
    const select = (
      ((capturedFindManyArgs?.include as Row)?.dailyCareActions as Row)?.select as Row
    )?.careAction as { select: Record<string, boolean> } | undefined
    assert.ok(select, 'history query must join careAction')
    for (const field of SIX_FIELDS) {
      assert.equal(select.select[field], true, `history query must select ${field}`)
    }

    assert.equal(log.dailyCareActions.length, 3)
    const coreRow = log.dailyCareActions.find(a => a.id === 'dca-core')
    assert.ok(coreRow)
    for (const field of SIX_FIELDS) {
      assert.equal(coreRow[field], JOINED_DOSAGE[field], `history row must expose ${field}`)
    }
    assert.equal(coreRow.status, 'COMPLETED')

    const routineRow = log.dailyCareActions.find(a => a.id === 'dca-partial')
    assert.ok(routineRow)
    assert.equal(routineRow.tier, 'ROUTINE')

    const adHocRow = log.dailyCareActions.find(a => a.id === 'dca-adhoc')
    assert.ok(adHocRow)
    for (const field of SIX_FIELDS) {
      assert.equal(adHocRow[field], null, `ad-hoc history row must expose ${field} as null`)
    }

    // Pre-0020 aggregates keep their meaning: COMPLETED only, totals from _count.
    assert.equal(log.completedCount, 1)
    assert.equal(log.totalActions, 3)
    assert.equal(log.observationCount, 1)
    assert.equal(log.voiceNoteCount, 2)
    assert.deepEqual(body.data.pagination, { page: 1, limit: 20, total: 1, pages: 1 })
  })
})
