import type { Prisma } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import type { CareExtractionOutput } from './types.js'

const STATUS_MAP = {
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
  partially_completed: 'PARTIALLY_COMPLETED',
  unclear: 'UNCLEAR'
} as const

const TOLERANCE_MAP = {
  good: 'GOOD',
  okay: 'OKAY',
  poor: 'POOR',
  painful: 'PAINFUL',
  unknown: 'UNKNOWN'
} as const

const OBS_TYPE_MAP = {
  slipping: 'SLIPPING',
  limping: 'LIMPING',
  weakness: 'WEAKNESS',
  stiffness: 'STIFFNESS',
  pain: 'PAIN',
  low_energy: 'LOW_ENERGY',
  appetite: 'APPETITE',
  bathroom: 'BATHROOM',
  medication: 'MEDICATION',
  general_note: 'GENERAL_NOTE'
} as const

const SEVERITY_MAP = {
  mild: 'MILD',
  moderate: 'MODERATE',
  severe: 'SEVERE',
  unknown: 'UNKNOWN'
} as const

export async function applyCareExtraction(args: {
  voiceNoteId: string
  dogId: string
  dailyCareLogId: string
  userId: string
  extraction: CareExtractionOutput
}) {
  const now = new Date()

  await prisma.$transaction(async tx => {
    for (const update of args.extraction.dailyActionUpdates) {
      const action = await tx.dailyCareAction.findFirst({
        where: {
          id: update.dailyCareActionId,
          dailyCareLogId: args.dailyCareLogId
        }
      })
      if (!action) continue

      const status = STATUS_MAP[update.status]
      const tolerance = update.tolerance ? TOLERANCE_MAP[update.tolerance] : undefined

      await tx.dailyCareAction.update({
        where: { id: action.id },
        data: {
          status,
          notes: update.notes ?? action.notes,
          tolerance: tolerance ?? action.tolerance,
          issueObserved: update.issueObserved ?? action.issueObserved,
          completedAt:
            update.completed && (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')
              ? now
              : status === 'SKIPPED'
                ? null
                : action.completedAt,
          completedByUserId:
            update.completed && (status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED')
              ? args.userId
              : action.completedByUserId
        }
      })
    }

    for (const obs of args.extraction.observations) {
      await tx.healthObservation.create({
        data: {
          dogId: args.dogId,
          dailyCareLogId: args.dailyCareLogId,
          userId: args.userId,
          voiceNoteId: args.voiceNoteId,
          type: OBS_TYPE_MAP[obs.type],
          severity: obs.severity ? SEVERITY_MAP[obs.severity] : null,
          bodyArea: obs.bodyArea ?? null,
          note: obs.note,
          observedAt: null
        }
      })
    }

    if (args.extraction.caregiverNote) {
      await tx.dailyCareLog.update({
        where: { id: args.dailyCareLogId },
        data: { summary: args.extraction.caregiverNote }
      })
    }

    await tx.voiceNote.update({
      where: { id: args.voiceNoteId },
      data: {
        processingStatus: 'PROCESSED',
        extraction: args.extraction as unknown as Prisma.InputJsonValue,
        caregiverNote: args.extraction.caregiverNote ?? null,
        needsReview: args.extraction.needsReview
      }
    })
  })
}
