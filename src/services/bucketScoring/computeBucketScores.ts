import { createHash } from 'node:crypto'
import OpenAI from 'openai'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { formatCalendarDate } from '../dailyCare/dateUtils.js'
import type { BucketScore } from '../dailyCare/serializeDailyTask.js'

const llmScoreSchema = z.object({
  score: z.number().min(0).max(100),
  label: z.string(),
  summary: z.string(),
  reasons: z.array(z.string()),
  signals: z.array(z.string()).optional()
})

function computeActivityScore(
  tasks: Array<{ status: string; nameSnapshot: string; source: string }>
): BucketScore {
  const planned = tasks.filter(t => t.source === 'PLAN')
  const completed = tasks.filter(t => t.status === 'COMPLETED')
  const skipped = tasks.filter(t => t.status === 'SKIPPED')
  const adHoc = tasks.filter(
    t => t.source === 'LLM_EXTRACTED' || t.source === 'PLAN_VARIATION' || t.source === 'AD_HOC'
  )

  const plannedTotal = planned.length || tasks.length
  const plannedCompleted = planned.filter(t => t.status === 'COMPLETED').length
  const ratio = plannedTotal > 0 ? plannedCompleted / plannedTotal : completed.length > 0 ? 1 : 0
  const score = Math.round(ratio * 100)

  const reasons: string[] = []
  if (plannedCompleted > 0) {
    reasons.push(`Completed ${plannedCompleted} of ${plannedTotal} planned items`)
  }
  if (adHoc.length > 0) {
    reasons.push(`Added ${adHoc.length} item(s) from voice or manual entry`)
  }
  if (skipped.length > 0) {
    reasons.push(`${skipped.length} item(s) skipped`)
  }

  let label = 'Light workload'
  if (score >= 80) label = 'Good workload'
  else if (score >= 50) label = 'Moderate workload'
  else if (completed.length === 0) label = 'No activity logged'

  return {
    score,
    label,
    summary: reasons.join('. ') || 'No activity tasks logged today.',
    reasons,
    computedAt: new Date().toISOString()
  }
}

function computeMobilityScoreFallback(
  observations: Array<{ type: string; severity: string | null; note: string }>,
  tasks: Array<{ status: string }>
): BucketScore {
  const severityWeight: Record<string, number> = {
    MILD: 10,
    MODERATE: 25,
    SEVERE: 40,
    UNKNOWN: 5
  }

  let penalty = 0
  for (const obs of observations) {
    penalty += severityWeight[obs.severity ?? 'UNKNOWN'] ?? 5
  }

  const completedMobility = tasks.filter(t => t.status === 'COMPLETED').length
  const base = 85 - Math.min(penalty, 60)
  const score = Math.max(20, Math.min(100, base + completedMobility * 2))

  const reasons = observations.map(o => `${o.type.replace(/_/g, ' ').toLowerCase()}: ${o.note}`)
  if (completedMobility > 0) {
    reasons.unshift(`${completedMobility} mobility check-in(s) completed`)
  }

  let label = 'Moving well'
  if (score < 50) label = 'Limited mobility'
  else if (score < 70) label = 'Mildly limited'

  return {
    score,
    label,
    summary:
      observations.length > 0
        ? `${observations.length} mobility observation(s) noted today.`
        : 'No mobility concerns reported.',
    reasons,
    signals: observations.map(o => o.type.toLowerCase()),
    computedAt: new Date().toISOString()
  }
}

async function computeLlmScores(args: {
  dogName: string
  date: string
  mobilityContext: string
  recoveryContext: string
}): Promise<{ mobility?: BucketScore; recovery?: BucketScore }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return {}

  const model = process.env.AI_CARE_MODEL || 'gpt-4o-mini'
  const openai = new OpenAI({ apiKey })

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You produce qualitative daily care scores for an aging dog PT app. Return JSON with keys mobility and recovery. Each value has score (0-100), label, summary, reasons (array), signals (array). Do not diagnose or prescribe. Base scores on caregiver-reported observations only.'
      },
      {
        role: 'user',
        content: `Dog: ${args.dogName}\nDate: ${args.date}\n\nMobility context:\n${args.mobilityContext}\n\nRecovery context:\n${args.recoveryContext}`
      }
    ]
  })

  const raw = response.choices[0]?.message?.content?.trim()
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw) as {
      mobility?: unknown
      recovery?: unknown
    }
    const now = new Date().toISOString()
    const result: { mobility?: BucketScore; recovery?: BucketScore } = {}

    if (parsed.mobility) {
      const m = llmScoreSchema.parse(parsed.mobility)
      result.mobility = { ...m, computedAt: now }
    }
    if (parsed.recovery) {
      const r = llmScoreSchema.parse(parsed.recovery)
      result.recovery = { ...r, computedAt: now }
    }
    return result
  } catch {
    return {}
  }
}

export function buildScoreInputVersion(logId: string, updatedAt: Date, taskCount: number, obsCount: number) {
  return createHash('sha256')
    .update(`${logId}:${updatedAt.toISOString()}:${taskCount}:${obsCount}`)
    .digest('hex')
    .slice(0, 16)
}

export async function computeBucketScores(dailyCareLogId: string) {
  const log = await prisma.dailyCareLog.findUniqueOrThrow({
    where: { id: dailyCareLogId },
    include: {
      dog: true,
      dailyTasks: true,
      healthObservations: true,
      voiceNotes: { where: { processingStatus: 'PROCESSED' }, orderBy: { createdAt: 'desc' } }
    }
  })

  const activityTasks = log.dailyTasks.filter(t => t.bucket === 'ACTIVITY')
  const mobilityTasks = log.dailyTasks.filter(t => t.bucket === 'MOBILITY')
  const recoveryTasks = log.dailyTasks.filter(t => t.bucket === 'RECOVERY')

  const mobilityObs = log.healthObservations.filter(
    o => o.bucket === 'MOBILITY' || o.bucket === null
  )
  const recoveryObs = log.healthObservations.filter(o => o.bucket === 'RECOVERY')

  const activity = computeActivityScore(activityTasks)

  const mobilityContext = [
    ...mobilityObs.map(o => `- ${o.type}: ${o.note} (${o.severity ?? 'unknown'})`),
    ...mobilityTasks.map(t => `- Task ${t.nameSnapshot}: ${t.status}${t.notes ? ` — ${t.notes}` : ''}`),
    ...log.voiceNotes.map(v => `- Voice: ${v.transcript.slice(0, 300)}`)
  ].join('\n')

  const recoveryContext = [
    ...recoveryObs.map(o => `- ${o.type}: ${o.note}`),
    ...recoveryTasks.map(t => `- Check-in ${t.nameSnapshot}: ${t.status}`),
    log.summary ? `- Summary: ${log.summary}` : '',
    ...log.voiceNotes.map(v => `- Voice: ${v.transcript.slice(0, 300)}`)
  ]
    .filter(Boolean)
    .join('\n')

  const llmScores = await computeLlmScores({
    dogName: log.dog.name,
    date: formatCalendarDate(log.date),
    mobilityContext: mobilityContext || 'No mobility data.',
    recoveryContext: recoveryContext || 'No recovery data.'
  })

  const mobility =
    llmScores.mobility ??
    computeMobilityScoreFallback(mobilityObs, mobilityTasks)

  const recovery =
    llmScores.recovery ??
    ({
      score: 70,
      label: 'Insufficient data',
      summary: 'Add a voice note or recovery check-ins for a recovery score.',
      reasons: ['No detailed recovery narrative available'],
      signals: [],
      computedAt: new Date().toISOString()
    } satisfies BucketScore)

  const bucketScores = { activity, mobility, recovery }
  const scoreInputVersion = buildScoreInputVersion(
    log.id,
    log.updatedAt,
    log.dailyTasks.length,
    log.healthObservations.length
  )

  await prisma.dailyCareLog.update({
    where: { id: dailyCareLogId },
    data: {
      bucketScores: bucketScores as never,
      scoreComputedAt: new Date(),
      scoreInputVersion
    }
  })

  return bucketScores
}
