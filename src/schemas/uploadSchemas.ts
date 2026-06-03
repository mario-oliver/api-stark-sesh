import { z } from 'zod'

export const presignDogPhotoSchema = z.object({
  contentType: z.string().min(3).max(100),
  contentLength: z.coerce.number().int().positive()
})

export type PresignDogPhotoInput = z.infer<typeof presignDogPhotoSchema>

export const presignCareStepMediaSchema = z.object({
  contentType: z.string().min(3).max(100),
  contentLength: z.coerce.number().int().positive()
})

export type PresignCareStepMediaInput = z.infer<typeof presignCareStepMediaSchema>
