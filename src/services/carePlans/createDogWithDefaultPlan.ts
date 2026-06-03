import { prisma } from '../../lib/prisma.js'
import { generateShareCode } from '../../lib/shareCode.js'
import {
  DEFAULT_MOBILITY_STRENGTH_ACTIONS,
  DEFAULT_MOBILITY_STRENGTH_PLAN_NAME
} from './defaultMobilityStrengthPlan.js'

export type CreateDogInput = {
  name: string
  breed?: string | null
  age?: number | null
  photoKey?: string | null
  notes?: string | null
}

async function uniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const shareCode = generateShareCode()
    const existing = await prisma.dog.findUnique({ where: { shareCode } })
    if (!existing) return shareCode
  }
  throw new Error('Failed to generate unique share code')
}

export async function createDogWithDefaultPlan(userId: string, input: CreateDogInput) {
  const shareCode = await uniqueShareCode()

  return prisma.$transaction(async tx => {
    const dog = await tx.dog.create({
      data: {
        name: input.name,
        breed: input.breed ?? null,
        age: input.age ?? null,
        photoKey: input.photoKey ?? null,
        notes: input.notes ?? null,
        shareCode
      }
    })

    await tx.dogMember.create({
      data: {
        dogId: dog.id,
        userId,
        role: 'caregiver'
      }
    })

    await tx.carePlan.create({
      data: {
        dogId: dog.id,
        name: DEFAULT_MOBILITY_STRENGTH_PLAN_NAME,
        isActive: true,
        actions: {
          create: DEFAULT_MOBILITY_STRENGTH_ACTIONS
        }
      }
    })

    return dog
  })
}
