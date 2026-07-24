import { z } from 'zod'
import { MAX_VIDEO_CLIP_BYTES } from '../config/s3.js'

const MAX_VIDEO_CLIP_MB = MAX_VIDEO_CLIP_BYTES / (1024 * 1024)

export const presignVideoClipSchema = z
  .object({
    contentType: z
      .string()
      .min(3)
      .max(100)
      .describe('Video content type: video/mp4, video/webm, or video/quicktime'),
    contentLength: z.coerce
      .number()
      .int()
      .positive()
      .describe(`Upload size in bytes — capped at ${MAX_VIDEO_CLIP_MB} MB (${MAX_VIDEO_CLIP_BYTES} bytes) in the presign policy`)
  })
  .describe(
    `Presign a VideoClip upload (PUT straight to S3, bypasses the 25 MB multipart path). Video content types only; size cap ${MAX_VIDEO_CLIP_MB} MB.`
  )

export type PresignVideoClipInput = z.infer<typeof presignVideoClipSchema>

export const registerVideoClipSchema = z
  .object({
    s3Key: z.string().trim().min(1).max(1024),
    dailyCareLogId: z.string().uuid().optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Day to attach the clip to when dailyCareLogId is omitted; defaults to today'),
    dailyCareActionId: z.string().uuid().optional(),
    durationSeconds: z.coerce.number().int().min(0).max(86400).optional()
  })
  .describe('Register an uploaded VideoClip row against a day (optionally one exercise execution)')

export type RegisterVideoClipInput = z.infer<typeof registerVideoClipSchema>

export const dogClipIdParamSchema = z.object({
  id: z.string().uuid(),
  clipId: z.string().uuid()
})
