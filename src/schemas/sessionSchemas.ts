import { z } from 'zod'

export const sessionTypeSchema = z.enum([
  'TEAM_PRACTICE',
  'SKILL_SESSION',
  'GAME',
  'TRYOUT',
  'OTHER'
])

export const createSessionSchema = z.object({
  type: sessionTypeSchema,
  teamId: z.string().uuid(),
  participantMemberIds: z.array(z.string().uuid()).optional(),
  startedAt: z.string().datetime().optional()
})

export const sessionIdParamSchema = z.object({
  id: z.string().uuid()
})

export const sessionPlayerObservationParamsSchema = z.object({
  id: z.string().uuid(),
  teamMemberId: z.string().uuid()
})

export const updateObservationParamsSchema = z.object({
  id: z.string().uuid(),
  observationId: z.string().uuid()
})

export const updateObservationSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  drillId: z.string().uuid().nullable().optional()
})

const drillInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  execution: z.string().max(8000).optional().nullable(),
  durationMinutes: z.number().int().min(0).max(600).optional().nullable(),
  focusTags: z.array(z.string().max(100)).max(30).optional(),
  playerFocusMemberIds: z.array(z.string().uuid()).max(50).optional()
})

export const replacePracticePlanSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  goals: z.array(z.string().max(500)).max(40).optional().default([]),
  userPrompt: z.string().max(4000).optional().nullable(),
  drills: z.array(drillInputSchema).max(40).optional().default([])
})

export const addDrillBodySchema = drillInputSchema

export const drillIdParamSchema = z.object({
  id: z.string().uuid(),
  drillId: z.string().uuid()
})

export const updateDrillBodySchema = drillInputSchema.partial().refine(
  (d) =>
    d.title != null ||
    d.description !== undefined ||
    d.execution !== undefined ||
    d.durationMinutes !== undefined ||
    d.focusTags != null ||
    d.playerFocusMemberIds != null,
  'At least one field must be provided'
)

export const generatePracticePlanSchema = z.object({
  userPromptAddition: z.string().max(4000).optional()
})

export const drillFromTranscriptSchema = z.object({
  transcript: z.string().min(1, 'transcript is required').max(12000)
})

export const sessionStatSchema = z.object({
  teamMemberId: z.string().uuid(),
  points: z.number().int().min(0).max(300),
  assists: z.number().int().min(0).max(100),
  rebounds: z.number().int().min(0).max(100),
  steals: z.number().int().min(0).max(50),
  blocks: z.number().int().min(0).max(50),
  turnovers: z.number().int().min(0).max(100),
  fouls: z.number().int().min(0).max(20)
})

export const upsertSessionStatsSchema = z.object({
  stats: z.array(sessionStatSchema).max(100)
})

export const patchSessionStatMetricParamsSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  metric: z.enum(['points', 'assists', 'rebounds', 'steals', 'blocks', 'turnovers', 'fouls'])
})

export const patchSessionStatMetricSchema = z
  .object({
    lock: z.boolean().optional(),
    manualOverride: z.number().int().min(0).max(500).nullable().optional()
  })
  .refine(v => v.lock !== undefined || v.manualOverride !== undefined, 'At least one field must be provided')

export const rerunObservationParamsSchema = z.object({
  id: z.string().uuid(),
  observationId: z.string().uuid()
})

export const rerunGameStatsSchema = z.object({
  onlyFailed: z.boolean().optional().default(false),
  fromTimestamp: z.string().datetime().optional()
})

export const derivedStatLineParamsSchema = z.object({
  id: z.string().uuid(),
  lineId: z.string().uuid()
})

export const editDerivedStatLineSchema = z.object({
  points: z.number().int().min(0).max(300).optional(),
  assists: z.number().int().min(0).max(100).optional(),
  rebounds: z.number().int().min(0).max(100).optional(),
  steals: z.number().int().min(0).max(50).optional(),
  blocks: z.number().int().min(0).max(50).optional(),
  turnovers: z.number().int().min(0).max(100).optional(),
  fouls: z.number().int().min(0).max(20).optional(),
  teamMemberId: z.string().uuid().nullable().optional(),
  reviewNote: z.string().max(2000).optional().nullable()
})

export const reviewDerivedStatLineSchema = z.object({
  reviewNote: z.string().max(2000).optional().nullable()
})

export const resolveUnrecognizedNameSchema = z.object({
  rawName: z.string().min(1).max(200),
  teamMemberId: z.string().uuid(),
  applyToSessionOnly: z.boolean().optional()
})

export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type UpdateObservationInput = z.infer<typeof updateObservationSchema>
