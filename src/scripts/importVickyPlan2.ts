import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/client.js'
import { importVickyPlan2, resolveDogId } from '../services/carePlans/importVickyPlan2.js'

/**
 * Production-safe CLI entry (npm run plan:import) that creates Stark's "Plan 2 —
 * June 26, 2026" CarePlan. Idempotent: re-running changes nothing.
 *
 *   npm run plan:import -- --dog-id <uuid>
 *   npm run plan:import -- --share-code <code>
 *   DOG_ID=<uuid> npm run plan:import
 */

function parseArgs(argv: string[]): { dogId?: string; shareCode?: string } {
  const out: { dogId?: string; shareCode?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dog-id') out.dogId = argv[++i]
    else if (arg.startsWith('--dog-id=')) out.dogId = arg.slice('--dog-id='.length)
    else if (arg === '--share-code') out.shareCode = argv[++i]
    else if (arg.startsWith('--share-code=')) out.shareCode = arg.slice('--share-code='.length)
  }
  return out
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const dogId = args.dogId ?? process.env.DOG_ID ?? null
  const shareCode = args.shareCode ?? process.env.SHARE_CODE ?? null

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })
  try {
    const resolvedDogId = await resolveDogId(prisma, { dogId, shareCode })
    const result = await importVickyPlan2(prisma, resolvedDogId)

    if (result.created) {
      console.log(
        `Created "${result.planName}" (${result.planId}) with ${result.actionCount} ` +
          `actions for dog ${resolvedDogId}.`
      )
      if (result.deactivatedPlanIds.length > 0) {
        console.log(
          `Deactivated ${result.deactivatedPlanIds.length} prior plan(s): ` +
            result.deactivatedPlanIds.join(', ')
        )
      } else {
        console.log('No prior active plan to deactivate.')
      }
    } else {
      console.log(
        `"${result.planName}" already present for dog ${resolvedDogId} ` +
          `(${result.actionCount} actions). No changes.`
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
