/**
 * Today rows expose tier + dosage of the LINKED CareAction — machine proof for
 * issue 0020.
 *
 * DailyCareAction is unchanged (no snapshot columns): the fields are read via
 * the relation join. Two gates, both DB-free:
 *  1. Serializer: a plan-sourced row surfaces the six fields from its careAction
 *     join verbatim; an ad-hoc row (careAction null) serializes them all null
 *     with the keys present.
 *  2. Wiring: loadTodayPayload's Prisma include actually selects the six fields
 *     on the careAction join, and its rows carry them end-to-end (in-memory
 *     Prisma fake, no database).
 */
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeDailyCareAction,
  type DailyCareActionWithRelations
} from './serializeDailyCare.js'

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

function baseRow(overrides: Partial<DailyCareActionWithRelations>): DailyCareActionWithRelations {
  return {
    id: 'dca-1',
    dailyCareLogId: 'log-1',
    careActionId: null,
    bucket: 'MOBILITY',
    source: 'AD_HOC',
    nameSnapshot: 'Cookie Stretch — Left',
    descriptionSnapshot: null,
    instructionsSnapshot: null,
    status: 'PENDING',
    completedAt: null,
    completedByUserId: null,
    notes: null,
    tolerance: null,
    targetReps: null,
    actualReps: null,
    targetDurationSeconds: null,
    actualDurationSeconds: null,
    substitutedForTaskId: null,
    metadata: null,
    extractionConfidence: null,
    needsReview: false,
    sortOrder: 0,
    createdAt: new Date('2026-07-15T08:00:00.000Z'),
    updatedAt: new Date('2026-07-15T08:00:00.000Z'),
    completedBy: null,
    ...overrides
  }
}

// ── Serializer gate ───────────────────────────────────────────────────────────

describe('serializeDailyCareAction — tier + dosage from the careAction join (0020)', () => {
  it('plan-sourced row surfaces the six fields of the linked CareAction verbatim', async () => {
    const row = baseRow({
      careActionId: 'ca-1',
      source: 'PLAN',
      careAction: { targetReps: 5, targetDurationSeconds: null, ...JOINED_DOSAGE }
    })
    const serialized = await serializeDailyCareAction(row)
    for (const field of SIX_FIELDS) {
      assert.equal(
        serialized[field],
        JOINED_DOSAGE[field],
        `today row must carry ${field} from the linked CareAction`
      )
    }
    // snapshot-vs-template resolution for reps/duration is unchanged
    assert.equal(serialized.targetReps, 5)
  })

  it('ad-hoc row (no linked CareAction) serializes all six fields null, keys present', async () => {
    const serialized = await serializeDailyCareAction(baseRow({ careAction: null }))
    for (const field of SIX_FIELDS) {
      assert.ok(field in serialized, `${field} key must be present on ad-hoc rows`)
      assert.equal(serialized[field], null, `${field} must be null on ad-hoc rows`)
    }
  })
})

// ── Wiring gate: loadTodayPayload include + row shape ─────────────────────────

type Row = Record<string, unknown>
let capturedInclude: Row | null = null

const planDbRow = {
  ...baseRow({
    id: 'dca-plan',
    careActionId: 'ca-1',
    source: 'PLAN',
    status: 'COMPLETED',
    careAction: { targetReps: null, targetDurationSeconds: null, ...JOINED_DOSAGE }
  })
}

const adHocDbRow = { ...baseRow({ id: 'dca-adhoc', careAction: null }) }

const fakePrisma = {
  dailyCareLog: {
    async findUniqueOrThrow({ include }: { include: Row }) {
      capturedInclude = include
      return {
        id: 'log-1',
        dogId: 'dog-1',
        date: new Date(Date.UTC(2026, 6, 15)),
        summary: null,
        bucketScores: null,
        scoreComputedAt: null,
        scoreInputVersion: null,
        dailyCareActions: [planDbRow, adHocDbRow],
        voiceNotes: [],
        healthObservations: []
      }
    }
  },
  dog: {
    async findUniqueOrThrow() {
      return {
        id: 'dog-1',
        name: 'Rex',
        photoKey: null,
        shareCode: 'abc123',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-01T00:00:00.000Z')
      }
    }
  }
}

let loadTodayPayload: typeof import('./resolveTodayLog.js')['loadTodayPayload']

before(async () => {
  await mock.module(new URL('../../lib/prisma.ts', import.meta.url).href, {
    namedExports: { prisma: fakePrisma }
  })
  ;({ loadTodayPayload } = await import('./resolveTodayLog.js'))
})

describe('loadTodayPayload — join select + row exposure (0020)', () => {
  it('selects the six fields on the careAction join and exposes them on today rows', async () => {
    const payload = await loadTodayPayload('dog-1', 'log-1')

    // The Prisma query itself must join the new columns.
    const careActionSelect = (
      (capturedInclude?.dailyCareActions as Row | undefined)?.include as Row | undefined
    )?.careAction as { select: Record<string, boolean> } | undefined
    assert.ok(careActionSelect, 'today query must join careAction')
    for (const field of SIX_FIELDS) {
      assert.equal(careActionSelect.select[field], true, `today query must select ${field}`)
    }

    const planRow = payload.dailyLog.dailyCareActions.find(a => a.id === 'dca-plan')
    assert.ok(planRow)
    for (const field of SIX_FIELDS) {
      assert.equal(planRow[field], JOINED_DOSAGE[field], `today row must expose ${field}`)
    }

    const adHocRow = payload.dailyLog.dailyCareActions.find(a => a.id === 'dca-adhoc')
    assert.ok(adHocRow)
    for (const field of SIX_FIELDS) {
      assert.equal(adHocRow[field], null, `ad-hoc today row must expose ${field} as null`)
    }

    // Bucket grouping and progress are untouched by the new fields.
    assert.equal(payload.buckets.mobility.actions.length, 2)
    assert.deepEqual(payload.progress, { completed: 1, total: 2 })
  })
})
