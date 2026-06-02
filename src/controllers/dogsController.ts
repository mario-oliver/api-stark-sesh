import type { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { assertDogMemberAccess, getDogForMember } from '../lib/dogAccess.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  sendCreated,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'
import { resolveTodayLog } from '../services/dailyCare/resolveTodayLog.js'
import { todayUtcDateString } from '../services/dailyCare/dateUtils.js'

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
      if (stark) {
        const memberCount = await prisma.dogMember.count({ where: { dogId: stark.id } })
        if (memberCount === 0 || process.env.STARK_AUTO_ATTACH === 'true') {
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
    }

    return sendSuccess(
      reply,
      memberships.map(m => ({
        ...m.dog,
        role: m.role
      }))
    )
  }

  async getDog(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const dog = await getDogForMember(id, request.user.id)
    if (!dog) {
      return sendNotFound(reply, 'Dog not found')
    }
    return sendSuccess(reply, dog)
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
