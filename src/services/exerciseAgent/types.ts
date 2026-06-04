import { z } from 'zod'

const careActionCategorySchema = z.enum([
  'STRETCH',
  'STRENGTH',
  'MOBILITY',
  'WALK',
  'GENERAL_CARE',
  'OBSERVATION_CHECKPOINT'
])

const careActionFrequencySchema = z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED'])

const careActionTimeOfDaySchema = z.enum(['MORNING', 'EVENING', 'ANYTIME'])

export const proposedMovementSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  instructions: z.string().trim().max(2000).nullable(),
  sortOrder: z.number().int().min(0).nullable()
})

export const proposedExerciseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  category: careActionCategorySchema,
  frequency: careActionFrequencySchema,
  timeOfDay: careActionTimeOfDaySchema.nullable(),
  targetReps: z.number().int().min(0).max(999).nullable(),
  targetDurationSeconds: z.number().int().min(0).max(86400).nullable(),
  instructions: z.string().trim().max(2000).nullable(),
  movements: z.array(proposedMovementSchema).min(1).max(8),
  rationale: z.string().trim().min(1).max(4000),
  safetyNotes: z.string().trim().min(1).max(4000),
  researchSummary: z.string().trim().min(1).max(4000)
})

export type ProposedExercise = z.infer<typeof proposedExerciseSchema>

/** Coerce omitted LLM fields to null before strict parse. */
export function normalizeProposedExerciseInput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const d = raw as Record<string, unknown>
  const movements = Array.isArray(d.movements)
    ? d.movements.map(m => {
        if (!m || typeof m !== 'object') return m
        const step = m as Record<string, unknown>
        return {
          description: step.description ?? null,
          instructions: step.instructions ?? null,
          sortOrder: step.sortOrder ?? null,
          ...step
        }
      })
    : d.movements

  return {
    description: d.description ?? null,
    timeOfDay: d.timeOfDay ?? null,
    targetReps: d.targetReps ?? null,
    targetDurationSeconds: d.targetDurationSeconds ?? null,
    instructions: d.instructions ?? null,
    movements,
    ...d
  }
}

export const clarifyOutputSchema = z.object({
  needsClarification: z.boolean(),
  questions: z.array(z.string().trim().min(1).max(500)).max(3),
  /** Empty when needsClarification is true; 1–3 search queries otherwise. */
  researchQueries: z.array(z.string().trim().min(1).max(300)).max(3)
})

export type ClarifyOutput = z.infer<typeof clarifyOutputSchema>

export type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ResearchSnippet = {
  query: string
  summary: string
}

export type DogAgentContext = {
  dogId: string
  dogName: string
  breed: string | null
  age: number | null
  condition: string | null
  notes: string | null
  routineSummary: string
}

export type ExerciseAgentGraphState = {
  messages: StoredMessage[]
  dogContext: DogAgentContext
  questions: string[]
  research: ResearchSnippet[]
  draft: ProposedExercise | null
  skipResearch: boolean
  phase: 'intake' | 'clarify' | 'research' | 'draft' | 'done'
}

export type ExerciseAgentRunResult =
  | { status: 'awaiting_input'; questions: string[]; messages: StoredMessage[] }
  | { status: 'draft_ready'; draft: ProposedExercise; messages: StoredMessage[]; research: ResearchSnippet[] }
  | { status: 'failed'; error: string; messages: StoredMessage[] }
