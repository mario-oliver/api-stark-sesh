import { z } from 'zod'

export const createSpriteSessionSchema = z.object({
  photoKey: z.string().min(1, 'Photo key is required'),
  breed: z.string().min(1, 'Breed is required').max(200, 'Breed must be 200 characters or less')
})

export type CreateSpriteSessionInput = z.infer<typeof createSpriteSessionSchema>
