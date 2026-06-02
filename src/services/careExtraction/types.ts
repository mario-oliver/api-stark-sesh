import { z } from 'zod'

export const dailyActionUpdateSchema = z.object({
  dailyCareActionId: z.string().min(1),
  status: z.enum(['completed', 'skipped', 'partially_completed', 'unclear']),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  completed: z.boolean(),
  notes: z.string().optional(),
  tolerance: z.enum(['good', 'okay', 'poor', 'painful', 'unknown']).optional(),
  issueObserved: z.boolean().optional()
})

export const observationSchema = z.object({
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

export const careExtractionOutputSchema = z.object({
  dailyActionUpdates: z.array(dailyActionUpdateSchema).default([]),
  observations: z.array(observationSchema).default([]),
  caregiverNote: z.string().optional(),
  needsReview: z.boolean().default(false)
})

export type CareExtractionOutput = z.infer<typeof careExtractionOutputSchema>

export type TodayActionContext = {
  id: string
  name: string
  category: string
  status: string
  instructions: string | null
}
