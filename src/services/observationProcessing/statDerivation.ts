import crypto from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import { extractGameStatsFromTranscript } from '../gameStats/extractStatsFromTranscript.js'

const METRICS = ['points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers', 'fouls'] as const

type StatMetric = (typeof METRICS)[number]

type ParsedStatLine = {
  teamMemberId: string
} & Record<StatMetric, number>

export function resolveFinalMetric(args: {
  computed: number
  isLocked: boolean
  manualOverride: number | null | undefined
  currentFinal: number
}) {
  if (args.manualOverride != null) return clampMetric(args.manualOverride)
  if (args.isLocked) return clampMetric(args.currentFinal)
  return clampMetric(args.computed)
}

function clampMetric(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 0
  return Math.max(0, Math.trunc(value))
}

function computedFieldName(metric: StatMetric) {
  const cap = metric.charAt(0).toUpperCase() + metric.slice(1)
  return `computed${cap}` as const
}

function lockedFieldName(metric: StatMetric) {
  return `${metric}Locked` as const
}

function overrideFieldName(metric: StatMetric) {
  return `${metric}ManualOverride` as const
}

export async function deriveObservationStats(observationId: string) {
  const observation = await prisma.observation.findUnique({
    where: { id: observationId },
    include: {
      session: {
        include: {
          participants: true,
          team: { include: { members: { include: { aliases: true } } } }
        }
      }
    }
  })
  if (!observation) return
  if (observation.session.type !== 'GAME') {
    await prisma.observation.update({
      where: { id: observationId },
      data: {
        statStatus: 'COMPLETE',
        statError: null,
        statProcessedAt: new Date(),
        statExtraction: { reason: 'non_game_session', stats: [] }
      }
    })
    return
  }

  await prisma.observation.update({
    where: { id: observationId },
    data: { statStatus: 'PROCESSING', statError: null }
  })

  const participantIds = new Set(observation.session.participants.map(p => p.teamMemberId))
  const roster = observation.session.team.members
    .filter(m => m.isActive && (participantIds.size === 0 || participantIds.has(m.id)))
    .map(m => ({
      teamMemberId: m.id,
      number: m.number,
      name: m.name,
      aliases: m.aliases.map(a => a.alias)
    }))

  try {
    const runId = crypto.randomUUID()
    const extracted = await extractGameStatsFromTranscript({
      transcript: observation.rawText,
      roster
    })
    const unresolvedCount = extracted.lines.filter(line => !line.teamMemberId).length
    const parsedStats: ParsedStatLine[] = extracted.aggregated.map(line => ({
      teamMemberId: line.teamMemberId,
      points: clampMetric(line.points),
      assists: clampMetric(line.assists),
      rebounds: clampMetric(line.rebounds),
      steals: clampMetric(line.steals),
      blocks: clampMetric(line.blocks),
      turnovers: clampMetric(line.turnovers),
      fouls: clampMetric(line.fouls)
    }))

    await prisma.$transaction(async tx => {
      await tx.derivedStatLine.deleteMany({ where: { observationId } })
      const previousAttributions = await tx.observationStatAttribution.findMany({
        where: { observationId }
      })

      const previousByStatId = new Map<string, Record<StatMetric, number>>()
      for (const item of previousAttributions) {
        const key = item.sessionPlayerStatId
        const existing = previousByStatId.get(key) ?? {
          points: 0,
          assists: 0,
          rebounds: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0
        }
        existing[item.metric as StatMetric] += item.delta
        previousByStatId.set(key, existing)
      }

      await tx.observationStatAttribution.deleteMany({ where: { observationId } })

      await tx.derivedStatLine.createMany({
        data: extracted.lines.map(line => ({
          sessionId: observation.sessionId,
          observationId,
          teamMemberId: line.teamMemberId,
          playerRef: line.playerRef,
          evidenceText: line.evidenceText,
          lineStart: line.lineStart,
          lineEnd: line.lineEnd,
          confidence: line.confidence,
          points: line.points,
          assists: line.assists,
          rebounds: line.rebounds,
          steals: line.steals,
          blocks: line.blocks,
          turnovers: line.turnovers,
          fouls: line.fouls,
          runId,
          status: line.teamMemberId ? 'PENDING_REVIEW' : 'REJECTED',
          reviewNote: line.teamMemberId ? null : 'Could not resolve player from stat line'
        }))
      })

      for (const parsed of parsedStats) {
        const stat = await tx.sessionPlayerStat.upsert({
          where: {
            sessionId_teamMemberId: {
              sessionId: observation.sessionId,
              teamMemberId: parsed.teamMemberId
            }
          },
          create: {
            sessionId: observation.sessionId,
            teamMemberId: parsed.teamMemberId
          },
          update: {}
        })

        const previous = previousByStatId.get(stat.id) ?? {
          points: 0,
          assists: 0,
          rebounds: 0,
          steals: 0,
          blocks: 0,
          turnovers: 0,
          fouls: 0
        }

        const updateData: Record<string, number> = {}
        for (const metric of METRICS) {
          const computedField = computedFieldName(metric)
          const lockedField = lockedFieldName(metric)
          const overrideField = overrideFieldName(metric)
          const previousValue = previous[metric] ?? 0
          const nextValue = parsed[metric] ?? 0
          const currentComputed = clampMetric(Number((stat as any)[computedField] ?? 0))
          const nextComputed = Math.max(0, currentComputed - previousValue + nextValue)
          updateData[computedField] = nextComputed

          const isLocked = Boolean((stat as Record<string, unknown>)[lockedField])
          const manualOverride = (stat as Record<string, unknown>)[overrideField] as number | null | undefined
          const currentFinal = Number((stat as any)[metric] ?? 0)
          updateData[metric] = resolveFinalMetric({
            computed: nextComputed,
            isLocked,
            manualOverride,
            currentFinal
          })
        }

        await tx.sessionPlayerStat.update({
          where: { id: stat.id },
          data: updateData
        })

        await tx.observationStatAttribution.createMany({
          data: METRICS.map(metric => ({
            observationId,
            sessionPlayerStatId: stat.id,
            metric,
            delta: parsed[metric]
          }))
        })
      }

      await tx.observation.update({
        where: { id: observationId },
        data: {
          statStatus: 'COMPLETE',
          statError: null,
          statProcessedAt: new Date(),
          statExtraction: {
            stats: parsedStats,
            lines: extracted.lines,
            rosterCount: roster.length,
            runId,
            unresolvedCount
          }
        }
      })
    })
    console.info('[observation-stats] derived', {
      observationId,
      runId,
      lineCount: extracted.lines.length,
      unresolvedCount
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Stat extraction failed'
    await prisma.observation.update({
      where: { id: observationId },
      data: {
        statStatus: 'FAILED',
        statError: message
      }
    })
    throw error
  }
}

export async function recomputeObservationTotalsFromLines(observationId: string) {
  const observation = await prisma.observation.findUnique({
    where: { id: observationId },
    select: { id: true, sessionId: true }
  })
  if (!observation) return

  await prisma.$transaction(async tx => {
    const previous = await tx.observationStatAttribution.findMany({ where: { observationId } })
    const prevByStatId = new Map<string, Record<StatMetric, number>>()
    for (const item of previous) {
      const next = prevByStatId.get(item.sessionPlayerStatId) ?? {
        points: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0
      }
      next[item.metric as StatMetric] += item.delta
      prevByStatId.set(item.sessionPlayerStatId, next)
    }

    await tx.observationStatAttribution.deleteMany({ where: { observationId } })

    const lines = await tx.derivedStatLine.findMany({
      where: {
        observationId,
        status: { in: ['PENDING_REVIEW', 'APPROVED', 'EDITED'] },
        teamMemberId: { not: null }
      }
    })
    const byMember = new Map<string, ParsedStatLine>()
    for (const line of lines) {
      const memberId = line.teamMemberId!
      const next = byMember.get(memberId) ?? {
        teamMemberId: memberId,
        points: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0
      }
      next.points += line.points
      next.assists += line.assists
      next.rebounds += line.rebounds
      next.steals += line.steals
      next.blocks += line.blocks
      next.turnovers += line.turnovers
      next.fouls += line.fouls
      byMember.set(memberId, next)
    }

    for (const parsed of byMember.values()) {
      const stat = await tx.sessionPlayerStat.upsert({
        where: {
          sessionId_teamMemberId: {
            sessionId: observation.sessionId,
            teamMemberId: parsed.teamMemberId
          }
        },
        create: {
          sessionId: observation.sessionId,
          teamMemberId: parsed.teamMemberId
        },
        update: {}
      })
      const prev = prevByStatId.get(stat.id) ?? {
        points: 0,
        assists: 0,
        rebounds: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0
      }
      const updateData: Record<string, number> = {}
      for (const metric of METRICS) {
        const computedField = computedFieldName(metric)
        const lockedField = lockedFieldName(metric)
        const overrideField = overrideFieldName(metric)
        const currentComputed = clampMetric(Number((stat as any)[computedField] ?? 0))
        const nextComputed = Math.max(0, currentComputed - (prev[metric] ?? 0) + (parsed[metric] ?? 0))
        updateData[computedField] = nextComputed
        updateData[metric] = resolveFinalMetric({
          computed: nextComputed,
          isLocked: Boolean((stat as Record<string, unknown>)[lockedField]),
          manualOverride: (stat as Record<string, unknown>)[overrideField] as number | null | undefined,
          currentFinal: Number((stat as any)[metric] ?? 0)
        })
      }
      await tx.sessionPlayerStat.update({ where: { id: stat.id }, data: updateData })
      await tx.observationStatAttribution.createMany({
        data: METRICS.map(metric => ({
          observationId,
          sessionPlayerStatId: stat.id,
          metric,
          delta: parsed[metric]
        }))
      })
    }
  })
}

export type { StatMetric }
