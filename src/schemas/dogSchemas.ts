import { z } from 'zod'

const photoKeySchema = z.string().trim().min(1).max(512).optional().nullable()

const dogSexSchema = z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional().nullable()

const dogProfileFields = {
  breed: z.string().trim().max(100).optional().nullable(),
  age: z.coerce.number().int().min(0).max(30).optional().nullable(),
  sex: dogSexSchema,
  weightLbs: z.coerce.number().min(0).max(300).optional().nullable(),
  condition: z.string().trim().max(500).optional().nullable(),
  vetName: z.string().trim().max(200).optional().nullable(),
  vetPhone: z.string().trim().max(30).optional().nullable(),
  photoKey: photoKeySchema,
  notes: z.string().trim().max(2000).optional().nullable()
}

export const createDogSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ...dogProfileFields
})

export const updateDogSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  ...dogProfileFields
})

export const dogIdParamSchema = z.object({
  id: z.string().uuid()
})

export const dogActionIdParamSchema = z.object({
  id: z.string().uuid(),
  actionId: z.string().uuid()
})

export const dogNoteIdParamSchema = z.object({
  id: z.string().uuid(),
  noteId: z.string().uuid()
})

export const dogObsIdParamSchema = z.object({
  id: z.string().uuid(),
  obsId: z.string().uuid()
})

export const todayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})

export const addDogMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.string().optional()
})

export const updateDailyActionSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR']).optional(),
  notes: z.string().optional(),
  tolerance: z.enum(['GOOD', 'OKAY', 'POOR', 'PAINFUL', 'UNKNOWN']).nullable().optional(),
  issueObserved: z.boolean().optional()
})

const careBucketSchema = z.enum(['ACTIVITY', 'MOBILITY', 'RECOVERY'])

export const createObservationSchema = z.object({
  type: z.enum([
    'SLIPPING',
    'LIMPING',
    'WEAKNESS',
    'STIFFNESS',
    'PAIN',
    'LOW_ENERGY',
    'APPETITE',
    'BATHROOM',
    'MEDICATION',
    'GENERAL_NOTE'
  ]),
  bucket: careBucketSchema.optional(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN']).optional(),
  bodyArea: z.string().nullable().optional(),
  note: z.string().min(1),
  observedAt: z.string().datetime().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
})

export const updateObservationSchema = z.object({
  type: z
    .enum([
      'SLIPPING',
      'LIMPING',
      'WEAKNESS',
      'STIFFNESS',
      'PAIN',
      'LOW_ENERGY',
      'APPETITE',
      'BATHROOM',
      'MEDICATION',
      'GENERAL_NOTE'
    ])
    .optional(),
  severity: z.enum(['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN']).nullable().optional(),
  bodyArea: z.string().nullable().optional(),
  note: z.string().min(1).optional()
})

export const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
})

export const joinByShareCodeSchema = z.object({
  shareCode: z.string().trim().min(1).max(20)
})

export const joinPreviewQuerySchema = z.object({
  code: z.string().trim().min(1).max(20)
})

const careActionCategorySchema = z.enum([
  'STRETCH',
  'STRENGTH',
  'MOBILITY',
  'WALK',
  'MEDICATION',
  'GENERAL_CARE',
  'OBSERVATION_CHECKPOINT'
])

const careActionFrequencySchema = z.enum(['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED'])

const careActionTimeOfDaySchema = z.enum(['MORNING', 'EVENING', 'ANYTIME'])

export const updateCarePlanSchema = z.object({
  name: z.string().trim().min(1).max(200)
})

export const createCareActionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  category: careActionCategorySchema,
  bucket: careBucketSchema.optional().nullable(),
  frequency: careActionFrequencySchema,
  timeOfDay: careActionTimeOfDaySchema.optional().nullable(),
  targetReps: z.coerce.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional()
})

export const updateCareActionSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  category: careActionCategorySchema.optional(),
  bucket: careBucketSchema.optional().nullable(),
  frequency: careActionFrequencySchema.optional(),
  timeOfDay: careActionTimeOfDaySchema.optional().nullable(),
  targetReps: z.coerce.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional()
})

export const dogCareActionIdParamSchema = z.object({
  id: z.string().uuid(),
  actionId: z.string().uuid()
})

export const dogCareActionStepIdParamSchema = z.object({
  id: z.string().uuid(),
  actionId: z.string().uuid(),
  stepId: z.string().uuid()
})

export const dogDailyActionStepIdParamSchema = z.object({
  id: z.string().uuid(),
  stepId: z.string().uuid()
})

const mediaKeySchema = z.string().trim().min(1).max(512).optional().nullable()

export const createCareActionStepSchema = z.object({
  name: z.string().trim().min(1).max(200),
  bucket: careBucketSchema.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  targetReps: z.coerce.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  mediaKey: mediaKeySchema,
  mediaContentType: z.string().trim().max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional()
})

export const updateCareActionStepSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  bucket: careBucketSchema.optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  instructions: z.string().trim().max(2000).optional().nullable(),
  targetReps: z.coerce.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.coerce.number().int().min(0).max(86400).optional().nullable(),
  mediaKey: mediaKeySchema,
  mediaContentType: z.string().trim().max(100).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional()
})

export const updateDailyActionStepSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR']).optional(),
  notes: z.string().optional()
})

export const dogDailyTaskIdParamSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid()
})

export const dogDailyLogIdParamSchema = z.object({
  id: z.string().uuid(),
  logId: z.string().uuid()
})

export const updateDailyTaskSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR']).optional(),
  notes: z.string().optional(),
  actualReps: z.coerce.number().int().min(0).max(999).nullable().optional(),
  actualDurationSeconds: z.coerce.number().int().min(0).max(86400).nullable().optional(),
  needsReview: z.boolean().optional()
})

export const createDailyTaskSchema = z.object({
  dailyCareLogId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  bucket: careBucketSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().optional().nullable(),
  targetReps: z.coerce.number().int().min(0).max(999).optional().nullable(),
  targetDurationSeconds: z.coerce.number().int().min(0).max(86400).optional().nullable()
})

export const reviewDailyTaskSchema = z.object({
  accept: z.boolean(),
  status: z.enum(['PENDING', 'COMPLETED', 'SKIPPED', 'PARTIALLY_COMPLETED', 'UNCLEAR']).optional()
})

export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/)
})
