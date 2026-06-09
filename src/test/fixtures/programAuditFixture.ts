import { randomUUID } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/client.js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionSnapshot = { id: string; name: string; isActive: boolean }

export type ProgramAuditFixture = {
  dogId: string
  planId: string
  ownerId: string
  strangerId: string
  actionIds: [string, string]
  actionSnapshot: [ActionSnapshot, ActionSnapshot]
}

type TestPrisma = InstanceType<typeof PrismaClient>

// ── Prisma factory ────────────────────────────────────────────────────────────

/**
 * Creates a PrismaClient connected directly to DATABASE_URL_TEST.
 * This is separate from the production singleton so seeding/teardown
 * is independent of the DATABASE_URL swap in testEnv.ts.
 */
export function createTestPrisma(): TestPrisma {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const adapter = new PrismaPg({ connectionString: url })
  return new PrismaClient({ adapter })
}

// ── Seed ──────────────────────────────────────────────────────────────────────

/**
 * Creates an isolated set of test data:
 *   - owner user (DogMember for the test dog)
 *   - stranger user (no DogMember)
 *   - test dog with active care plan + 2 care actions
 *
 * All IDs are prefixed with `test-` and use random UUIDs so parallel runs
 * on the same Neon branch cannot collide.
 */
export async function seedProgramAuditFixture(prisma: TestPrisma): Promise<ProgramAuditFixture> {
  const runId = randomUUID()

  const ownerId = `test-owner-${runId}`
  const strangerId = `test-stranger-${runId}`

  await prisma.user.create({
    data: { id: ownerId, email: `test-owner-${runId}@test.invalid` }
  })
  await prisma.user.create({
    data: { id: strangerId, email: `test-stranger-${runId}@test.invalid` }
  })

  const dog = await prisma.dog.create({
    data: {
      name: `Test Audit Dog ${runId.slice(0, 8)}`,
      notes: 'integration-test',
      shareCode: `test-${runId.slice(0, 8)}`
    }
  })

  await prisma.dogMember.create({
    data: { dogId: dog.id, userId: ownerId, role: 'caregiver' }
  })

  const plan = await prisma.carePlan.create({
    data: { dogId: dog.id, name: 'Test PT Plan', isActive: true }
  })

  const action0 = await prisma.careAction.create({
    data: {
      carePlanId: plan.id,
      name: 'Test Stretch',
      category: 'STRETCH',
      frequency: 'DAILY',
      sortOrder: 1,
      isActive: true,
      steps: { create: [{ name: 'Stretch step', sortOrder: 1 }] }
    }
  })

  const action1 = await prisma.careAction.create({
    data: {
      carePlanId: plan.id,
      name: 'Test Strength',
      category: 'STRENGTH',
      frequency: 'DAILY',
      sortOrder: 2,
      isActive: true,
      steps: { create: [{ name: 'Strength step', sortOrder: 1 }] }
    }
  })

  return {
    dogId: dog.id,
    planId: plan.id,
    ownerId,
    strangerId,
    actionIds: [action0.id, action1.id],
    actionSnapshot: [
      { id: action0.id, name: action0.name, isActive: true },
      { id: action1.id, name: action1.name, isActive: true }
    ]
  }
}

// ── Restore ───────────────────────────────────────────────────────────────────

/**
 * Restores the two seeded care actions to their original state and deletes
 * any extra CareAction rows added by CREATE confirm operations.
 *
 * Called in afterEach (wrapped in try/finally) so confirm tests don't
 * pollute subsequent tests even on assertion failure.
 *
 * CareActionStep has onDelete: Cascade, so deleteMany on CareAction
 * automatically removes orphaned steps.
 */
export async function restoreCareActions(
  prisma: TestPrisma,
  fixture: ProgramAuditFixture
): Promise<void> {
  for (const snap of fixture.actionSnapshot) {
    await prisma.careAction.update({
      where: { id: snap.id },
      data: { name: snap.name, isActive: snap.isActive }
    })
  }

  // Delete any care actions created by CREATE-type confirm operations
  await prisma.careAction.deleteMany({
    where: {
      carePlanId: fixture.planId,
      id: { notIn: fixture.actionIds }
    }
  })
}

// ── Teardown ──────────────────────────────────────────────────────────────────

/**
 * Deletes all test data for this fixture run.
 *
 * Dog deletion cascades: DogMember, CarePlan, CareAction, CareActionStep,
 * and ProgramAuditSession. Users must be deleted separately.
 */
export async function teardownFixture(
  prisma: TestPrisma,
  fixture: ProgramAuditFixture
): Promise<void> {
  // Dog cascade handles DogMember, CarePlan, CareAction, CareActionStep, ProgramAuditSession
  await prisma.dog.deleteMany({ where: { id: fixture.dogId } })
  await prisma.user.deleteMany({ where: { id: { in: [fixture.ownerId, fixture.strangerId] } } })
}
