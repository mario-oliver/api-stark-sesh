import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import { AuthenticatedRequest } from '../types/auth.js'
import {
  sendNotFound,
  sendSuccess,
  sendCreated
} from '../utils/responseHelpers.js'

export class TeamsController {
  private normalizeAliases(aliases: string[] | undefined) {
    const seen = new Set<string>()
    const normalized: Array<{ alias: string; normalizedAlias: string }> = []
    for (const alias of aliases ?? []) {
      const trimmed = alias.trim()
      if (!trimmed) continue
      const lower = trimmed.toLowerCase()
      if (seen.has(lower)) continue
      seen.add(lower)
      normalized.push({ alias: trimmed, normalizedAlias: lower })
    }
    return normalized
  }
  /**
   * Create a new team with optional name and members.
   */
  async createTeam(request: AuthenticatedRequest, reply: FastifyReply) {
    await ensureUserExists(request)

    const data = request.body as { name?: string; members: Array<{ number: string; name: string; aliases?: string[] }> }

    const team = await prisma.team.create({
      data: {
        name: data.name ?? null,
        userId: request.user.id,
        members: {
          create: (data.members ?? []).map((m) => ({
            number: m.number ?? '',
            name: m.name ?? '',
            aliases: {
              create: this.normalizeAliases(m.aliases)
            }
          }))
        }
      },
      include: {
        members: {
          include: { aliases: true }
        }
      }
    })

    return sendCreated(reply, { team }, 'Team created successfully')
  }

  /**
   * List teams for the current user.
   */
  async listTeams(request: AuthenticatedRequest, reply: FastifyReply) {
    const teams = await prisma.team.findMany({
      where: { userId: request.user.id },
      include: { members: { include: { aliases: true } } },
      orderBy: { updatedAt: 'desc' }
    })
    return sendSuccess(reply, { teams })
  }

  /**
   * Get a team by ID (must belong to the current user).
   */
  async getTeam(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }

    const team = await prisma.team.findFirst({
      where: {
        id,
        userId: request.user.id
      },
      include: { members: { include: { aliases: true } } }
    })

    if (!team) {
      return sendNotFound(reply, 'Team not found')
    }

    return sendSuccess(reply, { team })
  }

  /**
   * Add a player to an existing team (must belong to current user).
   */
  async addTeamMember(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }
    const body = request.body as { number: string; name: string; aliases?: string[] }

    const team = await prisma.team.findFirst({
      where: {
        id,
        userId: request.user.id
      }
    })

    if (!team) {
      return sendNotFound(reply, 'Team not found')
    }

    const member = await prisma.teamMember.create({
      data: {
        teamId: id,
        number: body.number ?? '',
        name: body.name ?? '',
        aliases: {
          create: this.normalizeAliases(body.aliases)
        }
      },
      include: { aliases: true }
    })

    return sendCreated(reply, { member }, 'Player added to team')
  }

  /**
   * Edit a team member (soft deactivate via isActive=false).
   * Soft delete keeps TeamMember rows so past observation tagging remains intact.
   */
  async updateTeamMember(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: teamId, memberId } = request.params as { id: string; memberId: string }
    const body = request.body as { number?: string; name?: string; isActive?: boolean; aliases?: string[] }

    const team = await prisma.team.findFirst({
      where: { id: teamId, userId: request.user.id }
    })
    if (!team) {
      return sendNotFound(reply, 'Team not found')
    }

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, teamId }
    })
    if (!member) {
      return sendNotFound(reply, 'Team member not found')
    }

    const nextIsActive = body.isActive ?? member.isActive
    const deactivatedAt =
      nextIsActive === false ? member.deactivatedAt ?? new Date() : null

    const updated = await prisma.$transaction(async tx => {
      if (body.aliases != null) {
        await tx.teamMemberAlias.deleteMany({ where: { teamMemberId: memberId } })
        const aliases = this.normalizeAliases(body.aliases)
        if (aliases.length > 0) {
          await tx.teamMemberAlias.createMany({
            data: aliases.map(a => ({
              teamMemberId: memberId,
              alias: a.alias,
              normalizedAlias: a.normalizedAlias
            }))
          })
        }
      }
      return tx.teamMember.update({
        where: { id: memberId },
        data: {
          number: body.number ?? member.number,
          name: body.name ?? member.name,
          isActive: nextIsActive,
          deactivatedAt
        },
        include: { aliases: true }
      })
    })

    return sendSuccess(reply, { member: updated })
  }
}
