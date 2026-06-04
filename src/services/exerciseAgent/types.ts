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
  description: z.string().trim().max(2000).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).optional()
})

export const proposedExerciseSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  category: careActionCategorySchema,
  frequency: careActionFrequencySchema,
  timeOfDay: careActionTimeOfDaySchema.optional().nullable(),
  targetReps: z.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.number().int().min(0).max(86400).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  movements: z.array(proposedMovementSchema).min(1).max(8),
  rationale: z.string().trim().min(1).max(4000),
  safetyNotes: z.string().trim().min(1).max(4000),
  researchSummary: z.string().trim().min(1).max(4000)
})

export type ProposedExercise = z.infer<typeof proposedExerciseSchema>

export const clarifyOutputSchema = z.object({
  needsClarification: z.boolean(),
  questions: z.array(z.string().trim().min(1).max(500)).max(3),
  researchQueries: z.array(z.string().trim().min(1).max(300)).max(3).optional()
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
