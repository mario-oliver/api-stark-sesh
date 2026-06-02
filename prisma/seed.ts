import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/client.js'
import { DEFAULT_MOBILITY_STRENGTH_ACTIONS } from '../src/services/carePlans/defaultMobilityStrengthPlan.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const caregiverEmails = (process.env.SEED_CAREGIVER_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)

  let stark = await prisma.dog.findFirst({ where: { name: 'Stark' } })

  if (!stark) {
    stark = await prisma.dog.create({
      data: {
        name: 'Stark',
        breed: null,
        age: null,
        notes: 'Primary care dog for Stark Health MVP.'
      }
    })
    console.log('Created dog:', stark.name, stark.id)
  } else {
    console.log('Dog already exists:', stark.name, stark.id)
  }

  let plan = await prisma.carePlan.findFirst({
    where: { dogId: stark.id, name: 'Stark PT Plan' }
  })

  if (!plan) {
    plan = await prisma.carePlan.create({
      data: {
        dogId: stark.id,
        name: 'Stark PT Plan',
        isActive: true,
        actions: {
          create: DEFAULT_MOBILITY_STRENGTH_ACTIONS
        }
      }
    })
    console.log('Created care plan:', plan.name)
  } else {
    const existingCount = await prisma.careAction.count({ where: { carePlanId: plan.id } })
    if (existingCount === 0) {
      await prisma.careAction.createMany({
        data: DEFAULT_MOBILITY_STRENGTH_ACTIONS.map(a => ({ ...a, carePlanId: plan!.id }))
      })
      console.log('Added care actions to existing plan')
    }
  }

  for (const email of caregiverEmails) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.log(`Skipping DogMember — user not found yet: ${email}`)
      continue
    }
    await prisma.dogMember.upsert({
      where: { dogId_userId: { dogId: stark.id, userId: user.id } },
      create: { dogId: stark.id, userId: user.id, role: 'caregiver' },
      update: {}
    })
    console.log('Attached caregiver:', email)
  }

  console.log('\nSeed complete.')
  console.log('Stark dog id:', stark.id)
  console.log('Set SEED_CAREGIVER_EMAILS=comma-separated emails to attach users after they sign up.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
