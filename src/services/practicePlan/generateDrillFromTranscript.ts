import OpenAI from 'openai'
import { z } from 'zod'

/**
 * LLMs often return description/execution as objects (e.g. { steps: [...] }) despite instructions.
 * Coerce to a single coach-facing string capped at maxLen.
 */
export function normalizeLlmTextField(val: unknown, maxLen: number): string | null {
  if (val == null) return null

  if (typeof val === 'string') {
    const t = val.trim()
    if (!t) return null
    return t.length > maxLen ? t.slice(0, maxLen) : t
  }

  if (typeof val === 'number' && Number.isFinite(val)) {
    const t = String(val).trim()
    return t.length > maxLen ? t.slice(0, maxLen) : t
  }

  if (Array.isArray(val)) {
    const lines = val.map(item => {
      if (item == null) return ''
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim()
      if (typeof item === 'object') {
        const o = item as Record<string, unknown>
        if (typeof o.text === 'string') return o.text.trim()
        if (typeof o.step === 'string') return o.step.trim()
        if (typeof o.cue === 'string') return o.cue.trim()
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      }
      return String(item)
    })
    const s = lines.filter(Boolean).join('\n').trim()
    if (!s) return null
    return s.length > maxLen ? s.slice(0, maxLen) : s
  }

  if (typeof val === 'object') {
    const o = val as Record<string, unknown>
    if (Array.isArray(o.steps)) {
      return normalizeLlmTextField(o.steps, maxLen)
    }
    if (typeof o.text === 'string') {
      return normalizeLlmTextField(o.text, maxLen)
    }
    if (typeof o.execution === 'string' || typeof o.execution === 'object') {
      return normalizeLlmTextField(o.execution, maxLen)
    }
    try {
      const s = JSON.stringify(o, null, 2).trim()
      if (!s || s === '{}') return null
      return s.length > maxLen ? s.slice(0, maxLen) : s
    } catch {
      const s = String(val).trim()
      return s ? (s.length > maxLen ? s.slice(0, maxLen) : s) : null
    }
  }

  const s = String(val).trim()
  return s ? (s.length > maxLen ? s.slice(0, maxLen) : s) : null
}

function normalizeFocusTags(val: unknown): string[] {
  if (val == null) return []
  if (!Array.isArray(val)) return []
  return val
    .map(x => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : ''))
    .filter(Boolean)
    .slice(0, 25)
}

const llmDrillRawSchema = z.object({
  title: z.union([z.string(), z.number()]).transform(v => String(v).trim()),
  description: z.unknown().optional().nullable(),
  execution: z.unknown().optional().nullable(),
  durationMinutes: z.number().int().min(0).max(600).optional().nullable(),
  focusTags: z.unknown().optional(),
  playerFocusMemberIds: z.array(z.string()).max(50).nullish()
})

export interface GenerateDrillFromTranscriptInput {
  transcript: string
  sessionType: string
  roster: Array<{ teamMemberId: string; number: string; name: string }>
}

export interface GeneratedDrillFields {
  title: string
  description: string | null
  execution: string | null
  durationMinutes: number | null
  focusTags: string[]
  playerFocusMemberIds: string[]
}

function buildSystemPrompt(): string {
  return [
    'You are a basketball coach assistant.',
    'The user spoke a rough description of one practice drill. Convert it into structured JSON only.',
    'Fields: "title" (short drill name, required), "description" (what the drill is for, coaching intent, 1-3 sentences),',
    '"execution" (REQUIRED: a single plain string describing how to run the drill — setup, steps, reps, cues. Do not use a nested object or array for execution; use one string, using newline characters between steps if needed),',
    '"durationMinutes" (optional integer), "focusTags" (optional short theme strings),',
    '"playerFocusMemberIds" (optional array of UUIDs) — ONLY use IDs from the roster list provided; if unsure, omit or empty.',
    'Infer missing details reasonably from coaching context; do not invent player IDs.',
    'Return valid JSON only, no markdown.'
  ].join(' ')
}

function buildUserPrompt(input: GenerateDrillFromTranscriptInput): string {
  const rosterBlock =
    input.roster.length > 0
      ? input.roster
          .map(r => `- id=${r.teamMemberId} #${r.number || '-'} ${r.name || ''}`.trim())
          .join('\n')
      : '(no roster)'

  return [
    `Session type: ${input.sessionType}`,
    '',
    'Roster (use these UUIDs only for playerFocusMemberIds):',
    rosterBlock,
    '',
    'Coach transcript (may be messy):',
    input.transcript.trim()
  ].join('\n')
}

export async function generateDrillFromTranscriptWithLlm(
  input: GenerateDrillFromTranscriptInput
): Promise<GeneratedDrillFields> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const model = process.env.AI_PRACTICE_PLAN_MODEL || process.env.AI_TAGGING_MODEL || 'gpt-4o-mini'

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.35,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) }
    ],
    response_format: { type: 'json_object' }
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('Empty LLM response for drill from transcript')
  }

  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    throw new Error('LLM returned invalid JSON for drill')
  }

  const raw = llmDrillRawSchema.parse(json)
  if (!raw.title || raw.title.length > 200) {
    throw new Error('LLM returned an invalid drill title')
  }

  const validIds = new Set(input.roster.map(r => r.teamMemberId))
  const playerFocusMemberIds = (raw.playerFocusMemberIds ?? []).filter(id => validIds.has(id))

  return {
    title: raw.title.slice(0, 200),
    description: normalizeLlmTextField(raw.description, 4000),
    execution: normalizeLlmTextField(raw.execution, 8000),
    durationMinutes: raw.durationMinutes ?? null,
    focusTags: normalizeFocusTags(raw.focusTags),
    playerFocusMemberIds
  }
}
