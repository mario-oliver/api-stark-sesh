import { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import { AuthenticatedRequest } from '../types/auth.js'
import { sendNotFound, sendSuccess, sendCreated, sendError } from '../utils/responseHelpers.js'
import { transcribe } from '../services/speechToText.js'
import { enqueueObservationProcessingJob } from '../services/observationProcessing/queue.js'
import { recomputeObservationTotalsFromLines } from '../services/observationProcessing/statDerivation.js'
import { generatePracticePlanWithLlm } from '../services/practicePlan/generatePracticePlan.js'
import { generateDrillFromTranscriptWithLlm } from '../services/practicePlan/generateDrillFromTranscript.js'
import { extractGameStatsFromTranscript } from '../services/gameStats/extractStatsFromTranscript.js'
import { Prisma } from '../generated/client.js'

const sessionInclude = {
  team: { include: { members: { include: { aliases: true } } } },
  participants: { include: { teamMember: true } },
  observations: {
    orderBy: { recordedAt: 'desc' as const },
    include: {
      drill: true,
      playerTags: { include: { teamMember: true } }
    }
  },
  playerStats: {
    include: {
      teamMember: true
    }
  },
  practicePlan: {
    include: {
      drills: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          playerFocus: { include: { teamMember: true } }
        }
      }
    }
  }
} satisfies Prisma.SessionInclude

type StatLineInput = {
  teamMemberId: string
  points: number
  assists: number
  rebounds: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
}

type StatMetric = keyof Omit<StatLineInput, 'teamMemberId'>

const statMetrics: StatMetric[] = [
  'points',
  'assists',
  'rebounds',
  'steals',
  'blocks',
  'turnovers',
  'fouls'
]

function metricField(metric: StatMetric, kind: 'computed' | 'locked' | 'override') {
  const first = metric.charAt(0).toUpperCase() + metric.slice(1)
  if (kind === 'computed') return `computed${first}`
  if (kind === 'locked') return `${metric}Locked`
  return `${metric}ManualOverride`
}

function buildStatsResponse(stats: Array<Record<string, any>>) {
  return stats.map(stat => {
    const computed: Record<StatMetric, number> = {
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0
    }
    const final: Record<StatMetric, number> = {
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0
    }
    const lockState: Record<StatMetric, { locked: boolean; manualOverride: number | null }> = {
      points: { locked: false, manualOverride: null },
      assists: { locked: false, manualOverride: null },
      rebounds: { locked: false, manualOverride: null },
      steals: { locked: false, manualOverride: null },
      blocks: { locked: false, manualOverride: null },
      turnovers: { locked: false, manualOverride: null },
      fouls: { locked: false, manualOverride: null }
    }

    for (const metric of statMetrics) {
      const computedField = metricField(metric, 'computed')
      const lockedField = metricField(metric, 'locked')
      const overrideField = metricField(metric, 'override')
      computed[metric] = Number(stat[computedField] ?? 0)
      final[metric] = Number(stat[metric] ?? 0)
      lockState[metric] = {
        locked: Boolean(stat[lockedField]),
        manualOverride: stat[overrideField] == null ? null : Number(stat[overrideField])
      }
    }

    return {
      ...stat,
      computed,
      final,
      lockState
    }
  })
}

function observationWithText<T extends { rawText: string }>(o: T) {
  const { rawText, ...rest } = o
  return { ...rest, text: rawText }
}

function sessionWithObservationText<S extends { observations: Array<{ rawText: string }> }>(s: S) {
  return {
    ...s,
    observations: s.observations.map(observationWithText)
  }
}

type ObsForPlayerView = {
  drillId: string | null
  drill: { title: string } | null
  rawText: string
  playerTags: Array<{ teamMemberId: string }>
}

function buildPlayerObservationSections(
  observations: ObsForPlayerView[],
  planDrills: Array<{ id: string; title: string; sortOrder: number }>
) {
  const byDrill = new Map<string | null, ObsForPlayerView[]>()
  for (const o of observations) {
    const k = o.drillId
    const list = byDrill.get(k) ?? []
    list.push(o)
    byDrill.set(k, list)
  }

  const planIds = new Set(planDrills.map(d => d.id))
  const sections: Array<{
    drillId: string | null
    drillTitle: string | null
    sortOrder: number | null
    observations: ReturnType<typeof observationWithText>[]
  }> = []

  sections.push({
    drillId: null,
    drillTitle: 'General & session-wide',
    sortOrder: null,
    observations: (byDrill.get(null) ?? []).map(observationWithText)
  })

  for (const d of planDrills) {
    sections.push({
      drillId: d.id,
      drillTitle: d.title,
      sortOrder: d.sortOrder,
      observations: (byDrill.get(d.id) ?? []).map(observationWithText)
    })
  }

  for (const [drillId, obs] of byDrill) {
    if (drillId === null || planIds.has(drillId)) continue
    sections.push({
      drillId,
      drillTitle: obs[0]?.drill?.title ?? 'Drill',
      sortOrder: null,
      observations: obs.map(observationWithText)
    })
  }

  return sections
}

async function assertTeamOwnedByUser(teamId: string, userId: string) {
  return prisma.team.findFirst({
    where: { id: teamId, userId }
  })
}

async function validateDrillForSession(sessionId: string, drillId: string | null | undefined) {
  if (!drillId) return null
  const d = await prisma.practiceDrill.findFirst({
    where: { id: drillId, practicePlan: { sessionId } }
  })
  return d ? drillId : null
}

function ensureGameSession(sessionType: string) {
  return sessionType === 'GAME'
}

function buildRosterStats(args: {
  roster: Array<{ id: string; number: string; name: string; isActive: boolean }>
  participants: Array<{ teamMemberId: string }>
  existingStats: Array<
    StatLineInput & {
      id: string
      sessionId: string
      createdAt: Date
      updatedAt: Date
      teamMember: { id: string; number: string; name: string }
    }
  >
}) {
  const existingByMemberId = new Map(args.existingStats.map(s => [s.teamMemberId, s]))
  const participantIds = new Set(args.participants.map(p => p.teamMemberId))
  const roster =
    participantIds.size > 0
      ? args.roster.filter(m => participantIds.has(m.id))
      : args.roster.filter(m => m.isActive)

  return roster.map(member => {
    const stat = existingByMemberId.get(member.id)
    if (stat) return stat
    return {
      id: `virtual-${member.id}`,
      sessionId: '',
      teamMemberId: member.id,
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      teamMember: {
        id: member.id,
        number: member.number,
        name: member.name
      }
    }
  })
}

const planDrillInclude = {
  orderBy: { sortOrder: 'asc' as const },
  include: { playerFocus: { include: { teamMember: true } } }
} as const

export class SessionsController {
  private normalizeAlias(rawName: string) {
    return rawName.trim().toLowerCase()
  }
  async createSession(request: AuthenticatedRequest, reply: FastifyReply) {
    await ensureUserExists(request)

    const data = request.body as {
      type: 'TEAM_PRACTICE' | 'SKILL_SESSION' | 'GAME' | 'TRYOUT' | 'OTHER'
      teamId: string
      participantMemberIds?: string[]
      startedAt?: string
    }

    const team = await assertTeamOwnedByUser(data.teamId, request.user.id)
    if (!team) {
      return sendNotFound(reply, 'Team not found')
    }

    if (data.type === 'SKILL_SESSION') {
      if (!data.participantMemberIds?.length) {
        return sendError(reply, 'SKILL_SESSION requires at least one participantMemberIds entry', 400)
      }
    }

    const roster = await prisma.teamMember.findMany({
      where: { teamId: data.teamId }
    })

    const participantIds =
      data.type === 'SKILL_SESSION'
        ? data.participantMemberIds!
        : roster.filter(m => m.isActive).map(m => m.id)

    const rosterSet = new Set(roster.map(m => m.id))
    for (const id of participantIds) {
      if (!rosterSet.has(id)) {
        return sendError(reply, 'participantMemberIds must belong to the team', 400)
      }
    }

    try {
      const session = await prisma.$transaction(async tx => {
        const s = await tx.session.create({
          data: {
            type: data.type,
            userId: request.user.id,
            teamId: data.teamId,
            ...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {})
          }
        })

        if (participantIds.length > 0) {
          await tx.sessionParticipant.createMany({
            data: participantIds.map(teamMemberId => ({
              sessionId: s.id,
              teamMemberId
            })),
            skipDuplicates: true
          })
        }

        return tx.session.findUniqueOrThrow({
          where: { id: s.id },
          include: sessionInclude
        })
      })

      return sendCreated(reply, { session: sessionWithObservationText(session) }, 'Session created successfully')
    } catch (e) {
      request.log.error(e, 'createSession')
      return sendError(reply, 'Failed to create session', 500)
    }
  }

  async getSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string }

    const session = await prisma.session.findFirst({
      where: { id, userId: request.user.id },
      include: sessionInclude
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    return sendSuccess(reply, { session: sessionWithObservationText(session) })
  }

  async getPlayerObservationView(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, teamMemberId } = request.params as { id: string; teamMemberId: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: sessionInclude
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const member = session.team.members.find(m => m.id === teamMemberId)
    if (!member) {
      return sendError(reply, 'Player is not on this session team', 400)
    }

    const taggedForPlayer = session.observations.filter(o =>
      o.playerTags.some(t => t.teamMemberId === teamMemberId)
    )
    const planDrills = session.practicePlan?.drills ?? []
    const sections = buildPlayerObservationSections(taggedForPlayer, planDrills)

    return sendSuccess(reply, {
      playerObservationView: {
        teamMemberId,
        teamMember: member,
        sections
      }
    })
  }

  async getSessions(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: userId } = request.params as { id: string }

    if (userId !== request.user.id) {
      return sendNotFound(reply, 'User not found')
    }

    const sessions = await prisma.session.findMany({
      where: { userId: request.user.id },
      include: sessionInclude,
      orderBy: { startedAt: 'desc' }
    })

    return sendSuccess(reply, {
      sessions: sessions.map(sessionWithObservationText)
    })
  }

  async transcribeAndStore(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const prompt = (request.query as { prompt?: string })?.prompt?.trim() || null
    const preview = (request.query as { preview?: string })?.preview === 'true'
    const drillIdRaw = (request.query as { drillId?: string })?.drillId

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const drillId = await validateDrillForSession(sessionId, drillIdRaw ?? undefined)
    if (drillIdRaw && !drillId) {
      return sendError(reply, 'drillId does not belong to this session plan', 400)
    }

    if (!request.isMultipart?.()) {
      return sendError(reply, 'Content-Type must be multipart/form-data', 400)
    }

    let fileBuffer: Buffer | null = null

    try {
      const part = await request.file()
      if (part && part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer()
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        return sendError(reply, 'No audio file provided', 400)
      }
    } catch (err) {
      request.log.error(err, 'Multipart parse error')
      return sendError(reply, 'Failed to parse upload', 400)
    }

    try {
      const { text } = await transcribe(fileBuffer, { prompt: prompt ?? undefined })
      if (!text) {
        if (preview) {
          return sendSuccess(reply, { text: '' }, 200)
        }
        return sendSuccess(reply, { text: '', observation: null }, 200)
      }

      if (preview) {
        return sendSuccess(reply, { text }, 200)
      }

      const observation = await prisma.observation.create({
        data: {
          sessionId,
          drillId,
          rawText: text,
          scope: 'UNKNOWN',
          taggingStatus: 'PENDING',
          taggingError: null,
          statStatus: 'PENDING',
          statError: null,
          statExtraction: Prisma.JsonNull
        },
        include: {
          drill: true,
          playerTags: { include: { teamMember: true } }
        }
      })

      await enqueueObservationProcessingJob(observation.id, { source: 'transcribe' })
      return sendCreated(reply, { text, observation: observationWithText(observation) }, 'Observation saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      if (message.includes('OPENAI_API_KEY')) {
        return sendError(reply, 'OPENAI_API_KEY is not configured', 500)
      }
      request.log.error(err, 'Transcribe error')
      return sendError(reply, message, 500)
    }
  }

  async updateObservation(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, observationId } = request.params as { id: string; observationId: string }
    const body = request.body as { text: string; drillId?: string | null }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const observation = await prisma.observation.findFirst({
      where: { id: observationId, sessionId }
    })
    if (!observation) {
      return sendNotFound(reply, 'Observation not found')
    }

    let nextDrillId: string | null | undefined = observation.drillId
    if (body.drillId !== undefined) {
      if (body.drillId === null) {
        nextDrillId = null
      } else {
        const v = await validateDrillForSession(sessionId, body.drillId)
        if (!v) {
          return sendError(reply, 'drillId does not belong to this session plan', 400)
        }
        nextDrillId = v
      }
    }

    const updated = await prisma.observation.update({
      where: { id: observationId },
      data: {
        rawText: body.text,
        drillId: nextDrillId,
        scope: 'UNKNOWN',
        taggingStatus: 'PENDING',
        taggingError: null,
        statStatus: 'PENDING',
        statError: null,
        statExtraction: Prisma.JsonNull
      },
      include: {
        drill: true,
        playerTags: { include: { teamMember: true } }
      }
    })

    await enqueueObservationProcessingJob(updated.id, { source: 'update_observation' })
    return sendSuccess(reply, { observation: observationWithText(updated) })
  }

  async getSessionStats(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: {
        team: { include: { members: true } },
        participants: true,
        playerStats: {
          include: { teamMember: true },
          orderBy: [{ teamMember: { number: 'asc' } }, { teamMember: { name: 'asc' } }]
        }
      }
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }
    if (!ensureGameSession(session.type)) {
      return sendError(reply, 'Stats are only available for GAME sessions', 400)
    }

    const rosterStats = buildRosterStats({
      roster: session.team.members,
      participants: session.participants,
      existingStats: session.playerStats
    })

    const memberIds = rosterStats.map(s => s.teamMemberId)
    const persisted = await prisma.sessionPlayerStat.findMany({
      where: { sessionId, teamMemberId: { in: memberIds } },
      include: {
        teamMember: true,
        attributions: true
      },
      orderBy: [{ teamMember: { number: 'asc' } }, { teamMember: { name: 'asc' } }]
    })
    const byMember = new Map(persisted.map(s => [s.teamMemberId, s]))

    const normalized = rosterStats.map(stat => {
      const saved = byMember.get(stat.teamMemberId)
      if (saved) return saved
      return {
        ...stat,
        computedPoints: stat.points,
        pointsLocked: false,
        pointsManualOverride: null,
        computedAssists: stat.assists,
        assistsLocked: false,
        assistsManualOverride: null,
        computedRebounds: stat.rebounds,
        reboundsLocked: false,
        reboundsManualOverride: null,
        computedSteals: stat.steals,
        stealsLocked: false,
        stealsManualOverride: null,
        computedBlocks: stat.blocks,
        blocksLocked: false,
        blocksManualOverride: null,
        computedTurnovers: stat.turnovers,
        turnoversLocked: false,
        turnoversManualOverride: null,
        computedFouls: stat.fouls,
        foulsLocked: false,
        foulsManualOverride: null,
        attributions: []
      }
    })

    const stats = buildStatsResponse(normalized as Array<Record<string, any>>) as Array<Record<string, any>>
    const attributionSummary = stats.map(stat => ({
      teamMemberId: stat.teamMemberId,
      observationCount: Array.isArray(stat.attributions)
        ? new Set((stat.attributions as Array<{ observationId: string }>).map(a => a.observationId)).size
        : 0
    }))

    const derivedLines = await prisma.derivedStatLine.findMany({
      where: { sessionId },
      include: {
        teamMember: true,
        observation: true
      },
      orderBy: [{ createdAt: 'desc' }]
    })

    return sendSuccess(reply, { stats, attributionSummary, derivedLines })
  }

  async patchSessionStatMetric(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, playerId, metric } = request.params as {
      id: string
      playerId: string
      metric: StatMetric
    }
    const body = request.body as { lock?: boolean; manualOverride?: number | null }

    if (!statMetrics.includes(metric)) {
      return sendError(reply, 'Invalid stat metric', 400)
    }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id, type: 'GAME' }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const stat = await prisma.sessionPlayerStat.upsert({
      where: {
        sessionId_teamMemberId: {
          sessionId,
          teamMemberId: playerId
        }
      },
      create: {
        sessionId,
        teamMemberId: playerId
      },
      update: {}
    })

    const updateData: Record<string, unknown> = {}
    const lockedField = metricField(metric, 'locked')
    const overrideField = metricField(metric, 'override')
    const computedField = metricField(metric, 'computed')

    if (typeof body.lock === 'boolean') {
      updateData[lockedField] = body.lock
      if (!body.lock && (stat as Record<string, unknown>)[overrideField] == null) {
        updateData[metric] = Number((stat as Record<string, unknown>)[computedField] ?? 0)
      }
    }

    if (body.manualOverride !== undefined) {
      const override = body.manualOverride == null ? null : Math.max(0, Math.trunc(body.manualOverride))
      updateData[overrideField] = override
      updateData[metric] = override ?? Number((stat as Record<string, unknown>)[computedField] ?? 0)
    }

    const updated = await prisma.sessionPlayerStat.update({
      where: { id: stat.id },
      data: updateData,
      include: { teamMember: true }
    })

    return sendSuccess(reply, {
      stat: buildStatsResponse([updated as Record<string, any>])[0]
    })
  }

  async getObservationJobs(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      select: { id: true }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const jobs = await prisma.observationProcessingJob.findMany({
      where: { observation: { sessionId } },
      orderBy: [{ createdAt: 'desc' }],
      take: 100
    })
    return sendSuccess(reply, { jobs })
  }

  async rerunObservationProcessing(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, observationId } = request.params as { id: string; observationId: string }
    const observation = await prisma.observation.findFirst({
      where: {
        id: observationId,
        sessionId,
        session: { userId: request.user.id }
      }
    })
    if (!observation) {
      return sendNotFound(reply, 'Observation not found')
    }

    await prisma.observation.update({
      where: { id: observationId },
      data: {
        taggingStatus: 'PENDING',
        taggingError: null,
        statStatus: 'PENDING',
        statError: null
      }
    })

    await enqueueObservationProcessingJob(
      observationId,
      {
      reason: 'manual_observation_rerun',
      requestedBy: request.user.id,
      batchKey: `observation-${observationId}`
      },
      { force: true }
    )

    return sendSuccess(reply, { queued: true, observationId })
  }

  async resolveUnrecognizedName(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, observationId } = request.params as { id: string; observationId: string }
    const body = request.body as { rawName: string; teamMemberId: string; applyToSessionOnly?: boolean }
    const rawName = body.rawName?.trim() ?? ''
    if (!rawName) return sendError(reply, 'rawName is required', 400)

    const observation = await prisma.observation.findFirst({
      where: {
        id: observationId,
        sessionId,
        session: { userId: request.user.id }
      },
      include: { session: { include: { team: true } } }
    })
    if (!observation) return sendNotFound(reply, 'Observation not found')

    const member = await prisma.teamMember.findFirst({
      where: { id: body.teamMemberId, teamId: observation.session.teamId }
    })
    if (!member) return sendNotFound(reply, 'Team member not found')

    const normalizedAlias = this.normalizeAlias(rawName)
    await prisma.teamMemberAlias.upsert({
      where: {
        teamMemberId_normalizedAlias: {
          teamMemberId: member.id,
          normalizedAlias
        }
      },
      create: {
        teamMemberId: member.id,
        alias: rawName,
        normalizedAlias
      },
      update: {
        alias: rawName
      }
    })

    await prisma.observation.update({
      where: { id: observationId },
      data: {
        taggingStatus: 'PENDING',
        taggingError: null,
        statStatus: 'PENDING',
        statError: null
      }
    })
    await enqueueObservationProcessingJob(
      observationId,
      {
        reason: 'manual_unrecognized_name_resolution',
        requestedBy: request.user.id,
        batchKey: `resolve-${observationId}-${Date.now()}`,
        applyToSessionOnly: Boolean(body.applyToSessionOnly)
      },
      { force: true }
    )
    request.log.info(
      { sessionId, observationId, rawName, teamMemberId: member.id, applyToSessionOnly: Boolean(body.applyToSessionOnly) },
      'observation_unrecognized_name_resolved'
    )

    return sendSuccess(reply, { resolved: true, observationId, teamMemberId: member.id, rawName })
  }

  async rerunGameStats(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const body = request.body as { onlyFailed?: boolean; fromTimestamp?: string }
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id, type: 'GAME' }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const where: Prisma.ObservationWhereInput = {
      sessionId
    }
    if (body.onlyFailed) {
      where.OR = [{ taggingStatus: 'FAILED' }, { statStatus: 'FAILED' }]
    }
    if (body.fromTimestamp) {
      where.recordedAt = { gte: new Date(body.fromTimestamp) }
    }
    const observations = await prisma.observation.findMany({
      where,
      select: { id: true }
    })
    const batchKey = `game-${sessionId}-${Date.now()}`
    for (const observation of observations) {
      await prisma.observation.update({
        where: { id: observation.id },
        data: {
          taggingStatus: 'PENDING',
          taggingError: null,
          statStatus: 'PENDING',
          statError: null
        }
      })
      await enqueueObservationProcessingJob(
        observation.id,
        {
        reason: 'manual_game_rerun',
        requestedBy: request.user.id,
        batchKey
        },
        { force: true }
      )
    }
    return sendSuccess(reply, { queued: observations.length, batchKey })
  }

  async editDerivedStatLine(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, lineId } = request.params as { id: string; lineId: string }
    const body = request.body as Partial<{
      points: number
      assists: number
      rebounds: number
      steals: number
      blocks: number
      turnovers: number
      fouls: number
      teamMemberId: string | null
      reviewNote: string | null
    }>
    const line = await prisma.derivedStatLine.findFirst({
      where: { id: lineId, sessionId, observation: { session: { userId: request.user.id } } }
    })
    if (!line) return sendNotFound(reply, 'Derived stat line not found')

    const updated = await prisma.derivedStatLine.update({
      where: { id: lineId },
      data: {
        ...(body.points !== undefined ? { points: body.points } : {}),
        ...(body.assists !== undefined ? { assists: body.assists } : {}),
        ...(body.rebounds !== undefined ? { rebounds: body.rebounds } : {}),
        ...(body.steals !== undefined ? { steals: body.steals } : {}),
        ...(body.blocks !== undefined ? { blocks: body.blocks } : {}),
        ...(body.turnovers !== undefined ? { turnovers: body.turnovers } : {}),
        ...(body.fouls !== undefined ? { fouls: body.fouls } : {}),
        ...(body.teamMemberId !== undefined ? { teamMemberId: body.teamMemberId } : {}),
        reviewedById: request.user.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ?? null,
        status: 'EDITED'
      },
      include: { teamMember: true, observation: true }
    })

    await recomputeObservationTotalsFromLines(line.observationId)
    return sendSuccess(reply, { line: updated })
  }

  async approveDerivedStatLine(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, lineId } = request.params as { id: string; lineId: string }
    const body = request.body as { reviewNote?: string | null }
    const line = await prisma.derivedStatLine.findFirst({
      where: { id: lineId, sessionId, observation: { session: { userId: request.user.id } } }
    })
    if (!line) return sendNotFound(reply, 'Derived stat line not found')

    const updated = await prisma.derivedStatLine.update({
      where: { id: lineId },
      data: {
        status: 'APPROVED',
        reviewedById: request.user.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ?? null
      },
      include: { teamMember: true, observation: true }
    })
    await recomputeObservationTotalsFromLines(line.observationId)
    return sendSuccess(reply, { line: updated })
  }

  async rejectDerivedStatLine(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, lineId } = request.params as { id: string; lineId: string }
    const body = request.body as { reviewNote?: string | null }
    const line = await prisma.derivedStatLine.findFirst({
      where: { id: lineId, sessionId, observation: { session: { userId: request.user.id } } }
    })
    if (!line) return sendNotFound(reply, 'Derived stat line not found')

    const updated = await prisma.derivedStatLine.update({
      where: { id: lineId },
      data: {
        status: 'REJECTED',
        reviewedById: request.user.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ?? null
      },
      include: { teamMember: true, observation: true }
    })
    await recomputeObservationTotalsFromLines(line.observationId)
    return sendSuccess(reply, { line: updated })
  }

  async replaceSessionStats(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const body = request.body as { stats: StatLineInput[] }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: {
        team: { include: { members: { include: { aliases: true } } } }
      }
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }
    if (!ensureGameSession(session.type)) {
      return sendError(reply, 'Stats are only available for GAME sessions', 400)
    }

    const rosterSet = new Set(session.team.members.map(m => m.id))
    for (const stat of body.stats) {
      if (!rosterSet.has(stat.teamMemberId)) {
        return sendError(reply, 'teamMemberId must belong to the session team', 400)
      }
    }

    await prisma.$transaction(async tx => {
      for (const stat of body.stats) {
        const current = await tx.sessionPlayerStat.upsert({
          where: {
            sessionId_teamMemberId: {
              sessionId,
              teamMemberId: stat.teamMemberId
            }
          },
          create: {
            sessionId,
            teamMemberId: stat.teamMemberId
          },
          update: {}
        })
        await tx.sessionPlayerStat.update({
          where: { id: current.id },
          data: {
            points: stat.points,
            pointsManualOverride: stat.points,
            pointsLocked: true,
            assists: stat.assists,
            assistsManualOverride: stat.assists,
            assistsLocked: true,
            rebounds: stat.rebounds,
            reboundsManualOverride: stat.rebounds,
            reboundsLocked: true,
            steals: stat.steals,
            stealsManualOverride: stat.steals,
            stealsLocked: true,
            blocks: stat.blocks,
            blocksManualOverride: stat.blocks,
            blocksLocked: true,
            turnovers: stat.turnovers,
            turnoversManualOverride: stat.turnovers,
            turnoversLocked: true,
            fouls: stat.fouls,
            foulsManualOverride: stat.fouls,
            foulsLocked: true
          }
        })
      }
    })

    const saved = await prisma.sessionPlayerStat.findMany({
      where: { sessionId },
      include: { teamMember: true },
      orderBy: [{ teamMember: { number: 'asc' } }, { teamMember: { name: 'asc' } }]
    })

    return sendSuccess(reply, { stats: buildStatsResponse(saved as Array<Record<string, any>>) })
  }

  async transcribeAndStoreStats(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const prompt = (request.query as { prompt?: string })?.prompt?.trim() || null

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: {
        team: { include: { members: { include: { aliases: true } } } }
      }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }
    if (!ensureGameSession(session.type)) {
      return sendError(reply, 'Stats are only available for GAME sessions', 400)
    }
    if (!request.isMultipart?.()) {
      return sendError(reply, 'Content-Type must be multipart/form-data', 400)
    }

    let fileBuffer: Buffer | null = null
    try {
      const part = await request.file()
      if (part && part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer()
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        return sendError(reply, 'No audio file provided', 400)
      }
    } catch (err) {
      request.log.error(err, 'Multipart parse error')
      return sendError(reply, 'Failed to parse upload', 400)
    }

    const observationFirstEnabled = (process.env.FEATURE_OBSERVATION_FIRST_STATS || 'true') === 'true'
    const startedAt = Date.now()

    try {
      const { text } = await transcribe(fileBuffer, { prompt: prompt ?? undefined })
      if (!text) {
        return sendSuccess(reply, { text: '', parsedStats: [], stats: [] }, 200)
      }

      if (!observationFirstEnabled) {
        const roster = session.team.members
          .filter(m => m.isActive)
          .map(m => ({
            teamMemberId: m.id,
            number: m.number,
            name: m.name,
            aliases: m.aliases.map(a => a.alias)
          }))

        const parsed = await extractGameStatsFromTranscript({
          transcript: text,
          roster
        })
        const parsedStats = parsed.aggregated

        await prisma.$transaction(async tx => {
          for (const stat of parsedStats) {
            await tx.sessionPlayerStat.upsert({
              where: {
                sessionId_teamMemberId: {
                  sessionId,
                  teamMemberId: stat.teamMemberId
                }
              },
              create: {
                sessionId,
                teamMemberId: stat.teamMemberId,
                points: stat.points,
                assists: stat.assists,
                rebounds: stat.rebounds,
                steals: stat.steals,
                blocks: stat.blocks,
                turnovers: stat.turnovers,
                fouls: stat.fouls
              },
              update: {
                points: stat.points,
                assists: stat.assists,
                rebounds: stat.rebounds,
                steals: stat.steals,
                blocks: stat.blocks,
                turnovers: stat.turnovers,
                fouls: stat.fouls
              }
            })
          }
        })
        const stats = await prisma.sessionPlayerStat.findMany({
          where: { sessionId },
          include: { teamMember: true },
          orderBy: [{ teamMember: { number: 'asc' } }, { teamMember: { name: 'asc' } }]
        })
        request.log.info({ sessionId, elapsedMs: Date.now() - startedAt }, 'stats_transcribe_sync_complete')
        return sendSuccess(reply, { text, parsedStats, stats: buildStatsResponse(stats as Array<Record<string, any>>) })
      }

      const observation = await prisma.observation.create({
        data: {
          sessionId,
          rawText: text,
          scope: 'UNKNOWN',
          taggingStatus: 'PENDING',
          taggingError: null,
          statStatus: 'PENDING',
          statError: null,
          statExtraction: Prisma.JsonNull
        },
        include: {
          drill: true,
          playerTags: { include: { teamMember: true } }
        }
      })
      await enqueueObservationProcessingJob(observation.id, { source: 'stats_transcribe' })

      const stats = await prisma.sessionPlayerStat.findMany({
        where: { sessionId },
        include: { teamMember: true },
        orderBy: [{ teamMember: { number: 'asc' } }, { teamMember: { name: 'asc' } }]
      })

      request.log.info(
        { sessionId, observationId: observation.id, elapsedMs: Date.now() - startedAt },
        'stats_transcribe_observation_enqueued'
      )
      return sendSuccess(reply, {
        text,
        parsedStats: [],
        stats: buildStatsResponse(stats as Array<Record<string, any>>),
        observation: observationWithText(observation)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      if (message.includes('OPENAI_API_KEY')) {
        return sendError(reply, 'OPENAI_API_KEY is not configured', 500)
      }
      request.log.error(err, 'Transcribe stats error')
      return sendError(reply, message, 500)
    }
  }

  async getPracticePlan(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: {
        practicePlan: {
          include: {
            drills: planDrillInclude
          }
        }
      }
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    return sendSuccess(reply, { practicePlan: session.practicePlan })
  }

  async replacePracticePlan(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const body = request.body as {
      title?: string | null
      goals?: string[]
      userPrompt?: string | null
      drills?: Array<{
        title: string
        description?: string | null
        execution?: string | null
        durationMinutes?: number | null
        focusTags?: string[]
        playerFocusMemberIds?: string[]
      }>
    }

    const goals = body.goals ?? []
    const drills = body.drills ?? []

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: { team: true, practicePlan: true }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const roster = await prisma.teamMember.findMany({ where: { teamId: session.teamId } })
    const rosterSet = new Set(roster.map(m => m.id))

    for (const d of drills) {
      for (const pid of d.playerFocusMemberIds ?? []) {
        if (!rosterSet.has(pid)) {
          return sendError(reply, 'playerFocusMemberIds must belong to the session team', 400)
        }
      }
    }

    const prevSource = session.practicePlan?.source
    const nextSource = prevSource === 'LLM' || prevSource === 'MIXED' ? 'MIXED' : 'MANUAL'

    const plan = await prisma.$transaction(async tx => {
      const sp = await tx.practicePlan.upsert({
        where: { sessionId },
        create: {
          sessionId,
          title: body.title ?? null,
          goals,
          userPrompt: body.userPrompt ?? null,
          source: nextSource
        },
        update: {
          title: body.title ?? null,
          goals,
          userPrompt: body.userPrompt ?? null,
          source: nextSource
        }
      })

      await tx.practiceDrill.deleteMany({ where: { practicePlanId: sp.id } })

      for (let i = 0; i < drills.length; i++) {
        const d = drills[i]
        const created = await tx.practiceDrill.create({
          data: {
            practicePlanId: sp.id,
            sortOrder: i,
            title: d.title,
            description: d.description ?? null,
            execution: d.execution ?? null,
            durationMinutes: d.durationMinutes ?? null,
            focusTags: d.focusTags ?? []
          }
        })
        const pids = d.playerFocusMemberIds ?? []
        if (pids.length > 0) {
          await tx.practiceDrillPlayerFocus.createMany({
            data: pids.map(teamMemberId => ({
              drillId: created.id,
              teamMemberId
            })),
            skipDuplicates: true
          })
        }
      }

      return tx.practicePlan.findUniqueOrThrow({
        where: { id: sp.id },
        include: {
          drills: planDrillInclude
        }
      })
    })

    return sendSuccess(reply, { practicePlan: plan })
  }

  async addPracticeDrill(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const d = request.body as {
      title: string
      description?: string | null
      execution?: string | null
      durationMinutes?: number | null
      focusTags?: string[]
      playerFocusMemberIds?: string[]
    }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: { team: true, practicePlan: { include: { drills: true } } }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const roster = await prisma.teamMember.findMany({ where: { teamId: session.teamId } })
    const rosterSet = new Set(roster.map(m => m.id))
    for (const pid of d.playerFocusMemberIds ?? []) {
      if (!rosterSet.has(pid)) {
        return sendError(reply, 'playerFocusMemberIds must belong to the session team', 400)
      }
    }

    let plan = session.practicePlan
    if (!plan) {
      plan = await prisma.practicePlan.create({
        data: { sessionId, source: 'MANUAL', goals: [] },
        include: { drills: true }
      })
    }

    const maxOrder = plan.drills.reduce((m, x) => Math.max(m, x.sortOrder), -1)
    const nextSource = plan.source === 'LLM' ? 'MIXED' : plan.source

    await prisma.practicePlan.update({
      where: { id: plan.id },
      data: { source: nextSource }
    })

    const created = await prisma.practiceDrill.create({
      data: {
        practicePlanId: plan.id,
        sortOrder: maxOrder + 1,
        title: d.title,
        description: d.description ?? null,
        execution: d.execution ?? null,
        durationMinutes: d.durationMinutes ?? null,
        focusTags: d.focusTags ?? []
      }
    })

    const pids = d.playerFocusMemberIds ?? []
    if (pids.length > 0) {
      await prisma.practiceDrillPlayerFocus.createMany({
        data: pids.map(teamMemberId => ({ drillId: created.id, teamMemberId })),
        skipDuplicates: true
      })
    }

    const fullPlan = await prisma.practicePlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        drills: planDrillInclude
      }
    })

    return sendCreated(reply, { drill: created, practicePlan: fullPlan })
  }

  async createDrillFromTranscript(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const body = request.body as { transcript: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: { team: { include: { members: true } }, practicePlan: { include: { drills: true } } }
    })
    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    const roster = session.team.members
      .filter(m => m.isActive)
      .map(m => ({
        teamMemberId: m.id,
        number: m.number,
        name: m.name
      }))

    let generated
    try {
      generated = await generateDrillFromTranscriptWithLlm({
        transcript: body.transcript,
        sessionType: session.type,
        roster
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate drill'
      if (message.includes('OPENAI_API_KEY')) {
        return sendError(reply, 'OPENAI_API_KEY is not configured', 500)
      }
      request.log.error(err, 'createDrillFromTranscript')
      return sendError(reply, message, 500)
    }

    const rosterSet = new Set(session.team.members.map(m => m.id))
    for (const pid of generated.playerFocusMemberIds ?? []) {
      if (!rosterSet.has(pid)) {
        return sendError(reply, 'Invalid playerFocusMemberIds from model', 500)
      }
    }

    let plan = session.practicePlan
    if (!plan) {
      plan = await prisma.practicePlan.create({
        data: { sessionId, source: 'MIXED', goals: [] },
        include: { drills: true }
      })
    }

    const maxOrder = plan.drills.reduce((m, x) => Math.max(m, x.sortOrder), -1)
    const nextSource = plan.source === 'LLM' ? 'MIXED' : plan.source === 'MANUAL' ? 'MIXED' : plan.source

    await prisma.practicePlan.update({
      where: { id: plan.id },
      data: { source: nextSource }
    })

    const created = await prisma.practiceDrill.create({
      data: {
        practicePlanId: plan.id,
        sortOrder: maxOrder + 1,
        title: generated.title,
        description: generated.description,
        execution: generated.execution,
        durationMinutes: generated.durationMinutes,
        focusTags: generated.focusTags ?? []
      }
    })

    const pids = generated.playerFocusMemberIds ?? []
    if (pids.length > 0) {
      await prisma.practiceDrillPlayerFocus.createMany({
        data: pids.map(teamMemberId => ({ drillId: created.id, teamMemberId })),
        skipDuplicates: true
      })
    }

    const fullPlan = await prisma.practicePlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        drills: planDrillInclude
      }
    })

    const drill = fullPlan.drills.find(x => x.id === created.id)!
    return sendCreated(reply, { drill, practicePlan: fullPlan }, 'Drill created')
  }

  async updatePracticeDrill(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, drillId } = request.params as { id: string; drillId: string }
    const patch = request.body as Partial<{
      title: string
      description: string | null
      execution: string | null
      durationMinutes: number | null
      focusTags: string[]
      playerFocusMemberIds: string[]
    }>

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: { team: true, practicePlan: { include: { drills: true } } }
    })
    if (!session?.practicePlan) {
      return sendNotFound(reply, 'Practice plan not found')
    }

    const belongs = session.practicePlan.drills.some(d => d.id === drillId)
    if (!belongs) {
      return sendNotFound(reply, 'Drill not found')
    }

    if (patch.playerFocusMemberIds) {
      const roster = await prisma.teamMember.findMany({ where: { teamId: session.teamId } })
      const rosterSet = new Set(roster.map(m => m.id))
      for (const pid of patch.playerFocusMemberIds) {
        if (!rosterSet.has(pid)) {
          return sendError(reply, 'playerFocusMemberIds must belong to the session team', 400)
        }
      }
    }

    const prevSource = session.practicePlan.source
    const nextSource = prevSource === 'LLM' ? 'MIXED' : prevSource

    await prisma.$transaction(async tx => {
      if (nextSource !== prevSource) {
        await tx.practicePlan.update({
          where: { id: session.practicePlan!.id },
          data: { source: nextSource }
        })
      }

      await tx.practiceDrill.update({
        where: { id: drillId },
        data: {
          ...(patch.title != null ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.execution !== undefined ? { execution: patch.execution } : {}),
          ...(patch.durationMinutes !== undefined ? { durationMinutes: patch.durationMinutes } : {}),
          ...(patch.focusTags != null ? { focusTags: patch.focusTags } : {})
        }
      })

      if (patch.playerFocusMemberIds) {
        await tx.practiceDrillPlayerFocus.deleteMany({ where: { drillId } })
        if (patch.playerFocusMemberIds.length > 0) {
          await tx.practiceDrillPlayerFocus.createMany({
            data: patch.playerFocusMemberIds.map(teamMemberId => ({
              drillId,
              teamMemberId
            }))
          })
        }
      }
    })

    const fullPlan = await prisma.practicePlan.findUniqueOrThrow({
      where: { id: session.practicePlan.id },
      include: {
        drills: planDrillInclude
      }
    })

    const drill = fullPlan.drills.find(d => d.id === drillId)!
    return sendSuccess(reply, { drill, practicePlan: fullPlan })
  }

  async deletePracticeDrill(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId, drillId } = request.params as { id: string; drillId: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: { practicePlan: { include: { drills: true } } }
    })
    if (!session?.practicePlan) {
      return sendNotFound(reply, 'Practice plan not found')
    }

    const belongs = session.practicePlan.drills.some(d => d.id === drillId)
    if (!belongs) {
      return sendNotFound(reply, 'Drill not found')
    }

    const prevSource = session.practicePlan.source
    const nextSource = prevSource === 'LLM' ? 'MIXED' : prevSource

    await prisma.$transaction(async tx => {
      if (nextSource !== prevSource) {
        await tx.practicePlan.update({
          where: { id: session.practicePlan!.id },
          data: { source: nextSource }
        })
      }
      await tx.practiceDrill.delete({ where: { id: drillId } })
    })

    const fullPlan = await prisma.practicePlan.findUnique({
      where: { id: session.practicePlan.id },
      include: {
        drills: planDrillInclude
      }
    })

    return sendSuccess(reply, { practicePlan: fullPlan })
  }

  async generatePracticePlan(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: sessionId } = request.params as { id: string }
    const body = request.body as { userPromptAddition?: string }

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId: request.user.id },
      include: {
        team: { include: { members: { where: { isActive: true } } } },
        practicePlan: true
      }
    })

    if (!session) {
      return sendNotFound(reply, 'Session not found')
    }

    if (session.type !== 'TEAM_PRACTICE') {
      return sendError(
        reply,
        'AI practice plan generation is only available for TEAM_PRACTICE sessions',
        400
      )
    }

    const addition = body.userPromptAddition?.trim() || null
    const rosterLines = session.team.members
      .filter(m => m.number.trim() || m.name.trim())
      .map((m, i) => `${i + 1}. #${m.number || '-'} ${m.name || ''}`.trim())

    try {
      const generated = await generatePracticePlanWithLlm({
        teamName: session.team.name,
        rosterLines,
        userPromptAddition: addition
      })

      const plan = await prisma.$transaction(async tx => {
        const sp = await tx.practicePlan.upsert({
          where: { sessionId },
          create: {
            sessionId,
            title: generated.title,
            goals: generated.goals,
            userPrompt: addition,
            source: 'LLM',
            lastGeneratedAt: new Date()
          },
          update: {
            title: generated.title,
            goals: generated.goals,
            userPrompt: addition,
            source: 'LLM',
            lastGeneratedAt: new Date()
          }
        })

        await tx.practiceDrill.deleteMany({ where: { practicePlanId: sp.id } })

        for (let i = 0; i < generated.drills.length; i++) {
          const d = generated.drills[i]
          await tx.practiceDrill.create({
            data: {
              practicePlanId: sp.id,
              sortOrder: i,
              title: d.title,
              description: d.description,
              execution: d.execution,
              durationMinutes: d.durationMinutes,
              focusTags: d.focusTags
            }
          })
        }

        return tx.practicePlan.findUniqueOrThrow({
          where: { id: sp.id },
          include: {
            drills: planDrillInclude
          }
        })
      })

      return sendSuccess(reply, { practicePlan: plan })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate practice plan'
      if (message.includes('OPENAI_API_KEY')) {
        return sendError(reply, 'OPENAI_API_KEY is not configured', 500)
      }
      request.log.error(err, 'generatePracticePlan')
      return sendError(reply, message, 500)
    }
  }
}
