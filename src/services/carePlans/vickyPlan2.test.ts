/**
 * Issue 0021 — Vicky's Plan 2 import: exactness + idempotency + prior-plan
 * deactivation. All DB-free.
 *
 *  Gate 1 (data file): the 15 rows equal the PRD's Plan 2 seed table verbatim
 *    — names (incl. Left/Right), buckets, tiers, frequency, dosage ints,
 *    referenceUrl only on Stairs Hip Stretch, timeOfDay ANYTIME throughout,
 *    sortOrder = listed order.
 *  Gate 2 (import): the committed importVickyPlan2 against an in-memory Prisma
 *    fake creates exactly those 15 rows on one active plan, deactivates the prior
 *    active plan, and is a no-op on re-run (one active plan, 15 rows, no dupes).
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '../../generated/client.js'
import { importVickyPlan2 } from './importVickyPlan2.js'
import {
  VICKY_PLAN_2_ACTIONS,
  VICKY_PLAN_2_NAME,
  VICKY_PLAN_2_NOTES
} from './vickyPlan2.js'

// ── Gate 1: data-file exactness ───────────────────────────────────────────────

type ExpectedRow = {
  name: string
  bucket: string
  tier: string
  frequency: string
  daysPerWeek: number | null
  targetReps: number | null
  targetHoldSeconds: number | null
  targetSets: number | null
  restBetweenSetsSeconds: number | null
  referenceUrl: string | null
}

// The frozen PRD "Plan 2 seed content" table — the source of truth this data
// file must reproduce.
const EXPECTED: ExpectedRow[] = [
  { name: 'Step Up + Head Stretch — Left',  bucket: 'MOBILITY', tier: 'CORE',      frequency: 'DAILY',     daysPerWeek: 3,    targetReps: 5,    targetHoldSeconds: 3,    targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Step Up + Head Stretch — Right', bucket: 'MOBILITY', tier: 'CORE',      frequency: 'DAILY',     daysPerWeek: 3,    targetReps: 5,    targetHoldSeconds: 3,    targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Walk-Through, Hind Legs on Platform', bucket: 'ACTIVITY', tier: 'CORE', frequency: 'DAILY',     daysPerWeek: 3,    targetReps: 3,    targetHoldSeconds: 10,   targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Modified Sit to Stand on Knee',  bucket: 'ACTIVITY', tier: 'CORE',      frequency: 'DAILY',     daysPerWeek: 3,    targetReps: 4,    targetHoldSeconds: null, targetSets: 2,    restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Ground Poles',                   bucket: 'ACTIVITY', tier: 'CORE',      frequency: 'DAILY',     daysPerWeek: 3,    targetReps: 6,    targetHoldSeconds: null, targetSets: 2,    restBetweenSetsSeconds: 120,  referenceUrl: null },
  { name: 'Backing Up',                     bucket: 'ACTIVITY', tier: 'AS_NEEDED', frequency: 'AS_NEEDED', daysPerWeek: null, targetReps: 3,    targetHoldSeconds: null, targetSets: 1,    restBetweenSetsSeconds: 180,  referenceUrl: null },
  { name: 'All Four Leg Lifts',             bucket: 'ACTIVITY', tier: 'AS_NEEDED', frequency: 'AS_NEEDED', daysPerWeek: null, targetReps: 1,    targetHoldSeconds: 10,   targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Large Circles',                  bucket: 'ACTIVITY', tier: 'ON_WALKS',  frequency: 'DAILY',     daysPerWeek: null, targetReps: 2,    targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'Stairs Hip Stretch',             bucket: 'MOBILITY', tier: 'ON_WALKS',  frequency: 'DAILY',     daysPerWeek: null, targetReps: null, targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: 'https://www.youtube.com/watch?v=DtUvGctKHdY' },
  { name: 'ROM — Elbow, Left',              bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'ROM — Elbow, Right',             bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'ROM — Shoulder, Left',           bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'ROM — Shoulder, Right',          bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'ROM — Hip, Left',                bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null },
  { name: 'ROM — Hip, Right',               bucket: 'MOBILITY', tier: 'ROUTINE',   frequency: 'DAILY',     daysPerWeek: 7,    targetReps: 15,   targetHoldSeconds: null, targetSets: null, restBetweenSetsSeconds: null, referenceUrl: null }
]

describe('Vicky Plan 2 data file — exact PRD seed table (0021)', () => {
  it('has exactly 15 rows named "Plan 2 — June 26, 2026"', () => {
    assert.equal(VICKY_PLAN_2_NAME, 'Plan 2 — June 26, 2026')
    assert.equal(VICKY_PLAN_2_ACTIONS.length, 15)
    assert.equal(EXPECTED.length, 15)
  })

  it('every row matches the PRD table field-for-field, in listed order', () => {
    VICKY_PLAN_2_ACTIONS.forEach((row, i) => {
      const want = EXPECTED[i]
      assert.equal(row.name, want.name, `row ${i + 1} name`)
      assert.equal(row.bucket, want.bucket, `${want.name} bucket`)
      assert.equal(row.tier, want.tier, `${want.name} tier`)
      assert.equal(row.frequency, want.frequency, `${want.name} frequency`)
      assert.equal(row.daysPerWeek, want.daysPerWeek, `${want.name} daysPerWeek`)
      assert.equal(row.targetReps, want.targetReps, `${want.name} targetReps`)
      assert.equal(row.targetHoldSeconds, want.targetHoldSeconds, `${want.name} targetHoldSeconds`)
      assert.equal(row.targetSets, want.targetSets, `${want.name} targetSets`)
      assert.equal(
        row.restBetweenSetsSeconds,
        want.restBetweenSetsSeconds,
        `${want.name} restBetweenSetsSeconds`
      )
      assert.equal(row.referenceUrl, want.referenceUrl, `${want.name} referenceUrl`)
      // Conventions that hold for every row.
      assert.equal(row.timeOfDay, 'ANYTIME', `${want.name} timeOfDay`)
      assert.equal(row.sortOrder, i + 1, `${want.name} sortOrder`)
      assert.ok(row.instructions.length > 0, `${want.name} has instructions`)
    })
  })

  it('referenceUrl is present ONLY on Stairs Hip Stretch', () => {
    const withUrl = VICKY_PLAN_2_ACTIONS.filter(r => r.referenceUrl !== null)
    assert.equal(withUrl.length, 1)
    assert.equal(withUrl[0].name, 'Stairs Hip Stretch')
  })

  it('AS_NEEDED (tier and frequency) applies only to the two email "as needed" rows', () => {
    const asNeeded = VICKY_PLAN_2_ACTIONS.filter(r => r.frequency === 'AS_NEEDED')
    assert.deepEqual(
      asNeeded.map(r => r.name),
      ['Backing Up', 'All Four Leg Lifts']
    )
    for (const r of asNeeded) assert.equal(r.tier, 'AS_NEEDED', `${r.name} tier`)
  })

  it('includes both left/right Step Up head stretches and all six ROM joints', () => {
    const names = new Set(VICKY_PLAN_2_ACTIONS.map(r => r.name))
    for (const n of [
      'Step Up + Head Stretch — Left',
      'Step Up + Head Stretch — Right',
      'ROM — Elbow, Left',
      'ROM — Elbow, Right',
      'ROM — Shoulder, Left',
      'ROM — Shoulder, Right',
      'ROM — Hip, Left',
      'ROM — Hip, Right'
    ]) {
      assert.ok(names.has(n), `missing ${n}`)
    }
  })

  it('exports plan-level notes for UI reuse', () => {
    assert.match(VICKY_PLAN_2_NOTES, /3 to 4 days a week/)
    assert.match(VICKY_PLAN_2_NOTES, /Progress to 2 sets/)
    assert.match(VICKY_PLAN_2_NOTES, /top 4/)
  })
})

// ── Gate 2: import against an in-memory Prisma fake ───────────────────────────

type PlanRow = {
  id: string
  dogId: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
type ActionRow = Record<string, unknown> & { id: string; carePlanId: string }

function makeFake() {
  const plans: PlanRow[] = []
  const actions: ActionRow[] = []
  let seq = 0

  const client = {
    carePlan: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async findFirst({ where, include }: any) {
        const plan = plans.find(
          p => p.dogId === where.dogId && (where.name === undefined || p.name === where.name)
        )
        if (!plan) return null
        const result: Record<string, unknown> = { ...plan }
        if (include?.actions) {
          result.actions = actions
            .filter(a => a.carePlanId === plan.id)
            .map(a => (include.actions.select?.id ? { id: a.id } : { ...a }))
        }
        return result
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async findMany({ where, select }: any) {
        return plans
          .filter(
            p =>
              (where.dogId === undefined || p.dogId === where.dogId) &&
              (where.isActive === undefined || p.isActive === where.isActive)
          )
          .map(p => (select?.id ? { id: p.id } : { ...p }))
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async updateMany({ where, data }: any) {
        let count = 0
        for (const p of plans) {
          if (
            (where.dogId === undefined || p.dogId === where.dogId) &&
            (where.isActive === undefined || p.isActive === where.isActive)
          ) {
            Object.assign(p, data)
            count++
          }
        }
        return { count }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async create({ data, include }: any) {
        const now = new Date()
        const plan: PlanRow = {
          id: `plan-${++seq}`,
          dogId: data.dogId,
          name: data.name,
          isActive: data.isActive ?? true,
          createdAt: now,
          updatedAt: now
        }
        plans.push(plan)
        const created: ActionRow[] = []
        for (const a of data.actions?.create ?? []) {
          const row: ActionRow = { id: `ca-${++seq}`, carePlanId: plan.id, isActive: true, ...a }
          actions.push(row)
          created.push(row)
        }
        const result: Record<string, unknown> = { ...plan }
        if (include?.actions) result.actions = created.map(a => ({ ...a }))
        return result
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $transaction(fn: any) {
      return fn(client)
    },
    _state: { plans, actions }
  }
  return client
}

let fake: ReturnType<typeof makeFake>

beforeEach(() => {
  fake = makeFake()
  // Prior active plan the import must deactivate.
  fake._state.plans.push({
    id: 'prior-plan',
    dogId: 'dog-1',
    name: 'Hip & post-op recovery plan',
    isActive: true,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z')
  })
})

const asPrisma = () => fake as unknown as PrismaClient

function activePlans() {
  return fake._state.plans.filter(p => p.isActive)
}
function actionsOf(planId: string) {
  return fake._state.actions.filter(a => a.carePlanId === planId)
}

describe('importVickyPlan2 — create + deactivate prior (0021)', () => {
  it('creates exactly 15 rows on one active plan and deactivates the prior plan', async () => {
    const result = await importVickyPlan2(asPrisma(), 'dog-1')

    assert.equal(result.created, true)
    assert.equal(result.planName, VICKY_PLAN_2_NAME)
    assert.equal(result.actionCount, 15)
    assert.deepEqual(result.deactivatedPlanIds, ['prior-plan'])

    // Exactly one active plan, and it is Plan 2.
    assert.equal(activePlans().length, 1)
    assert.equal(activePlans()[0].name, VICKY_PLAN_2_NAME)
    assert.equal(fake._state.plans.find(p => p.id === 'prior-plan')!.isActive, false)

    // The created rows equal the data file exactly (script output == data file).
    const rows = actionsOf(result.planId).sort(
      (a, b) => (a.sortOrder as number) - (b.sortOrder as number)
    )
    assert.equal(rows.length, 15)
    rows.forEach((row, i) => {
      const want = VICKY_PLAN_2_ACTIONS[i]
      assert.equal(row.name, want.name)
      assert.equal(row.bucket, want.bucket)
      assert.equal(row.tier, want.tier)
      assert.equal(row.frequency, want.frequency)
      assert.equal(row.timeOfDay, want.timeOfDay)
      assert.equal(row.daysPerWeek, want.daysPerWeek)
      assert.equal(row.targetReps, want.targetReps)
      assert.equal(row.targetHoldSeconds, want.targetHoldSeconds)
      assert.equal(row.targetSets, want.targetSets)
      assert.equal(row.restBetweenSetsSeconds, want.restBetweenSetsSeconds)
      assert.equal(row.referenceUrl, want.referenceUrl)
      assert.equal(row.instructions, want.instructions)
      assert.equal(row.sortOrder, want.sortOrder)
    })
  })

  it('is idempotent: re-run makes no changes — one active plan, 15 rows, no dupes', async () => {
    const first = await importVickyPlan2(asPrisma(), 'dog-1')
    assert.equal(first.created, true)

    const second = await importVickyPlan2(asPrisma(), 'dog-1')
    assert.equal(second.created, false)
    assert.equal(second.actionCount, 15)
    assert.deepEqual(second.deactivatedPlanIds, [])
    assert.equal(second.planId, first.planId)

    // One active plan, 15 rows total (no duplication), prior stays inactive.
    assert.equal(activePlans().length, 1)
    assert.equal(activePlans()[0].name, VICKY_PLAN_2_NAME)
    assert.equal(actionsOf(first.planId).length, 15)
    assert.equal(fake._state.actions.length, 15)
    assert.equal(fake._state.plans.filter(p => p.name === VICKY_PLAN_2_NAME).length, 1)
    assert.equal(fake._state.plans.find(p => p.id === 'prior-plan')!.isActive, false)
  })

  it('creates the plan active even when there is no prior plan to deactivate', async () => {
    // Fresh dog with no plans.
    const result = await importVickyPlan2(asPrisma(), 'dog-2')
    assert.equal(result.created, true)
    assert.deepEqual(result.deactivatedPlanIds, [])
    assert.equal(activePlans().filter(p => p.dogId === 'dog-2').length, 1)
    assert.equal(actionsOf(result.planId).length, 15)
  })
})
