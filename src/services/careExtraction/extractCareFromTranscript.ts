import OpenAI from 'openai'
import { buildCareExtractionPrompt } from './prompt.js'
import {
  careExtractionOutputSchema,
  type CareExtractionOutput,
  type TodayActionContext,
  type TodayTaskContext
} from './types.js'

export async function extractCareFromTranscript(args: {
  dogName: string
  dogId: string
  userId: string
  userName: string
  date: string
  actions: TodayActionContext[]
  tasks: TodayTaskContext[]
  transcript: string
}): Promise<CareExtractionOutput> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const model = process.env.AI_CARE_MODEL || process.env.AI_TAGGING_MODEL || 'gpt-4o-mini'
  const openai = new OpenAI({ apiKey })
  const { system, user } = buildCareExtractionPrompt(args)

  const response = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  })

  const raw = response.choices[0]?.message?.content?.trim()
  if (!raw) {
    throw new Error('Empty LLM response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('LLM returned invalid JSON')
  }

  return careExtractionOutputSchema.parse(parsed)
}
