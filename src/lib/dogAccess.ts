import { prisma } from './prisma.js'

export async function assertDogMemberAccess(dogId: string, userId: string) {
  const member = await prisma.dogMember.findUnique({
    where: { dogId_userId: { dogId, userId } }
  })
  if (!member) {
    return null
  }
  return member
}

export async function getDogForMember(dogId: string, userId: string) {
  const member = await assertDogMemberAccess(dogId, userId)
  if (!member) return null

  return prisma.dog.findUnique({
    where: { id: dogId },
    include: {
      members: {
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      }
    }
  })
}
