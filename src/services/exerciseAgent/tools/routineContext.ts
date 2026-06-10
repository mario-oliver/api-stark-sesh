import { prisma } from '../../../lib/prisma.js'
import type { DogAgentContext } from '../types.js'

export async function loadDogAgentContext(dogId: string): Promise<DogAgentContext | null> {
  const dog = await prisma.dog.findUnique({
    where: { id: dogId },
    include: {
      carePlans: {
        where: { isActive: true },
        include: {
          actions: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
              name: true,
              bucket: true,
              frequency: true,
              timeOfDay: true
            }
          }
        },
        take: 1
      }
    }
  })

  if (!dog) return null

  const plan = dog.carePlans[0]
  const routineSummary =
    !plan || plan.actions.length === 0
      ? '(none)'
      : plan.actions
          .map((a, i) => {
            return `${i + 1}. ${a.name} (${a.bucket}, ${a.frequency}${a.timeOfDay ? `, ${a.timeOfDay}` : ''})`
          })
          .join('\n')

  return {
    dogId: dog.id,
    dogName: dog.name,
    breed: dog.breed,
    age: dog.age,
    condition: dog.condition,
    notes: dog.notes,
    routineSummary
  }
}
