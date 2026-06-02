import OpenAI from 'openai'
import { z } from 'zod'

const drillSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  execution: z.string().max(8000).optional().nullable(),
  durationMinutes: z.number().int().min(0).max(600).optional().nullable(),
  focusTags: z.array(z.string().max(100)).max(25).optional()
})

const outputSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  goals: z.array(z.string().max(500)).max(25).optional().default([]),
  drills: z.array(drillSchema).min(1).max(30)
})

export interface GeneratePracticePlanInput {
  teamName: string | null
  rosterLines: string[]
  userPromptAddition?: string | null
}

export interface GeneratedPlanDrill {
  title: string
  description: string | null
  execution: string | null
  durationMinutes: number | null
  focusTags: string[]
}

export interface GeneratePracticePlanResult {
  title: string | null
  goals: string[]
  drills: GeneratedPlanDrill[]
}

function buildSystemPrompt(): string {
  return [
    'You are an experienced basketball coach assistant.',
    'Produce a structured team practice plan as JSON only.',
    'Keys: "title" (optional string), "goals" (array of short strings, session-level outcomes), "drills" (required array).',
    'Each drill object: "title" (required, short name), "description" (optional, what the drill is for),',
    '"execution" (optional, how to run it: setup, steps, reps, cues),',
    '"durationMinutes" (optional number), "focusTags" (optional string array, coaching themes).',
    'Order drills chronologically from start to end of practice.',
    'Be specific and actionable.',
    'Do not include markdown or code fences.',
    'Return valid JSON only.'
  ].join(' ')
}

function buildUserPrompt(input: GeneratePracticePlanInput): string {
  const lines = [
    `Team: ${input.teamName?.trim() || 'Unnamed team'}`,
    'Roster (number / name):',
    input.rosterLines.length > 0 ? input.rosterLines.join('\n') : 'No roster provided.',
    '',
    'Coach focus / constraints (may be empty):',
    input.userPromptAddition?.trim() || '(none — use a balanced fundamentals + team needs practice.)'
  ]
  return lines.join('\n')
}

export async function generatePracticePlanWithLlm(
  input: GeneratePracticePlanInput
): Promise<GeneratePracticePlanResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const model = process.env.AI_PRACTICE_PLAN_MODEL || process.env.AI_TAGGING_MODEL || 'gpt-4o-mini'

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) }
    ],
    response_format: { type: 'json_object' }
  })

  const content = completion.choices[0]?.message?.content
  if (!content) {
    throw new Error('Empty LLM response for practice plan')
  }

  const parsed = outputSchema.parse(JSON.parse(content))
  const title = parsed.title?.trim() || null
  const goals = (parsed.goals ?? []).map(g => g.trim()).filter(Boolean)
  const drills = parsed.drills.map(d => ({
    title: d.title.trim(),
    description: d.description?.trim() || null,
    execution: d.execution?.trim() || null,
    durationMinutes: d.durationMinutes ?? null,
    focusTags: (d.focusTags ?? []).map(t => t.trim()).filter(Boolean)
  }))

  return { title, goals, drills }
}
