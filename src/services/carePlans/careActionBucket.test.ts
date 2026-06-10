import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createCareActionSchema } from '../../schemas/dogSchemas.js'
import { setupTestEnv } from '../../test/helpers/testEnv.js'
import { createTestPrisma } from '../../test/fixtures/programAuditFixture.js'

// ── Request-contract gate (DB-free; always runs) ──────────────────────────────
//
// Acceptance criterion 0001: "Creating a CareAction without a bucket is rejected."
// Enforced at the request boundary by createCareActionSchema (bucket is required,
// and there is no longer a `category` field).

describe('createCareActionSchema — bucket required, no category', () => {
  const base = { name: 'Evening walk', frequency: 'DAILY' as const }

  it('rejects a payload without a bucket', () => {
    assert.equal(createCareActionSchema.safeParse(base).success, false)
  })

  it('rejects an invalid bucket (old category value)', () => {
    assert.equal(
      createCareActionSchema.safeParse({ ...base, bucket: 'STRETCH' }).success,
      false
    )
  })

  it('accepts a valid bucket and strips any legacy category', () => {
    const parsed = createCareActionSchema.parse({
      ...base,
      bucket: 'ACTIVITY',
      category: 'STRETCH'
    })
    assert.equal(parsed.bucket, 'ACTIVITY')
    assert.equal('category' in parsed, false)
  })
})

// ── Service round-trip (DB-gated; skipped without DATABASE_URL_TEST) ───────────
//
// Acceptance criterion 0001: "with a valid bucket it persists and round-trips
// through the service." Mirrors the integration-test pattern: swap to the test
// branch, then dynamic-import production code so the Prisma singleton binds there.

describe('createCareAction — persists with bucket and round-trips', {
  skip: !process.env.DATABASE_URL_TEST
}, () => {
  let prisma: ReturnType<typeof createTestPrisma>
  let createCareAction: typeof import('./carePlanService.js')['createCareAction']
  let dogId: string
  let userId: string

  before(async () => {
    setupTestEnv()
    prisma = createTestPrisma()

    const runId = randomUUID()
    userId = `test-bucket-${runId}`
    await prisma.user.create({ data: { id: userId, email: `${userId}@test.invalid` } })
    const dog = await prisma.dog.create({
      data: { name: `Bucket Dog ${runId.slice(0, 8)}`, shareCode: `tb-${runId.slice(0, 8)}` }
    })
    dogId = dog.id
    await prisma.dogMember.create({ data: { dogId, userId, role: 'caregiver' } })
    await prisma.carePlan.create({ data: { dogId, name: 'Bucket Plan', isActive: true } })

    ;({ createCareAction } = await import('./carePlanService.js'))
  })

  after(async () => {
    await prisma.dog.deleteMany({ where: { id: dogId } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('persists a CareAction with its bucket and reads it back', async () => {
    const created = await createCareAction(dogId, {
      name: 'Evening walk',
      bucket: 'ACTIVITY',
      frequency: 'DAILY'
    })
    assert.equal(created.bucket, 'ACTIVITY')

    const fromDb = await prisma.careAction.findUnique({ where: { id: created.id } })
    assert.equal(fromDb?.bucket, 'ACTIVITY')
  })
})
