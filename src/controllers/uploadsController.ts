import type { FastifyReply } from 'fastify'
import { isS3Ready } from '../config/s3.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { sendError, sendSuccess } from '../utils/responseHelpers.js'
import { createDogPhotoUploadPresign } from '../services/s3/dogPhotos.js'
import { createCareStepMediaUploadPresign } from '../services/s3/careStepMedia.js'
import type { PresignCareStepMediaInput, PresignDogPhotoInput } from '../schemas/uploadSchemas.js'

export class UploadsController {
  async presignDogPhoto(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isS3Ready()) {
      return sendError(
        reply,
        'Dog photo uploads require AWS_REGION, S3_BUCKET_DOG_PHOTOS, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY',
        503
      )
    }

    await ensureUserExists(request)
    const body = request.body as PresignDogPhotoInput

    try {
      const data = await createDogPhotoUploadPresign({
        userId: request.user.id,
        contentType: body.contentType,
        contentLength: body.contentLength
      })
      return sendSuccess(reply, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create upload URL'
      return sendError(reply, message, 400)
    }
  }

  async presignCareStepMedia(request: AuthenticatedRequest, reply: FastifyReply) {
    if (!isS3Ready()) {
      return sendError(
        reply,
        'Movement media uploads require AWS_REGION, S3_BUCKET_DOG_PHOTOS, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY',
        503
      )
    }

    await ensureUserExists(request)
    const body = request.body as PresignCareStepMediaInput

    try {
      const data = await createCareStepMediaUploadPresign({
        userId: request.user.id,
        contentType: body.contentType,
        contentLength: body.contentLength
      })
      return sendSuccess(reply, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create upload URL'
      return sendError(reply, message, 400)
    }
  }
}
