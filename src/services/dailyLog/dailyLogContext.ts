import { prisma } from '../../lib/prisma.js'
import type { DailyLogContext } from './types.js'

/**
 * Load the durable VoiceNote transcript the DAILY_LOG session extracts over.
 * Scoped to the dog so a session can only run over its own dog's note. Returns
 * null when the note does not exist (the caller maps this to a 404). Its own
 * module so the session service can module-mock it in unit tests.
 */
export async function loadDailyLogContext(args: {
  dogId: string
  voiceNoteId: string
}): Promise<DailyLogContext | null> {
  const voiceNote = await prisma.voiceNote.findFirst({
    where: { id: args.voiceNoteId, dogId: args.dogId },
    include: { dog: { select: { name: true } } }
  })
  if (!voiceNote) return null

  return {
    dogId: args.dogId,
    dogName: voiceNote.dog?.name ?? 'the dog',
    transcript: voiceNote.transcript ?? ''
  }
}
