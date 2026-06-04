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
              category: true,
              frequency: true,
              timeOfDay: true,
              steps: {
                where: { isActive: true },
                select: { name: true },
                orderBy: { sortOrder: 'asc' }
              }
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
            const steps =
              a.steps.length > 0 ? ` — movements: ${a.steps.map(s => s.name).join(', ')}` : ''
            return `${i + 1}. ${a.name} (${a.category}, ${a.frequency}${a.timeOfDay ? `, ${a.timeOfDay}` : ''})${steps}`
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
