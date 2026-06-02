import { z } from 'zod'

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
