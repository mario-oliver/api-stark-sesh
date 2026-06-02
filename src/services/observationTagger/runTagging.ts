import OpenAI from 'openai'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { buildObservationTaggingPrompt } from './prompt.js'
import type { TaggingModelOutput } from './types.js'

const playerObjectSchema = z.object({
  teamMemberId: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().max(300).optional()
})

// Some model variants occasionally return players as strings (e.g. player numbers or names).
// Accept both strings + objects and normalize after parsing.
const outputSchema = z.object({
  scope: z.enum(['TEAM_WIDE', 'PLAYER_SPECIFIC', 'MIXED', 'UNKNOWN']),
  players: z
    .array(z.union([z.string(), playerObjectSchema]))
    .default([])
})

function normalizePlayerMatch(args: {
  roster: Array<{ teamMemberId: string; number: string; name: string; aliases: string[] }>
  item: string | z.infer<typeof playerObjectSchema>
}): { teamMemberId: string; confidence?: number; reason?: string } | null {
  if (typeof args.item === 'string') {
    const raw = args.item.trim()
    if (!raw) return null

    // 1) Exact teamMemberId
    const byId = args.roster.find(r => r.teamMemberId === raw)
    if (byId) return { teamMemberId: byId.teamMemberId }

    // 2) Exact number match
    const byNumber = args.roster.find(r => r.number.trim() === raw)
    if (byNumber) return { teamMemberId: byNumber.teamMemberId }

    // 3) Case-insensitive name match
    const rawLower = raw.toLowerCase()
    const byName = args.roster.find(r => r.name.trim().toLowerCase() === rawLower)
    if (byName) return { teamMemberId: byName.teamMemberId }

    const byAlias = args.roster.find(r => r.aliases.some(a => a.trim().toLowerCase() === rawLower))
    if (byAlias) return { teamMemberId: byAlias.teamMemberId }

    // 4) Contains match (e.g. model returns "player 12" or partial)
    const containsMatches = args.roster.filter(r => {
      const n = r.number.trim()
      const nm = r.name.trim().toLowerCase()
      const aliasHit = r.aliases.some(a => {
        const x = a.trim().toLowerCase()
        return x !== '' && rawLower.includes(x)
      })
      return (n && raw.includes(n)) || (nm && rawLower.includes(nm)) || aliasHit
    })
    if (containsMatches.length === 1) {
      return { teamMemberId: containsMatches[0]!.teamMemberId }
    }

    return null
  }

  // Object form
  return {
    teamMemberId: args.item.teamMemberId,
    confidence: args.item.confidence,
    reason: args.item.reason
  }
}

function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : 'Tagging failed'
  return msg.slice(0, 500)
}

const SESSION_TYPE_LABELS: Record<string, string> = {
  TEAM_PRACTICE: 'Team practice',
  SKILL_SESSION: 'Skill / small-group session',
  GAME: 'Game',
  TRYOUT: 'Tryout',
  OTHER: 'Other'
}

async function callTaggingModel(args: {
  transcript: string
  sessionType: string
  roster: Array<{ teamMemberId: string; number: string; name: string; aliases: string[] }>
}): Promise<TaggingModelOutput> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const { system, user } = buildObservationTaggingPrompt({
    transcript: args.transcript,
    sessionTypeLabel: SESSION_TYPE_LABELS[args.sessionType] ?? args.sessionType,
    players: args.roster
  })

  const openai = new OpenAI({ apiKey })
  const model = process.env.AI_TAGGING_MODEL || 'gpt-4o-mini'
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    response_format: { type: 'json_object' }
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    return { scope: 'UNKNOWN', players: [] }
  }

  const parsed = outputSchema.parse(JSON.parse(content))

  const roster = args.roster
  const normalizedPlayers: Array<{ teamMemberId: string; confidence?: number; reason?: string }> = []
  for (const p of parsed.players) {
    const normalized = normalizePlayerMatch({ roster, item: p as any })
    if (!normalized) continue
    normalizedPlayers.push(normalized)
  }

  // If the model returns duplicates, keep the highest confidence (if present).
  const bestById = new Map<string, { teamMemberId: string; confidence?: number; reason?: string }>()
  for (const p of normalizedPlayers) {
    const existing = bestById.get(p.teamMemberId)
    if (!existing) {
      bestById.set(p.teamMemberId, p)
      continue
    }
    const existingConf = existing.confidence ?? -1
    const nextConf = p.confidence ?? -1
    if (nextConf > existingConf) {
      bestById.set(p.teamMemberId, p)
    }
  }

  return {
    scope: parsed.scope,
    players: Array.from(bestById.values())
  }
}

export async function runObservationTagging(observationId: string) {
  const observation = await prisma.observation.findUnique({
    where: { id: observationId },
    include: {
      session: {
        include: {
          team: {
            include: { members: { include: { aliases: true } } }
          }
        }
      }
    }
  })

  if (!observation) {
    return
  }

  await prisma.observation.update({
    where: { id: observationId },
    data: {
      taggingStatus: 'PROCESSING',
      taggingError: null
    }
  })

  try {
    // Only include active players for future tagging. Inactive players keep their past tags/observations.
    const roster = observation.session.team.members
      .filter(m => m.isActive)
      .map(m => ({
        teamMemberId: m.id,
        number: m.number,
        name: m.name,
        aliases: m.aliases.map(a => a.alias)
      }))

    const modelOut = await callTaggingModel({
      transcript: observation.rawText,
      sessionType: observation.session.type,
      roster
    })
    const unresolvedNameCount =
      modelOut.players.length === 0 && observation.rawText.trim() !== '' ? 1 : 0
    if (unresolvedNameCount > 0) {
      console.info(
        JSON.stringify({
          event: 'observation_tagger_unresolved_name',
          observationId,
          unresolvedNameCount
        })
      )
    }

    const validIds = new Set(roster.map((r) => r.teamMemberId))
    const uniqueById = new Map<
      string,
      { teamMemberId: string; confidence?: number; reason?: string }
    >()

    for (const p of modelOut.players) {
      if (!validIds.has(p.teamMemberId)) continue
      uniqueById.set(p.teamMemberId, p)
    }

    await prisma.$transaction([
      prisma.observationPlayerTag.deleteMany({
        where: { observationId }
      }),
      prisma.observation.update({
        where: { id: observationId },
        data: {
          scope: modelOut.scope,
          taggingStatus: 'COMPLETE',
          taggingError: null,
          taggedAt: new Date()
        }
      }),
      ...(uniqueById.size > 0
        ? [
            prisma.observationPlayerTag.createMany({
              data: Array.from(uniqueById.values()).map((p) => ({
                observationId,
                teamMemberId: p.teamMemberId,
                confidence: p.confidence,
                reason: p.reason
              }))
            })
          ]
        : [])
    ])
  } catch (error) {
    await prisma.observation.update({
      where: { id: observationId },
      data: {
        taggingStatus: 'FAILED',
        taggingError: safeErrorMessage(error)
      }
    })
  }
}

