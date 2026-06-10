import { z } from 'zod'

export const dailyActionUpdateSchema = z.object({
  dailyCareActionId: z.string().min(1),
  status: z.enum(['completed', 'skipped', 'partially_completed', 'unclear']),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  completed: z.boolean(),
  notes: z.string().optional(),
  tolerance: z.enum(['good', 'okay', 'poor', 'painful', 'unknown']).optional()
})

export const matchedTaskUpdateSchema = z.object({
  dailyTaskId: z.string().min(1),
  status: z.enum(['completed', 'skipped', 'partially_completed', 'unclear', 'pending']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
})

export const adHocTaskSchema = z.object({
  bucket: z.enum(['activity', 'mobility', 'recovery']),
  name: z.string().min(1),
  status: z.enum(['completed', 'skipped', 'partially_completed', 'unclear', 'pending']).default('completed'),
  source: z.enum(['llm_extracted', 'plan_variation']).default('llm_extracted'),
  notes: z.string().optional(),
  substitutedForTaskId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional()
})

export const observationSchema = z.object({
  bucket: z.enum(['activity', 'mobility', 'recovery']).optional(),
  type: z.enum([
    'slipping',
    'limping',
    'weakness',
    'stiffness',
    'pain',
    'low_energy',
    'appetite',
    'bathroom',
    'medication',
    'general_note'
  ]),
  severity: z.enum(['mild', 'moderate', 'severe', 'unknown']).optional(),
  bodyArea: z.string().nullable().optional(),
  note: z.string().min(1),
  observedAtText: z.string().nullable().optional()
})

export const bucketHintsSchema = z
  .object({
    activity: z.string().optional(),
    mobility: z.string().optional(),
    recovery: z.string().optional()
  })
  .optional()

export const careExtractionOutputSchema = z.object({
  dailyActionUpdates: z.array(dailyActionUpdateSchema).default([]),
  matchedTaskUpdates: z.array(matchedTaskUpdateSchema).default([]),
  adHocTasks: z.array(adHocTaskSchema).default([]),
  observations: z.array(observationSchema).default([]),
  bucketHints: bucketHintsSchema,
  caregiverNote: z.string().optional(),
  needsReview: z.boolean().default(false)
})

export type CareExtractionOutput = z.infer<typeof careExtractionOutputSchema>

export type TodayActionContext = {
  id: string
  name: string
  bucket: string
  status: string
  instructions: string | null
}

export type TodayTaskContext = {
  id: string
  name: string
  bucket: string
  status: string
  source: string
  instructions: string | null
}
