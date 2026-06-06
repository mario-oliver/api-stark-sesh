import type { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { assertDogMemberAccess, getDogForMember } from '../lib/dogAccess.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import { serializeDog, serializeDogs } from '../lib/serializeDog.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'
import { resolveTodayLog } from '../services/dailyCare/resolveTodayLog.js'
import { todayUtcDateString } from '../services/dailyCare/dateUtils.js'
import { createDogWithDefaultPlan } from '../services/carePlans/createDogWithDefaultPlan.js'
import { DEFAULT_MOBILITY_STRENGTH_PLAN_NAME } from '../services/carePlans/defaultMobilityStrengthPlan.js'
import { assertPhotoKeyOwnedByUser } from '../services/s3/dogPhotos.js'
import { normalizeShareCode } from '../lib/shareCode.js'

function validatePhotoKeyForUser(photoKey: string | null | undefined, userId: string) {
  if (photoKey == null || photoKey === '') {
    return null
  }
  assertPhotoKeyOwnedByUser(photoKey, userId)
  return photoKey
}

export class DogsController {
  async listDogs(request: AuthenticatedRequest, reply: FastifyReply) {
    await ensureUserExists(request)

    let memberships = await prisma.dogMember.findMany({
      where: { userId: request.user.id },
      include: {
        dog: {
          include: {
            carePlans: { where: { isActive: true }, take: 1 }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    if (memberships.length === 0) {
      const stark = await prisma.dog.findFirst({ where: { name: 'Stark' } })
      if (stark && process.env.STARK_AUTO_ATTACH === 'true') {
        await prisma.dogMember.upsert({
          where: { dogId_userId: { dogId: stark.id, userId: request.user.id } },
          create: { dogId: stark.id, userId: request.user.id, role: 'caregiver' },
          update: {}
        })
        memberships = await prisma.dogMember.findMany({
          where: { userId: request.user.id },
          include: {
            dog: {
              include: {
                carePlans: { where: { isActive: true }, take: 1 }
              }
            }
          },
          orderBy: { createdAt: 'asc' }
        })
      }
    }

    const dogs = await serializeDogs(
      memberships.map(m => ({ ...m.dog, role: m.role ?? undefined }))
    )
    return sendSuccess(reply, dogs)
  }

  async createDog(request: AuthenticatedRequest, reply: FastifyReply) {
    await ensureUserExists(request)
    const body = request.body as {
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

    let photoKey: string | null = null
    try {
      photoKey = validatePhotoKeyForUser(body.photoKey, request.user.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid photo'
      return sendError(reply, message, 400)
    }

    const dog = await createDogWithDefaultPlan(request.user.id, {
      ...body,
      photoKey
    })

    const serialized = await serializeDog(dog, {
      role: 'caregiver',
      defaultCarePlan: DEFAULT_MOBILITY_STRENGTH_PLAN_NAME
    })

    return sendCreated(reply, serialized, 'Dog created with default mobility & strength routine')
  }

  async updateDog(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const body = request.body as {
      name?: string
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

    const member = await assertDogMemberAccess(id, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    if (body.photoKey !== undefined) {
      try {
        validatePhotoKeyForUser(body.photoKey, request.user.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid photo'
        return sendError(reply, message, 400)
      }
    }

    const dog = await prisma.dog.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.breed !== undefined && { breed: body.breed }),
        ...(body.age !== undefined && { age: body.age }),
        ...(body.sex !== undefined && { sex: body.sex }),
        ...(body.weightLbs !== undefined && { weightLbs: body.weightLbs }),
        ...(body.condition !== undefined && { condition: body.condition }),
        ...(body.vetName !== undefined && { vetName: body.vetName }),
        ...(body.vetPhone !== undefined && { vetPhone: body.vetPhone }),
        ...(body.photoKey !== undefined && { photoKey: body.photoKey }),
        ...(body.notes !== undefined && { notes: body.notes })
      }
    })

    const serialized = await serializeDog(dog, { role: member.role ?? undefined })
    return sendSuccess(reply, serialized)
  }

  async getDog(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const dog = await getDogForMember(id, request.user.id)
    if (!dog) {
      return sendNotFound(reply, 'Dog not found')
    }
    const member = await assertDogMemberAccess(id, request.user.id)
    const serialized = await serializeDog(dog, {
      role: member?.role ?? undefined,
      includeShareCode: true
    })
    return sendSuccess(reply, serialized)
  }

  async previewJoin(request: AuthenticatedRequest, reply: FastifyReply) {
    const query = request.query as { code: string }
    const shareCode = normalizeShareCode(query.code)

    const dog = await prisma.dog.findUnique({ where: { shareCode } })
    if (!dog) {
      return sendNotFound(reply, 'Invalid share code')
    }

    const serialized = await serializeDog(dog)
    return sendSuccess(reply, {
      id: dog.id,
      name: serialized.name,
      breed: serialized.breed,
      photoUrl: serialized.photoUrl
    })
  }

  async joinByShareCode(request: AuthenticatedRequest, reply: FastifyReply) {
    await ensureUserExists(request)
    const body = request.body as { shareCode: string }
    const shareCode = normalizeShareCode(body.shareCode)

    const dog = await prisma.dog.findUnique({ where: { shareCode } })
    if (!dog) {
      return sendNotFound(reply, 'Invalid share code')
    }

    const membership = await prisma.dogMember.upsert({
      where: { dogId_userId: { dogId: dog.id, userId: request.user.id } },
      create: { dogId: dog.id, userId: request.user.id, role: 'caregiver' },
      update: {}
    })

    const serialized = await serializeDog(dog, {
      role: membership.role ?? undefined,
      includeShareCode: true
    })
    return sendSuccess(reply, serialized, 200, 'Joined care log')
  }

  async getToday(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const query = request.query as { date?: string }

    const member = await assertDogMemberAccess(id, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const date = query.date ?? todayUtcDateString()
    const payload = await resolveTodayLog(id, date)
    return sendSuccess(reply, payload)
  }

  async addMember(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const body = request.body as { userId: string; role?: string }

    const member = await assertDogMemberAccess(id, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const dog = await prisma.dog.findUnique({ where: { id } })
    if (!dog) {
      return sendNotFound(reply, 'Dog not found')
    }

    const targetUser = await prisma.user.findUnique({ where: { id: body.userId } })
    if (!targetUser) {
      return sendNotFound(reply, 'User not found')
    }

    const created = await prisma.dogMember.upsert({
      where: { dogId_userId: { dogId: id, userId: body.userId } },
      create: { dogId: id, userId: body.userId, role: body.role ?? 'caregiver' },
      update: { role: body.role ?? undefined },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    return sendCreated(reply, created, 'Member attached')
  }

  async getHistory(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const query = request.query as { page?: string; limit?: string }
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20))

    const member = await assertDogMemberAccess(id, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const [logs, total] = await Promise.all([
      prisma.dailyCareLog.findMany({
        where: { dogId: id },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: {
              dailyCareActions: true,
              healthObservations: true,
              voiceNotes: true
            }
          },
          dailyCareActions: {
            where: { status: 'COMPLETED' },
            select: { id: true }
          }
        }
      }),
      prisma.dailyCareLog.count({ where: { dogId: id } })
    ])

    return sendSuccess(reply, {
      logs: logs.map(log => ({
        id: log.id,
        date: log.date,
        summary: log.summary,
        completedCount: log.dailyCareActions.length,
        totalActions: log._count.dailyCareActions,
        observationCount: log._count.healthObservations,
        voiceNoteCount: log._count.voiceNotes
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  }
}
