import { prisma } from '../../lib/prisma.js'
import { computeBucketScores } from '../bucketScoring/computeBucketScores.js'
import { formatCalendarDate } from '../dailyCare/dateUtils.js'
import { applyCareExtraction } from '../careExtraction/applyCareExtraction.js'
import { extractCareFromTranscript } from '../careExtraction/extractCareFromTranscript.js'
import type { TodayActionContext, TodayTaskContext } from '../careExtraction/types.js'

export async function processVoiceNote(voiceNoteId: string) {
  const voiceNote = await prisma.voiceNote.findUniqueOrThrow({
    where: { id: voiceNoteId },
    include: {
      dog: true,
      user: true,
      dailyCareLog: {
        include: {
          dailyCareActions: {
            include: { careAction: true }
          },
          dailyTasks: true
        }
      }
    }
  })

  if (!voiceNote.transcript.trim()) {
    throw new Error('Voice note has no transcript')
  }

  const actions: TodayActionContext[] = voiceNote.dailyCareLog.dailyCareActions.map(a => ({
    id: a.id,
    name: a.nameSnapshot,
    bucket: a.careAction.bucket,
    status: a.status,
    instructions: a.careAction.instructions
  }))

  const tasks: TodayTaskContext[] = voiceNote.dailyCareLog.dailyTasks.map(t => ({
    id: t.id,
    name: t.nameSnapshot,
    bucket: t.bucket,
    status: t.status,
    source: t.source,
    instructions: t.instructionsSnapshot
  }))

  const userName =
    [voiceNote.user.firstName, voiceNote.user.lastName].filter(Boolean).join(' ') ||
    voiceNote.user.email

  const extraction = await extractCareFromTranscript({
    dogName: voiceNote.dog.name,
    dogId: voiceNote.dogId,
    userId: voiceNote.userId,
    userName,
    date: formatCalendarDate(voiceNote.dailyCareLog.date),
    actions,
    tasks,
    transcript: voiceNote.transcript
  })

  await applyCareExtraction({
    voiceNoteId: voiceNote.id,
    dogId: voiceNote.dogId,
    dailyCareLogId: voiceNote.dailyCareLogId,
    userId: voiceNote.userId,
    extraction
  })

  try {
    await computeBucketScores(voiceNote.dailyCareLogId)
  } catch (err) {
    console.error('Bucket scoring failed after voice note processing:', err)
  }
}
