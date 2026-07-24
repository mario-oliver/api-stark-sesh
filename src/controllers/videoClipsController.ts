import type { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import { isS3Ready } from '../config/s3.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  sendCreated,
  sendDeleted,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'
import {
  assertVideoClipKeyForDog,
  createVideoClipUploadPresign,
  deleteVideoClipObject,
  getPresignedVideoClipUrl
} from '../services/s3/videoClips.js'
import {
  assertActionBelongsToLog,
  resolveClipDailyCareLog,
  serializeVideoClip
} from '../services/videoClips/videoClipService.js'
import type {
  PresignVideoClipInput,
  RegisterVideoClipInput
} from '../schemas/videoClipSchemas.js'

const S3_NOT_READY =
  'Video clip storage requires AWS_REGION, S3_BUCKET_DOG_PHOTOS, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY'

export class VideoClipsController {
  /** POST /v1/dogs/:id/video-clips/presign — presigned PUT for a video upload. */
  async presign(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    if (!isS3Ready()) {
      return sendError(reply, S3_NOT_READY, 503)
    }

    await ensureUserExists(request)
    const body = request.body as PresignVideoClipInput

    try {
      const data = await createVideoClipUploadPresign({
        dogId,
        contentType: body.contentType,
        contentLength: body.contentLength
      })
      return sendSuccess(reply, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create upload URL'
      return sendError(reply, message, 400)
    }
  }

  /** POST /v1/dogs/:id/video-clips — register the clip row after the S3 upload. */
  async register(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    await ensureUserExists(request)
    const body = request.body as RegisterVideoClipInput

    try {
      assertVideoClipKeyForDog(body.s3Key, dogId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid video clip key'
      return sendError(reply, message, 400)
    }

    const resolved = await resolveClipDailyCareLog({
      dogId,
      dailyCareLogId: body.dailyCareLogId,
      date: body.date
    })
    if ('error' in resolved) {
      return sendError(reply, resolved.error, resolved.statusCode)
    }

    if (body.dailyCareActionId) {
      const belongs = await assertActionBelongsToLog(body.dailyCareActionId, resolved.logId)
      if (!belongs) {
        return sendError(reply, 'dailyCareActionId does not belong to this daily care log', 400)
      }
    }

    const clip = await prisma.videoClip.create({
      data: {
        dogId,
        dailyCareLogId: resolved.logId,
        dailyCareActionId: body.dailyCareActionId ?? null,
        userId: request.user.id,
        s3Key: body.s3Key,
        durationSeconds: body.durationSeconds ?? null
      }
    })

    return sendCreated(reply, serializeVideoClip(clip), 'Video clip registered')
  }

  /** GET /v1/dogs/:id/video-clips/:clipId/url — presigned GET for playback/download. */
  async getUrl(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, clipId } = request.params as { id: string; clipId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const clip = await prisma.videoClip.findFirst({ where: { id: clipId, dogId } })
    if (!clip) {
      return sendNotFound(reply, 'Video clip not found')
    }

    if (!isS3Ready()) {
      return sendError(reply, S3_NOT_READY, 503)
    }

    const presigned = await getPresignedVideoClipUrl(clip.s3Key)
    if (!presigned) {
      return sendError(reply, 'Could not create video clip URL', 500)
    }

    return sendSuccess(reply, presigned)
  }

  /** DELETE /v1/dogs/:id/video-clips/:clipId — remove the row, best-effort S3 cleanup. */
  async remove(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, clipId } = request.params as { id: string; clipId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const clip = await prisma.videoClip.findFirst({ where: { id: clipId, dogId } })
    if (!clip) {
      return sendNotFound(reply, 'Video clip not found')
    }

    await prisma.videoClip.delete({ where: { id: clip.id } })

    if (isS3Ready()) {
      try {
        await deleteVideoClipObject(clip.s3Key)
      } catch (error) {
        request.log.warn(error, 'Failed to delete video clip object from S3')
      }
    }

    return sendDeleted(reply, 'Video clip deleted')
  }
}
