/**
 * Issue 0021 — instantiation behaviour of the seeded Plan 2 (asserts EXISTING
 * resolveTodayLog logic; no changes to it).
 *
 * context.md#instantiation: AS_NEEDED actions are never auto-instantiated into
 * Today; scheduled (DAILY) actions are. Driven through the real resolveTodayLog
 * against an in-memory Prisma fake seeded with Vicky's 15 rows: the 13 DAILY
 * rows land as today's DailyCareActions, the 2 AS_NEEDED rows ("Backing Up",
 * "All Four Leg Lifts") do not.
 */
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { VICKY_PLAN_2_ACTIONS, VICKY_PLAN_2_NAME } from './vickyPlan2.js'

type Row = Record<string, unknown>

const PLAN_CREATED_AT = new Date('2026-06-26T00:00:00.000Z')

// The 15 plan CareActions as DB rows (ids ca-1..ca-15), built from the data file.
const planActions: Row[] = VICKY_PLAN_2_ACTIONS.map((a, i) => ({
  id: `ca-${i + 1}`,
  carePlanId: 'plan-2',
  name: a.name,
  description: null,
  bucket: a.bucket,
  frequency: a.frequency,
  timeOfDay: a.timeOfDay,
  targetReps: a.targetReps,
  targetDurationSeconds: a.targetDurationSeconds,
  tier: a.tier,
  daysPerWeek: a.daysPerWeek,
  targetHoldSeconds: a.targetHoldSeconds,
  targetSets: a.targetSets,
  restBetweenSetsSeconds: a.restBetweenSetsSeconds,
  referenceUrl: a.referenceUrl,
  instructions: a.instructions,
  sortOrder: a.sortOrder,
  isActive: true
}))

const createdDailyActions: Row[] = []
let seq = 0

const fakePrisma = {
  voiceNote: {
    async updateMany() {
      return { count: 0 }
    }
  },
  carePlan: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findFirst({ where, include }: any) {
      if (!(where.dogId === 'dog-1' && where.isActive === true)) return null
      const plan: Row = {
        id: 'plan-2',
        dogId: 'dog-1',
        name: VICKY_PLAN_2_NAME,
        isActive: true,
        createdAt: PLAN_CREATED_AT,
        updatedAt: PLAN_CREATED_AT
      }
      if (include?.actions) {
        let acts = planActions.filter(a => a.carePlanId === 'plan-2')
        if (include.actions.where?.isActive !== undefined) {
          acts = acts.filter(a => a.isActive === include.actions.where.isActive)
        }
        acts = [...acts].sort((x, y) => (x.sortOrder as number) - (y.sortOrder as number))
        plan.actions = acts.map(a => ({ ...a }))
      }
      return plan
    }
  },
  dailyCareLog: {
    async findUnique() {
      return null
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async create({ data }: any) {
      return { id: 'log-1', dogId: data.dogId, date: data.date }
    },
    async findUniqueOrThrow() {
      const rows = [...createdDailyActions].sort(
        (a, b) => (a.sortOrder as number) - (b.sortOrder as number)
      )
      return {
        id: 'log-1',
        dogId: 'dog-1',
        date: new Date(Date.UTC(2026, 6, 15)),
        summary: null,
        bucketScores: null,
        scoreComputedAt: null,
        scoreInputVersion: null,
        dailyCareActions: rows,
        voiceNotes: [],
        healthObservations: [],
        videoClips: []
      }
    }
  },
  dailyCareAction: {
    async findMany() {
      // Nothing instantiated yet for this log.
      return []
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async create({ data }: any) {
      const linked = planActions.find(a => a.id === data.careActionId)
      const now = new Date()
      const row: Row = {
        id: `dca-${++seq}`,
        dailyCareLogId: data.dailyCareLogId,
        careActionId: data.careActionId ?? null,
        bucket: data.bucket,
        source: data.source ?? 'PLAN',
        nameSnapshot: data.nameSnapshot,
        descriptionSnapshot: data.descriptionSnapshot ?? null,
        instructionsSnapshot: data.instructionsSnapshot ?? null,
        status: data.status ?? 'PENDING',
        completedAt: null,
        completedByUserId: null,
        notes: null,
        tolerance: null,
        targetReps: data.targetReps ?? null,
        actualReps: null,
        targetDurationSeconds: data.targetDurationSeconds ?? null,
        actualDurationSeconds: null,
        substitutedForTaskId: null,
        metadata: null,
        extractionConfidence: null,
        needsReview: false,
        sortOrder: data.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
        completedBy: null,
        substitutedFor: null,
        careAction: linked
          ? {
              targetReps: linked.targetReps,
              targetDurationSeconds: linked.targetDurationSeconds,
              tier: linked.tier,
              daysPerWeek: linked.daysPerWeek,
              targetHoldSeconds: linked.targetHoldSeconds,
              targetSets: linked.targetSets,
              restBetweenSetsSeconds: linked.restBetweenSetsSeconds,
              referenceUrl: linked.referenceUrl
            }
          : null
      }
      createdDailyActions.push(row)
      return { ...row }
    }
  },
  // resolveTodayLog batches the creates as an array passed to $transaction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async $transaction(arg: any) {
    if (Array.isArray(arg)) return Promise.all(arg)
    return arg(fakePrisma)
  },
  dog: {
    async findUniqueOrThrow() {
      return {
        id: 'dog-1',
        name: 'Stark',
        breed: null,
        age: null,
        sex: null,
        weightLbs: null,
        condition: null,
        vetName: null,
        vetPhone: null,
        photoKey: null,
        notes: null,
        shareCode: 'STARKSEED01',
        createdAt: PLAN_CREATED_AT,
        updatedAt: PLAN_CREATED_AT
      }
    }
  }
}

let resolveTodayLog: typeof import('../dailyCare/resolveTodayLog.js')['resolveTodayLog']

before(async () => {
  await mock.module(new URL('../../lib/prisma.ts', import.meta.url).href, {
    namedExports: { prisma: fakePrisma }
  })
  ;({ resolveTodayLog } = await import('../dailyCare/resolveTodayLog.js'))
})

describe('Plan 2 instantiation — AS_NEEDED excluded, DAILY included (0021)', () => {
  it('instantiates the 13 DAILY rows and never the 2 AS_NEEDED rows', async () => {
    const payload = await resolveTodayLog('dog-1', '2026-07-15')

    const rows = payload.dailyLog.dailyCareActions
    const instantiatedNames = new Set(rows.map(r => r.nameSnapshot))
    const instantiatedIds = new Set(rows.map(r => r.careActionId))

    // Every instantiated row is plan-sourced.
    for (const r of rows) assert.equal(r.source, 'PLAN')

    // Exactly the 13 DAILY actions were instantiated.
    const dailyActions = VICKY_PLAN_2_ACTIONS.filter(a => a.frequency === 'DAILY')
    const asNeededActions = VICKY_PLAN_2_ACTIONS.filter(a => a.frequency === 'AS_NEEDED')
    assert.equal(dailyActions.length, 13)
    assert.equal(asNeededActions.length, 2)
    assert.equal(rows.length, 13)

    for (const a of dailyActions) {
      assert.ok(instantiatedNames.has(a.name), `DAILY "${a.name}" must be instantiated`)
    }

    // The AS_NEEDED rows are absent from today's actions.
    for (const a of asNeededActions) {
      assert.ok(!instantiatedNames.has(a.name), `AS_NEEDED "${a.name}" must NOT be instantiated`)
    }
    // ca-6 (Backing Up) and ca-7 (All Four Leg Lifts) never appear.
    assert.ok(!instantiatedIds.has('ca-6'))
    assert.ok(!instantiatedIds.has('ca-7'))
    assert.ok(instantiatedIds.has('ca-1'))
    assert.ok(instantiatedIds.has('ca-15'))
  })
})
