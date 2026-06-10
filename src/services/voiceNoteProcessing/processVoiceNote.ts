import { prisma } from '../../lib/prisma.js'

/**
 * Voice-note processing is transcription-only (ADR-0002 move 5 / issue 0004).
 *
 * VoiceNote is a dumb artifact: audio + Whisper transcript + transcription status.
 * The former one-shot care-extraction writer path (extract → apply → write
 * `VoiceNote.extraction`) is gone — extraction is now conversational and lives in
 * `CareAgentSession`. This worker only finalizes the transcription lifecycle.
 */
export async function processVoiceNote(voiceNoteId: string) {
  const voiceNote = await prisma.voiceNote.findUniqueOrThrow({
    where: { id: voiceNoteId },
    select: { id: true, transcript: true }
  })

  if (!voiceNote.transcript.trim()) {
    throw new Error('Voice note has no transcript')
  }

  await prisma.voiceNote.update({
    where: { id: voiceNote.id },
    data: { processingStatus: 'PROCESSED' }
  })
}
