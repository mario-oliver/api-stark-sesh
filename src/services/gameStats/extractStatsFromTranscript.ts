import OpenAI from 'openai'
import { z } from 'zod'

const rawStatLineSchema = z.object({
  teamMemberId: z.string().min(1).optional(),
  playerRef: z.string().min(1).optional(),
  evidenceText: z.string().min(1).optional(),
  lineStart: z.number().int().min(0).optional(),
  lineEnd: z.number().int().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
  points: z.number().int().min(0).optional().default(0),
  assists: z.number().int().min(0).optional().default(0),
  rebounds: z.number().int().min(0).optional().default(0),
  steals: z.number().int().min(0).optional().default(0),
  blocks: z.number().int().min(0).optional().default(0),
  turnovers: z.number().int().min(0).optional().default(0),
  fouls: z.number().int().min(0).optional().default(0)
})

const outputSchema = z.object({
  statLines: z
    .union([
      z.array(rawStatLineSchema),
      rawStatLineSchema,
      z.record(z.string(), rawStatLineSchema)
    ])
    .default([])
})

type ExtractedStatLine = {
  teamMemberId: string | null
  playerRef: string | null
  evidenceText: string | null
  lineStart: number | null
  lineEnd: number | null
  confidence: number | null
  points: number
  assists: number
  rebounds: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
}

type AggregatedPlayerStats = {
  teamMemberId: string
  points: number
  assists: number
  rebounds: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
}

export type ExtractStatsResult = {
  lines: ExtractedStatLine[]
  aggregated: AggregatedPlayerStats[]
}

function hasAnyStatValue(line: Pick<ExtractedStatLine, 'points' | 'assists' | 'rebounds' | 'steals' | 'blocks' | 'turnovers' | 'fouls'>) {
  return (
    line.points > 0 ||
    line.assists > 0 ||
    line.rebounds > 0 ||
    line.steals > 0 ||
    line.blocks > 0 ||
    line.turnovers > 0 ||
    line.fouls > 0
  )
}

function normalizeLineNumber(value: number | null | undefined) {
  if (value == null) return null
  return value <= 0 ? null : value
}

export function aggregateExtractedStatLines(args: {
  roster: Array<{ teamMemberId: string; number: string; name: string; aliases: string[] }>
  modelLines: Array<z.infer<typeof rawStatLineSchema>>
}): ExtractStatsResult {
  const lines: ExtractedStatLine[] = []
  const byPlayer = new Map<string, AggregatedPlayerStats>()
  for (const stat of args.modelLines) {
    const teamMemberId = normalizePlayerRef(args.roster, stat)
    const line: ExtractedStatLine = {
      teamMemberId,
      playerRef: stat.playerRef ?? null,
      evidenceText: stat.evidenceText ?? null,
      lineStart: stat.lineStart ?? null,
      lineEnd: stat.lineEnd ?? null,
      confidence: stat.confidence ?? null,
      points: stat.points ?? 0,
      assists: stat.assists ?? 0,
      rebounds: stat.rebounds ?? 0,
      steals: stat.steals ?? 0,
      blocks: stat.blocks ?? 0,
      turnovers: stat.turnovers ?? 0,
      fouls: stat.fouls ?? 0
    }
    line.lineStart = normalizeLineNumber(line.lineStart)
    line.lineEnd = normalizeLineNumber(line.lineEnd)
    if (!hasAnyStatValue(line)) continue
    lines.push(line)
    if (!teamMemberId) continue
    const existing = byPlayer.get(teamMemberId) ?? {
      teamMemberId,
      points: 0,
      assists: 0,
      rebounds: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0
    }
    existing.points += line.points
    existing.assists += line.assists
    existing.rebounds += line.rebounds
    existing.steals += line.steals
    existing.blocks += line.blocks
    existing.turnovers += line.turnovers
    existing.fouls += line.fouls
    byPlayer.set(teamMemberId, existing)
  }
  return { lines, aggregated: Array.from(byPlayer.values()) }
}

function normalizeLines(
  lines: z.infer<typeof outputSchema>['statLines']
): Array<z.infer<typeof rawStatLineSchema>> {
  if (Array.isArray(lines)) return lines
  if (
    lines &&
    typeof lines === 'object' &&
    !('points' in lines || 'playerRef' in lines || 'teamMemberId' in lines)
  ) {
    return Object.values(lines)
  }
  return [lines as z.infer<typeof rawStatLineSchema>]
}

function normalizePlayerRef(
  roster: Array<{ teamMemberId: string; number: string; name: string; aliases: string[] }>,
  stat: z.infer<typeof rawStatLineSchema>
) {
  if (stat.teamMemberId) {
    const byId = roster.find(r => r.teamMemberId === stat.teamMemberId)
    if (byId) return byId.teamMemberId
  }

  const raw = stat.playerRef?.trim()
  if (!raw) return null

  const byNumber = roster.find(r => r.number.trim() !== '' && r.number.trim() === raw)
  if (byNumber) return byNumber.teamMemberId

  const lower = raw.toLowerCase()
  const byName = roster.find(r => r.name.trim().toLowerCase() === lower)
  if (byName) return byName.teamMemberId

  const byAlias = roster.find(r => r.aliases.some(a => a.trim().toLowerCase() === lower))
  if (byAlias) return byAlias.teamMemberId

  const containsMatches = roster.filter(r => {
    const number = r.number.trim()
    const name = r.name.trim().toLowerCase()
    const aliasHit = r.aliases.some(a => {
      const x = a.trim().toLowerCase()
      return x !== '' && lower.includes(x)
    })
    return (number && lower.includes(number)) || (name && lower.includes(name)) || aliasHit
  })
  if (containsMatches.length === 1) return containsMatches[0]?.teamMemberId ?? null

  return null
}

export async function extractGameStatsFromTranscript(args: {
  transcript: string
  roster: Array<{ teamMemberId: string; number: string; name: string; aliases: string[] }>
}): Promise<ExtractStatsResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const model = process.env.AI_STATS_MODEL || 'gpt-4o-mini'

  const rosterText = args.roster
    .map(
      p =>
        `- teamMemberId=${p.teamMemberId}; number=${p.number.trim() || '-'}; name=${p.name.trim() || '-'}`
        + `; aliases=${p.aliases.join('|') || '-'}`
    )
    .join('\n')

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Extract per-player basketball stat lines from transcript text. Return JSON with key "statLines". ' +
          'Each line should represent one mention/event with optional evidenceText and lineStart/lineEnd. ' +
          'Each stat line maps to exactly one player in roster by teamMemberId or playerRef. ' +
          'playerRef may be a jersey number, canonical name, or alias/nickname from roster aliases. ' +
          'Include integer fields: points, assists, rebounds, steals, blocks, turnovers, fouls. Use 0 when not present.'
      },
      {
        role: 'user',
        content:
          `Roster:\n${rosterText}\n\n` +
          'Transcript:\n' +
          args.transcript +
          '\n\nReturn JSON only.'
      }
    ]
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    return { lines: [], aggregated: [] }
  }

  const parsed = outputSchema.parse(JSON.parse(content))
  const aggregated = aggregateExtractedStatLines({
    roster: args.roster,
    modelLines: normalizeLines(parsed.statLines)
  })
  const unresolvedCount = aggregated.lines.filter(line => !line.teamMemberId).length
  const aliasHits = aggregated.lines.filter(line => {
    if (!line.teamMemberId || !line.playerRef) return false
    const player = args.roster.find(r => r.teamMemberId === line.teamMemberId)
    const lower = line.playerRef.toLowerCase()
    return (player?.aliases ?? []).some(a => a.toLowerCase() === lower)
  }).length
  console.info(
    JSON.stringify({
      event: 'stats_alias_resolution_metrics',
      unresolvedCount,
      aliasHits,
      totalLines: aggregated.lines.length
    })
  )
  return aggregated
}
