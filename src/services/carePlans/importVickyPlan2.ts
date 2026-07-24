import type { PrismaClient } from '../../generated/client.js'
import { VICKY_PLAN_2_ACTIONS, VICKY_PLAN_2_NAME } from './vickyPlan2.js'

/**
 * Idempotent import of Vicky's Plan 2 as a versioned CarePlan (issue 0021,
 * context.md#CarePlan). A new plan is never mutated in place: prior active plans
 * flip `isActive: false` and the new plan is created active. Re-running is a
 * no-op — an exact-name match for the dog verifies the row count and returns
 * without changing anything.
 *
 * DI over the Prisma client (not the singleton) so the CLI passes a real client
 * and tests pass an in-memory fake.
 */

export type ImportVickyPlan2Result = {
  created: boolean
  planId: string
  planName: string
  actionCount: number
  deactivatedPlanIds: string[]
}

export async function resolveDogId(
  prisma: PrismaClient,
  opts: { dogId?: string | null; shareCode?: string | null }
): Promise<string> {
  if (opts.dogId) {
    const dog = await prisma.dog.findUnique({
      where: { id: opts.dogId },
      select: { id: true }
    })
    if (!dog) throw new Error(`No dog found with id ${opts.dogId}`)
    return dog.id
  }
  if (opts.shareCode) {
    const dog = await prisma.dog.findUnique({
      where: { shareCode: opts.shareCode },
      select: { id: true }
    })
    if (!dog) throw new Error(`No dog found with share code ${opts.shareCode}`)
    return dog.id
  }
  throw new Error('Provide --dog-id <id>, --share-code <code>, or DOG_ID / SHARE_CODE env.')
}

export async function importVickyPlan2(
  prisma: PrismaClient,
  dogId: string
): Promise<ImportVickyPlan2Result> {
  // Exact-match idempotency: a plan with this name for this dog means Plan 2 is
  // already imported. Verify the row count and change nothing.
  const existing = await prisma.carePlan.findFirst({
    where: { dogId, name: VICKY_PLAN_2_NAME },
    include: { actions: { select: { id: true } } }
  })
  if (existing) {
    const actionCount = existing.actions.length
    if (actionCount !== VICKY_PLAN_2_ACTIONS.length) {
      throw new Error(
        `Plan "${VICKY_PLAN_2_NAME}" already exists for dog ${dogId} with ` +
          `${actionCount} actions (expected ${VICKY_PLAN_2_ACTIONS.length}). Refusing to modify.`
      )
    }
    return {
      created: false,
      planId: existing.id,
      planName: VICKY_PLAN_2_NAME,
      actionCount,
      deactivatedPlanIds: []
    }
  }

  return prisma.$transaction(async tx => {
    const priorActive = await tx.carePlan.findMany({
      where: { dogId, isActive: true },
      select: { id: true }
    })
    await tx.carePlan.updateMany({
      where: { dogId, isActive: true },
      data: { isActive: false }
    })
    const plan = await tx.carePlan.create({
      data: {
        dogId,
        name: VICKY_PLAN_2_NAME,
        isActive: true,
        actions: {
          create: VICKY_PLAN_2_ACTIONS.map(a => ({
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
            sortOrder: a.sortOrder
          }))
        }
      },
      include: { actions: true }
    })
    return {
      created: true,
      planId: plan.id,
      planName: plan.name,
      actionCount: plan.actions.length,
      deactivatedPlanIds: priorActive.map(p => p.id)
    }
  })
}
