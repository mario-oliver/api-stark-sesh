import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  createAdHocActionSchema,
  updateActualsSchema,
  updateDailyActionSchema
} from '../../schemas/dogSchemas.js'
import { setupTestEnv } from '../../test/helpers/testEnv.js'
import { createTestPrisma } from '../../test/fixtures/programAuditFixture.js'

// ── Request-contract gate (DB-free; always runs) ──────────────────────────────
//
// Acceptance criterion 0002: a single daily-execution record carries the unified
// field set absorbed from the former separate task table — source +
// actual-vs-target + needsReview — and the dropped redundant flag is gone.

describe('unified daily-execution request contracts', () => {
  it('accepts an ad-hoc daily care action with a bucket', () => {
    const parsed = createAdHocActionSchema.parse({
      bucket: 'ACTIVITY',
      name: 'Evening walk',
      date: '2026-06-10'
    })
    assert.equal(parsed.bucket, 'ACTIVITY')
    assert.equal(parsed.name, 'Evening walk')
  })

  it('accepts actual-vs-target reps/duration + needsReview on an entry', () => {
    const parsed = updateActualsSchema.parse({
      status: 'COMPLETED',
      actualReps: 8,
      actualDurationSeconds: 120,
      needsReview: false
    })
    assert.equal(parsed.actualReps, 8)
    assert.equal(parsed.actualDurationSeconds, 120)
    assert.equal(parsed.needsReview, false)
  })

  it('carries only status/notes/tolerance (redundant flag dropped)', () => {
    const parsed = updateDailyActionSchema.parse({
      status: 'COMPLETED',
      notes: 'ok',
      tolerance: 'GOOD'
    })
    assert.deepEqual(Object.keys(parsed).sort(), ['notes', 'status', 'tolerance'])
  })
})

// ── Service round-trip (DB-gated; skipped without DATABASE_URL_TEST) ───────────
//
// Acceptance criterion 0002: "A DailyCareAction can be created with source,
// actualReps, actualDurationSeconds, bucket and round-trips through the daily-log
// service." Mirrors the integration-test pattern: swap to the test branch, then
// dynamic-import production code so the Prisma singleton binds there.

describe('DailyCareAction absorbs the former task table — source + actuals round-trip', {
  skip: !process.env.DATABASE_URL_TEST
}, () => {
  let prisma: ReturnType<typeof createTestPrisma>
  let createAdHocDailyCareAction:
    typeof import('./dailyCareActionEntries.js')['createAdHocDailyCareAction']
  let updateDailyCareActionEntry:
    typeof import('./dailyCareActionEntries.js')['updateDailyCareActionEntry']
  let loadTodayPayload: typeof import('./resolveTodayLog.js')['loadTodayPayload']
  let dogId: string
  let userId: string
  let logId: string

  before(async () => {
    setupTestEnv()
    prisma = createTestPrisma()

    const runId = randomUUID()
    userId = `test-merge-${runId}`
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.invalid` } })
    const dog = await prisma.dog.create({
      data: { name: `Merge Dog ${runId.slice(0, 8)}`, shareCode: `tm-${runId.slice(0, 8)}` }
    })
    dogId = dog.id
    await prisma.dogMember.create({ data: { dogId, userId, role: 'caregiver' } })
    const log = await prisma.dailyCareLog.create({
      data: { dogId, date: new Date('2026-06-10T00:00:00.000Z') }
    })
    logId = log.id

    ;({ createAdHocDailyCareAction, updateDailyCareActionEntry } = await import(
      './dailyCareActionEntries.js'
    ))
    ;({ loadTodayPayload } = await import('./resolveTodayLog.js'))
  })

  after(async () => {
    await prisma.dog.deleteMany({ where: { id: dogId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('creates with source+bucket, logs actuals, and round-trips via the daily-log service', async () => {
    const created = await createAdHocDailyCareAction(dogId, {
      dailyCareLogId: logId,
      bucket: 'ACTIVITY',
      name: 'Extra walk'
    })
    assert.ok(created)
    assert.equal(created.bucket, 'ACTIVITY')
    assert.equal(created.source, 'AD_HOC')

    const updated = await updateDailyCareActionEntry(created.id, dogId, userId, {
      status: 'COMPLETED',
      actualReps: 8,
      actualDurationSeconds: 300
    })
    assert.ok(updated)
    assert.equal(updated.action.actualReps, 8)
    assert.equal(updated.action.actualDurationSeconds, 300)

    // One unified table: the row appears in its bucket and in the actions list.
    const payload = await loadTodayPayload(dogId, logId)
    const inActivity = payload.buckets.activity.actions.find(t => t.id === created.id)
    assert.ok(inActivity, 'ad-hoc action should surface in the activity bucket')
    assert.equal(inActivity!.source, 'AD_HOC')
    assert.equal(inActivity!.actualReps, 8)
    assert.ok(
      payload.dailyLog.dailyCareActions.some(a => a.id === created.id),
      'ad-hoc action should appear in the unified dailyCareActions list'
    )
  })
})
