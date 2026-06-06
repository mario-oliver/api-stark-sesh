import type { FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { assertDogMemberAccess } from '../lib/dogAccess.js'
import { ensureUserExists } from '../lib/ensureUser.js'
import type { AuthenticatedRequest } from '../types/auth.js'
import { transcribe } from '../services/speechToText.js'
import { resolveTodayLog } from '../services/dailyCare/resolveTodayLog.js'
import { todayUtcDateString } from '../services/dailyCare/dateUtils.js'
import { enqueueVoiceNoteProcessingJob } from '../services/voiceNoteProcessing/queue.js'
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess
} from '../utils/responseHelpers.js'

export class VoiceNotesController {
  async transcribeAndStore(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId } = request.params as { id: string }
    const query = request.query as { prompt?: string; date?: string }

    await ensureUserExists(request)

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    if (!request.isMultipart?.()) {
      return sendError(reply, 'Content-Type must be multipart/form-data', 400)
    }

    let fileBuffer: Buffer | null = null
    try {
      const part = await request.file()
      if (part && part.type === 'file' && part.fieldname === 'file') {
        fileBuffer = await part.toBuffer()
      }
      if (!fileBuffer || fileBuffer.length === 0) {
        return sendError(reply, 'No audio file provided', 400)
      }
    } catch (err) {
      request.log.error(err, 'Multipart parse error')
      return sendError(reply, 'Failed to parse upload', 400)
    }

    const date = query.date ?? todayUtcDateString()
    const todayPayload = await resolveTodayLog(dogId, date)
    const dailyLog = todayPayload.dailyLog

    try {
      const prompt = query.prompt?.trim() || undefined
      const { text } = await transcribe(fileBuffer, { prompt })

      const voiceNote = await prisma.voiceNote.create({
        data: {
          dogId,
          dailyCareLogId: dailyLog.id,
          userId: request.user.id,
          transcript: text,
          processingStatus: text ? 'TRANSCRIBED' : 'PENDING'
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } }
        }
      })

      if (text) {
        await enqueueVoiceNoteProcessingJob(voiceNote.id, { source: 'transcribe' })
      }

      const refreshed = await resolveTodayLog(dogId, date)

      return sendCreated(
        reply,
        { text, voiceNote, ...refreshed },
        'Voice note saved'
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transcription failed'
      if (message.includes('OPENAI_API_KEY')) {
        return sendError(reply, 'OPENAI_API_KEY is not configured', 500)
      }
      request.log.error(err, 'Transcribe error')
      return sendError(reply, message, 500)
    }
  }

  async getVoiceNote(request: AuthenticatedRequest, reply: FastifyReply) {
    const { id: dogId, noteId } = request.params as { id: string; noteId: string }

    const member = await assertDogMemberAccess(dogId, request.user.id)
    if (!member) {
      return sendForbidden(reply, 'You do not have access to this dog')
    }

    const note = await prisma.voiceNote.findFirst({
      where: { id: noteId, dogId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } }
      }
    })

    if (!note) {
      return sendNotFound(reply, 'Voice note not found')
    }

    return sendSuccess(reply, note)
  }
}
