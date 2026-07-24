/**
 * Create-on-do write path (issue 0031 / PRD §Contract, frozen).
 *
 * Drives the real `createPlannedDailyCareAction` against an in-memory Prisma
 * fake. Machine proof of the frozen contract:
 *  - creates the day's DailyCareLog when missing;
 *  - snapshots name / description / instructions from the CareAction, source PLAN;
 *  - defaults status PENDING; explicit COMPLETED stamps completedAt / completedBy;
 *  - returns the today-row shape carrying tier + the six dosage keys;
 *  - returns null (→ 404) when the careActionId is not on the dog's active plan;
 *  - returns a conflict (→ 409) carrying the existing row's id on a repeat POST
 *    for the same (log, careActionId), via a fast pre-check and a race-safe
 *    P2002 catch — the schema's @@unique([dailyCareLogId, careActionId]) stands.
 */
import { describe, it, before, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'

type Row = Record<string, unknown>

// One CORE plan action on dog-1's active plan.
const PLAN_ACTION: Row = {
  id: 'ca-core-1',
  name: 'Ground Poles',
  description: 'Controlled walk over the pole',
  instructions: 'Encourage a steady controlled walk over the pole(s).',
  bucket: 'ACTIVITY',
  isActive: true,
  targetReps: 6,
  targetDurationSeconds: null,
  sortOrder: 5,
  tier: 'CORE',
  daysPerWeek: 3,
  targetHoldSeconds: null,
  targetSets: 2,
  restBetweenSetsSeconds: 120,
  referenceUrl: null
}

const createdLogs: Row[] = []
const createdActions: Row[] = []
let logSeq = 0
let actionSeq = 0

const fakePrisma = {
  careAction: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findFirst({ where }: any) {
      const onActivePlan =
        where.isActive === true &&
        where.carePlan?.dogId === 'dog-1' &&
        where.carePlan?.isActive === true
      if (!onActivePlan) return null
      return where.id === PLAN_ACTION.id ? { ...PLAN_ACTION } : null
    }
  },
  dailyCareLog: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findUnique({ where }: any) {
      const { dogId, date } = where.dogId_date
      return (
        createdLogs.find(
          l => l.dogId === dogId && (l.date as Date).getTime() === (date as Date).getTime()
        ) ?? null
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async create({ data }: any) {
      const log: Row = { id: `log-${++logSeq}`, dogId: data.dogId, date: data.date }
      createdLogs.push(log)
      return log
    }
  },
  dailyCareAction: {
    // When true, the NEXT create simulates losing the unique-slot race: a
    // concurrent writer's row lands in the store and our insert throws P2002.
    __raceP2002: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async findFirst({ where }: any) {
      return (
        createdActions.find(
          a =>
            a.dailyCareLogId === where.dailyCareLogId && a.careActionId === where.careActionId
        ) ?? null
      )
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async create({ data }: any) {
      if (fakePrisma.dailyCareAction.__raceP2002) {
        fakePrisma.dailyCareAction.__raceP2002 = false
        // A concurrent writer won the unique (log, careActionId) slot.
        createdActions.push({
          id: 'dca-concurrent',
          dailyCareLogId: data.dailyCareLogId,
          careActionId: data.careActionId ?? null
        })
        const err = Object.assign(new Error('Unique constraint failed'), {
          code: 'P2002',
          meta: { target: ['dailyCareLogId', 'careActionId'] }
        })
        throw err
      }
      const now = new Date()
      const row: Row = {
        id: `dca-${++actionSeq}`,
        dailyCareLogId: data.dailyCareLogId,
        careActionId: data.careActionId ?? null,
        bucket: data.bucket,
        source: data.source,
        nameSnapshot: data.nameSnapshot,
        descriptionSnapshot: data.descriptionSnapshot ?? null,
        instructionsSnapshot: data.instructionsSnapshot ?? null,
        status: data.status,
        completedAt: data.completedAt ?? null,
        completedByUserId: data.completedByUserId ?? null,
        notes: data.notes ?? null,
        tolerance: data.tolerance ?? null,
        targetReps: data.targetReps ?? null,
        actualReps: data.actualReps ?? null,
        targetDurationSeconds: data.targetDurationSeconds ?? null,
        actualDurationSeconds: data.actualDurationSeconds ?? null,
        substitutedForTaskId: null,
        metadata: data.metadata ?? null,
        extractionConfidence: null,
        needsReview: false,
        sortOrder: data.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
        completedBy: data.completedByUserId
          ? { id: data.completedByUserId, email: 'u@test.invalid', firstName: null, lastName: null }
          : null,
        substitutedFor: null,
        careAction: {
          targetReps: PLAN_ACTION.targetReps,
          targetDurationSeconds: PLAN_ACTION.targetDurationSeconds,
          tier: PLAN_ACTION.tier,
          daysPerWeek: PLAN_ACTION.daysPerWeek,
          targetHoldSeconds: PLAN_ACTION.targetHoldSeconds,
          targetSets: PLAN_ACTION.targetSets,
          restBetweenSetsSeconds: PLAN_ACTION.restBetweenSetsSeconds,
          referenceUrl: PLAN_ACTION.referenceUrl
        }
      }
      createdActions.push(row)
      return { ...row }
    }
  }
}

let createPlannedDailyCareAction: typeof import('./dailyCareActionEntries.js')['createPlannedDailyCareAction']

type CreateResult = Awaited<ReturnType<typeof createPlannedDailyCareAction>>
type CreatedAction = Exclude<CreateResult, null | { conflict: true }>

/** Narrows the create result to a created action (fails on null / conflict). */
function assertCreated(row: CreateResult): asserts row is CreatedAction {
  assert.ok(row !== null && !('conflict' in row), 'expected a created action, not null/conflict')
}

before(async () => {
  await mock.module(new URL('../../lib/prisma.ts', import.meta.url).href, {
    namedExports: { prisma: fakePrisma }
  })
  ;({ createPlannedDailyCareAction } = await import('./dailyCareActionEntries.js'))
})

beforeEach(() => {
  createdLogs.length = 0
  createdActions.length = 0
  logSeq = 0
  actionSeq = 0
  fakePrisma.dailyCareAction.__raceP2002 = false
})

describe('createPlannedDailyCareAction — create-on-do (0031)', () => {
  it('creates the day log if missing, snapshots, defaults PENDING, returns tier+dosage row shape', async () => {
    const row = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1'
    })

    assertCreated(row)
    // The day's DailyCareLog was created because none existed.
    assert.equal(createdLogs.length, 1)
    assert.equal(row!.dailyCareLogId, createdLogs[0].id)

    // Snapshots + source.
    assert.equal(row!.source, 'PLAN')
    assert.equal(row!.careActionId, 'ca-core-1')
    assert.equal(row!.nameSnapshot, 'Ground Poles')
    assert.equal(row!.descriptionSnapshot, 'Controlled walk over the pole')
    assert.equal(row!.instructionsSnapshot, PLAN_ACTION.instructions)

    // Default status PENDING (video-attach-before-resolution case).
    assert.equal(row!.status, 'PENDING')
    assert.equal(row!.completedAt, null)
    assert.equal(row!.completedByUserId, null)

    // Today-row shape: tier + the six dosage keys, from the CareAction join.
    assert.equal(row!.tier, 'CORE')
    for (const k of [
      'tier',
      'daysPerWeek',
      'targetHoldSeconds',
      'targetSets',
      'restBetweenSetsSeconds',
      'referenceUrl'
    ]) {
      assert.ok(k in row!, `row must carry ${k}`)
    }
    assert.equal(row!.targetSets, 2)
    assert.equal(row!.daysPerWeek, 3)
  })

  it('reuses an existing day log rather than creating a second', async () => {
    await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1'
    })
    assert.equal(createdLogs.length, 1)
    await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1'
    })
    // Still one log for the (dog, date); the second call did not create another.
    assert.equal(createdLogs.length, 1)
  })

  it('stamps completedAt / completedBy when status is COMPLETED', async () => {
    const row = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1',
      status: 'COMPLETED',
      actualReps: 6
    })
    assertCreated(row)
    assert.equal(row!.status, 'COMPLETED')
    assert.ok(row!.completedAt)
    assert.equal(row!.completedByUserId, 'user-1')
    assert.equal(row!.actualReps, 6)
  })

  it('returns null (→ 404) when the careActionId is not on the active plan', async () => {
    const row = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-not-on-plan'
    })
    assert.equal(row, null)
    assert.equal(createdActions.length, 0)
  })

  it('returns a conflict carrying the existing row id on repeat POST (no duplicate row)', async () => {
    // Contract amended: @@unique([dailyCareLogId, careActionId]) stands, so a
    // second POST for the same pair is a 409 conflict, not a fresh row.
    const first = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1',
      status: 'COMPLETED'
    })
    assert.ok(first && !('conflict' in first))
    const firstId = (first as { id: string }).id

    const second = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1',
      status: 'COMPLETED'
    })
    assert.ok(second && 'conflict' in second && second.conflict === true)
    assert.equal((second as { existingId: string }).existingId, firstId)
    // The fast pre-check short-circuited: no second row was written.
    assert.equal(createdActions.length, 1)
  })

  it('resolves a lost P2002 race to the same conflict (existing row id, race-safe)', async () => {
    // Pre-check sees nothing, but a concurrent writer wins the unique slot and
    // our insert throws P2002 — the catch must resolve it to a 409 conflict.
    fakePrisma.dailyCareAction.__raceP2002 = true
    const result = await createPlannedDailyCareAction('dog-1', 'user-1', {
      date: '2026-07-15',
      careActionId: 'ca-core-1'
    })
    assert.ok(result && 'conflict' in result && result.conflict === true)
    assert.equal((result as { existingId: string }).existingId, 'dca-concurrent')
    // Only the concurrent writer's row exists; ours was never persisted.
    assert.equal(createdActions.length, 1)
  })
})
