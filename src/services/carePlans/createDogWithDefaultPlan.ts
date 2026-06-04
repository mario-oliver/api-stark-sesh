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
  sex?: 'MALE' | 'FEMALE' | 'UNKNOWN' | null
  weightLbs?: number | null
  condition?: string | null
  vetName?: string | null
  vetPhone?: string | null
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
        sex: input.sex ?? null,
        weightLbs: input.weightLbs ?? null,
        condition: input.condition ?? null,
        vetName: input.vetName ?? null,
        vetPhone: input.vetPhone ?? null,
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
          create: DEFAULT_MOBILITY_STRENGTH_ACTIONS.map(action => ({
            name: action.name,
            description: action.description ?? null,
            category: action.category,
            frequency: action.frequency,
            timeOfDay: action.timeOfDay ?? null,
            targetReps: action.targetReps ?? null,
            targetDurationSeconds: action.targetDurationSeconds ?? null,
            instructions: action.instructions ?? null,
            sortOrder: action.sortOrder,
            steps: action.steps
              ? {
                  create: action.steps.map(step => ({
                    name: step.name,
                    description: step.description ?? null,
                    instructions: step.instructions ?? null,
                    targetReps: step.targetReps ?? null,
                    targetDurationSeconds: step.targetDurationSeconds ?? null,
                    sortOrder: step.sortOrder
                  }))
                }
              : undefined
          }))
        }
      }
    })

    return dog
  })
}
