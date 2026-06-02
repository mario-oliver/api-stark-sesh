import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/client.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const CARE_ACTIONS = [
  {
    name: 'Morning stretch routine',
    description: 'Morning hip and mobility stretches',
    category: 'STRETCH' as const,
    frequency: 'DAILY' as const,
    timeOfDay: 'MORNING' as const,
    sortOrder: 1,
    instructions: 'Gentle hip stretches in the morning.'
  },
  {
    name: 'Evening stretch routine',
    description: 'Evening hip and mobility stretches',
    category: 'STRETCH' as const,
    frequency: 'DAILY' as const,
    timeOfDay: 'EVENING' as const,
    sortOrder: 2,
    instructions: 'Gentle hip stretches in the evening.'
  },
  {
    name: 'Assisted strength workout',
    description: 'Assisted sit-to-stand and strength exercises',
    category: 'STRENGTH' as const,
    frequency: 'EVERY_OTHER_DAY' as const,
    timeOfDay: 'EVENING' as const,
    sortOrder: 3,
    instructions: 'Assisted sit-to-stand reps as tolerated.'
  },
  {
    name: 'Short controlled walk',
    description: 'Short controlled walk for mobility',
    category: 'MOBILITY' as const,
    frequency: 'DAILY' as const,
    timeOfDay: 'ANYTIME' as const,
    sortOrder: 4,
    instructions: 'Short controlled walk on even surfaces.'
  },
  {
    name: 'Mobility/pain check',
    description: 'Daily mobility and pain tolerance checkpoint',
    category: 'OBSERVATION_CHECKPOINT' as const,
    frequency: 'DAILY' as const,
    timeOfDay: 'ANYTIME' as const,
    sortOrder: 5,
    instructions: 'Note stiffness, pain, and mobility during the day.'
  }
]

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
          create: CARE_ACTIONS
        }
      }
    })
    console.log('Created care plan:', plan.name)
  } else {
    const existingCount = await prisma.careAction.count({ where: { carePlanId: plan.id } })
    if (existingCount === 0) {
      await prisma.careAction.createMany({
        data: CARE_ACTIONS.map(a => ({ ...a, carePlanId: plan!.id }))
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
