import type { FastifyReply } from 'fastify'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import {
  createSpriteSession,
  getSpriteSession,
  cancelSpriteSession,
  getActiveSpriteSet,
  serializeSession
} from '../services/spriteGen/sessionService.js'
import { streamSpriteFrame, buildSpriteFrameKey } from '../services/spriteGen/s3/dogSprites.js'
import { isS3Ready } from '../config/s3.js'
import { sendCreated, sendError, sendForbidden, sendNotFound, sendSuccess } from '../utils/responseHelpers.js'
import type { SpriteAnimation } from '../services/spriteGen/engine/types.js'

export class SpriteGenController {
  private getApiBaseUrl(): string {
    return process.env.API_HOST || `http://localhost:${process.env.PORT || 3001}`
  }
  async createSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const body = request.body as { photoKey: string; breed: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      const session = await createSpriteSession({
        dogId,
        userId: request.user.id,
        photoKey: body.photoKey,
        breed: body.breed
      })

      return sendCreated(reply, serializeSession(session), 'Sprite generation started')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start sprite generation'
      if (message === 'Dog not found') return sendNotFound(reply, message)
      if (message.includes('Invalid photo key')) return sendError(reply, message, 400)
      return sendError(reply, message, 500)
    }
  }

  async getSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const session = await getSpriteSession({ dogId, userId: request.user.id, sessionId })
    if (!session) return sendNotFound(reply, 'Session not found')

    return sendSuccess(reply, serializeSession(session))
  }

  async cancelSession(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, sessionId } = request.params as { id: string; sessionId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    try {
      await cancelSpriteSession({ dogId, userId: request.user.id, sessionId })
      return sendSuccess(reply, { canceled: true })
    } catch {
      return sendNotFound(reply, 'Session not found')
    }
  }

  async getSpriteSet(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    const spriteSet = await getActiveSpriteSet({ dogId, apiBaseUrl: this.getApiBaseUrl() })

    if (!spriteSet) {
      return sendSuccess(reply, null)
    }

    return sendSuccess(reply, spriteSet)
  }

  async streamFrame(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, animation, frame } = request.params as {
      id: string
      animation: string
      frame: string
    }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) return sendForbidden(reply, 'You do not have access to this dog')

    if (!isS3Ready()) return sendError(reply, 'Storage not configured', 503)

    const spriteSet = await getActiveSpriteSet({ dogId, apiBaseUrl: this.getApiBaseUrl() })
    if (!spriteSet) return sendNotFound(reply, 'No sprite set for this dog')

    // Parse frame: e.g. "idle_001.png" or "idle_001"
    const frameName = frame.replace(/\.png$/i, '')
    const manifest = spriteSet.manifest
    const animEntry = manifest.animations[animation as SpriteAnimation]
    if (!animEntry?.keys?.includes(frameName)) {
      return sendNotFound(reply, 'Frame not found')
    }

    // Reconstruct the S3 key from storage prefix
    const parts = frameName.split('_')
    const frameIndex = parseInt(parts[parts.length - 1]!, 10) - 1
    const key = buildSpriteFrameKey(
      request.user.id,
      dogId,
      spriteSet.id,
      animation as SpriteAnimation,
      frameIndex
    )

    try {
      const { body, contentType } = await streamSpriteFrame(key)
      reply
        .header('Content-Type', contentType)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
      return reply.send(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Frame not found in storage'
      return sendNotFound(reply, message)
    }
  }
}
