import { prisma } from '../../lib/prisma.js'
import type { AuditDogContext } from './types.js'

export async function loadAuditContext(dogId: string): Promise<AuditDogContext | null> {
  const dog = await prisma.dog.findUnique({
    where: { id: dogId },
    include: {
      carePlans: {
        where: { isActive: true },
        take: 1,
        include: {
          actions: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          }
        }
      }
    }
  })

  if (!dog) return null

  const activePlan = dog.carePlans[0]
  const actions = activePlan?.actions ?? []

  return {
    dogId: dog.id,
    dogName: dog.name,
    breed: dog.breed ?? null,
    age: dog.age ?? null,
    condition: dog.condition ?? null,
    notes: dog.notes ?? null,
    actions: actions.map(a => ({
      id: a.id,
      name: a.name,
      bucket: a.bucket,
      frequency: a.frequency,
      timeOfDay: a.timeOfDay ?? null,
      description: a.description ?? null,
      instructions: a.instructions ?? null
    }))
  }
}
