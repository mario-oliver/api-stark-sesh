/**
 * Tier + Vicky dosage fields on CareAction — machine proof for issue 0020.
 *
 * Three gates, all DB-free:
 *  1. Request contract: create/update zod schemas accept the six new fields
 *     (all optional) and still accept legacy payloads without them.
 *  2. Service round-trip: create → get through the REAL carePlanService against
 *     an in-memory Prisma fake — the six fields round-trip verbatim, and an
 *     action created without them serializes them as null (keys present).
 *  3. Calendar: day rows expose tier + dosage of the LINKED CareAction via the
 *     relation join; ad-hoc rows (no linked action) serialize them null.
 */
import { describe, it, before, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  createCareActionSchema,
  updateCareActionSchema
} from '../../schemas/dogSchemas.js'

const SIX_FIELDS = [
  'tier',
  'daysPerWeek',
  'targetHoldSeconds',
  'targetSets',
  'restBetweenSetsSeconds',
  'referenceUrl'
] as const

const VICKY_DOSAGE = {
  tier: 'CORE' as const,
  daysPerWeek: 3,
  targetHoldSeconds: 30,
  targetSets: 3,
  restBetweenSetsSeconds: 60,
  referenceUrl: 'https://equicantis.com/exercises/cookie-stretch'
}

// ── Request-contract gate (no mocks) ──────────────────────────────────────────

describe('care-action create/update schemas accept tier + dosage (0020)', () => {
  it('create accepts all six new fields verbatim', () => {
    const parsed = createCareActionSchema.parse({
      name: 'Cookie Stretch — Left',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      ...VICKY_DOSAGE
    })
    for (const field of SIX_FIELDS) {
      assert.equal(parsed[field], VICKY_DOSAGE[field], `create must carry ${field}`)
    }
  })

  it('create still accepts a legacy payload without the new fields', () => {
    const parsed = createCareActionSchema.parse({
      name: 'Slow leash walk',
      bucket: 'ACTIVITY',
      frequency: 'DAILY'
    })
    assert.equal(parsed.name, 'Slow leash walk')
    for (const field of SIX_FIELDS) {
      assert.equal(parsed[field], undefined, `${field} must be optional on create`)
    }
  })

  it('update accepts each of the six fields and explicit nulls', () => {
    const parsed = updateCareActionSchema.parse({ ...VICKY_DOSAGE })
    for (const field of SIX_FIELDS) {
      assert.equal(parsed[field], VICKY_DOSAGE[field], `update must carry ${field}`)
    }

    const cleared = updateCareActionSchema.parse({
      tier: null,
      daysPerWeek: null,
      targetHoldSeconds: null,
      targetSets: null,
      restBetweenSetsSeconds: null,
      referenceUrl: null
    })
    for (const field of SIX_FIELDS) {
      assert.equal(cleared[field], null, `update must accept null to clear ${field}`)
    }
  })

  it('rejects an unknown tier and an out-of-range daysPerWeek', () => {
    assert.throws(() =>
      updateCareActionSchema.parse({ tier: 'WARMUP' })
    )
    assert.throws(() =>
      updateCareActionSchema.parse({ daysPerWeek: 8 })
    )
  })
})

// ── In-memory Prisma fake for the service round-trip ──────────────────────────

type Row = Record<string, unknown>
const carePlans: Row[] = []
const careActions: Row[] = []
const dailyCareLogs: Array<Row & { rows: Row[] }> = []
let seq = 0

function tierDosageOf(row: Row | undefined) {
  if (!row) return null
  return {
    tier: row.tier ?? null,
    daysPerWeek: row.daysPerWeek ?? null,
    targetHoldSeconds: row.targetHoldSeconds ?? null,
    targetSets: row.targetSets ?? null,
    restBetweenSetsSeconds: row.restBetweenSetsSeconds ?? null,
    referenceUrl: row.referenceUrl ?? null
  }
}

type PlanFindArgs = {
  where: { dogId?: string; isActive?: boolean }
  include?: {
    actions?: {
      where?: { isActive?: boolean }
      orderBy?: { sortOrder?: 'asc' | 'desc' }
      take?: number
    }
  }
}

const fakePrisma = {
  carePlan: {
    async findFirst({ where, include }: PlanFindArgs) {
      const plan = carePlans.find(
        p =>
          (where.dogId === undefined || p.dogId === where.dogId) &&
          (where.isActive === undefined || p.isActive === where.isActive)
      )
      if (!plan) return null
      const result: Row = { ...plan }
      if (include?.actions) {
        let acts = careActions.filter(a => a.carePlanId === plan.id)
        const activeFilter = include.actions.where?.isActive
        if (activeFilter !== undefined) acts = acts.filter(a => a.isActive === activeFilter)
        const dir = include.actions.orderBy?.sortOrder === 'desc' ? -1 : 1
        acts = [...acts].sort(
          (x, y) => dir * ((x.sortOrder as number) - (y.sortOrder as number))
        )
        if (include.actions.take !== undefined) acts = acts.slice(0, include.actions.take)
        result.actions = acts.map(a => ({ ...a }))
      }
      return result
    }
  },
  careAction: {
    async create({ data }: { data: Row }) {
      const now = new Date()
      const row: Row = {
        id: `ca-${++seq}`,
        description: null,
        timeOfDay: null,
        targetReps: null,
        targetDurationSeconds: null,
        tier: null,
        daysPerWeek: null,
        targetHoldSeconds: null,
        targetSets: null,
        restBetweenSetsSeconds: null,
        referenceUrl: null,
        instructions: null,
        sortOrder: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...data
      }
      careActions.push(row)
      return { ...row }
    },
    async findFirst({ where }: { where: Row }) {
      for (const row of careActions) {
        if (where.id !== undefined && row.id !== where.id) continue
        if (where.isActive !== undefined && row.isActive !== where.isActive) continue
        const planWhere = where.carePlan as { dogId?: string; isActive?: boolean } | undefined
        if (planWhere) {
          const plan = carePlans.find(p => p.id === row.carePlanId)
          if (!plan) continue
          if (planWhere.dogId !== undefined && plan.dogId !== planWhere.dogId) continue
          if (planWhere.isActive !== undefined && plan.isActive !== planWhere.isActive) continue
        }
        return { ...row }
      }
      return null
    },
    async update({ where, data }: { where: { id: string }; data: Row }) {
      const row = careActions.find(r => r.id === where.id)
      if (!row) throw new Error(`careAction ${where.id} not found`)
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined) row[key] = data[key]
      }
      row.updatedAt = new Date()
      return { ...row }
    }
  },
  dailyCareLog: {
    // Mirrors the calendar query's select: tier + dosage come from the linked
    // CareAction row, null when careActionId is null (ad-hoc).
    async findMany({ where }: { where: { dogId: string } }) {
      return dailyCareLogs
        .filter(l => l.dogId === where.dogId)
        .map(l => ({
          ...l,
          dailyCareActions: l.rows.map(r => ({
            careActionId: r.careActionId ?? null,
            status: r.status,
            careAction: tierDosageOf(careActions.find(a => a.id === r.careActionId))
          }))
        }))
    }
  }
}

// ── Production code, imported after the prisma mock is in place ───────────────

let service: typeof import('./carePlanService.js')

before(async () => {
  await mock.module(new URL('../../lib/prisma.ts', import.meta.url).href, {
    namedExports: { prisma: fakePrisma }
  })
  service = await import('./carePlanService.js')
})

beforeEach(() => {
  carePlans.length = 0
  careActions.length = 0
  dailyCareLogs.length = 0
  carePlans.push({
    id: 'plan-1',
    dogId: 'dog-1',
    name: 'Plan 2 — June 26, 2026',
    isActive: true,
    createdAt: new Date('2026-06-26T00:00:00.000Z'),
    updatedAt: new Date('2026-06-26T00:00:00.000Z')
  })
})

describe('carePlanService round-trips tier + dosage (0020)', () => {
  it('create → get carries all six fields verbatim on the care-plan payload', async () => {
    const created = await service.createCareAction('dog-1', {
      name: 'Cookie Stretch — Left',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      ...VICKY_DOSAGE
    })
    for (const field of SIX_FIELDS) {
      assert.equal(created[field], VICKY_DOSAGE[field], `created action must carry ${field}`)
    }

    const plan = await service.getActiveCarePlan('dog-1')
    assert.ok(plan)
    const action = plan.actions.find(a => a.id === created.id)
    assert.ok(action, 'created action must appear in the plan payload')
    for (const field of SIX_FIELDS) {
      assert.equal(action[field], VICKY_DOSAGE[field], `plan payload must carry ${field}`)
    }
  })

  it('an action created without the new fields serializes them as null (keys present)', async () => {
    const created = await service.createCareAction('dog-1', {
      name: 'Slow leash walk',
      bucket: 'ACTIVITY',
      frequency: 'DAILY'
    })
    for (const field of SIX_FIELDS) {
      assert.ok(field in created, `${field} key must be present`)
      assert.equal(created[field], null, `${field} must serialize null when unset`)
    }
  })

  it('update round-trips changed tier/dosage and leaves the rest untouched', async () => {
    const created = await service.createCareAction('dog-1', {
      name: 'Cookie Stretch — Right',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      ...VICKY_DOSAGE
    })

    const updated = await service.updateCareAction('dog-1', created.id, {
      tier: 'ROUTINE',
      daysPerWeek: 7,
      referenceUrl: null
    })
    assert.equal(updated.tier, 'ROUTINE')
    assert.equal(updated.daysPerWeek, 7)
    assert.equal(updated.referenceUrl, null)
    // untouched dosage fields survive the partial update
    assert.equal(updated.targetHoldSeconds, VICKY_DOSAGE.targetHoldSeconds)
    assert.equal(updated.targetSets, VICKY_DOSAGE.targetSets)
    assert.equal(updated.restBetweenSetsSeconds, VICKY_DOSAGE.restBetweenSetsSeconds)
    assert.equal(updated.name, 'Cookie Stretch — Right')
  })
})

describe('calendar day rows expose tier via the CareAction join (0020)', () => {
  it('plan-sourced rows carry tier + dosage; ad-hoc rows carry nulls; no-log days have empty rows', async () => {
    const core = await service.createCareAction('dog-1', {
      name: 'Cookie Stretch — Left',
      bucket: 'MOBILITY',
      frequency: 'DAILY',
      ...VICKY_DOSAGE
    })
    dailyCareLogs.push({
      id: 'log-1',
      dogId: 'dog-1',
      date: new Date(Date.UTC(2026, 6, 15)),
      rows: [
        { careActionId: core.id, status: 'COMPLETED' },
        { careActionId: null, status: 'PENDING' } // ad-hoc
      ]
    })

    const summary = await service.getCalendarSummary('dog-1', '2026-07')
    const day = summary.days.find(d => d.date === '2026-07-15')
    assert.ok(day)
    assert.equal(day.hasLog, true)
    assert.equal(day.actions.length, 2)

    const planRow = day.actions.find(a => a.careActionId === core.id)
    assert.ok(planRow, 'plan-sourced row must be present')
    assert.equal(planRow.status, 'COMPLETED')
    for (const field of SIX_FIELDS) {
      assert.equal(planRow[field], VICKY_DOSAGE[field], `calendar row must carry ${field}`)
    }

    const adHocRow = day.actions.find(a => a.careActionId === null)
    assert.ok(adHocRow, 'ad-hoc row must be present')
    for (const field of SIX_FIELDS) {
      assert.equal(adHocRow[field], null, `ad-hoc calendar row must serialize ${field} null`)
    }

    const emptyDay = summary.days.find(d => d.date === '2026-07-16')
    assert.ok(emptyDay)
    assert.deepEqual(emptyDay.actions, [], 'no-log days expose an empty rows array')

    // pre-existing counters unchanged
    assert.equal(day.completedCount, 1)
    assert.equal(day.totalActions, 2)
  })
})
