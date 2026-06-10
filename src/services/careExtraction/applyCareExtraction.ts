import type { Prisma } from '../../generated/client.js'
import { prisma } from '../../lib/prisma.js'
import { observationTypeToBucket } from '../carePlans/categoryToBucket.js'
import type { CareExtractionOutput } from './types.js'

const STATUS_MAP = {
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
  partially_completed: 'PARTIALLY_COMPLETED',
  unclear: 'UNCLEAR',
  pending: 'PENDING'
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

const BUCKET_MAP = {
  activity: 'ACTIVITY',
  mobility: 'MOBILITY',
  recovery: 'RECOVERY'
} as const

const SOURCE_MAP = {
  llm_extracted: 'LLM_EXTRACTED',
  plan_variation: 'PLAN_VARIATION'
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
    for (const update of args.extraction.matchedTaskUpdates) {
      const task = await tx.dailyCareAction.findFirst({
        where: { id: update.dailyTaskId, dailyCareLogId: args.dailyCareLogId }
      })
      if (!task) continue

      const status = STATUS_MAP[update.status]
      const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'
      const needsReview =
        update.confidence !== undefined && update.confidence < 0.7
          ? true
          : args.extraction.needsReview

      await tx.dailyCareAction.update({
        where: { id: task.id },
        data: {
          status,
          notes: update.notes ?? update.reason ?? task.notes,
          needsReview,
          extractionConfidence: update.confidence ?? task.extractionConfidence,
          completedAt: isComplete ? now : status === 'SKIPPED' ? null : task.completedAt,
          completedByUserId: isComplete ? args.userId : task.completedByUserId
        }
      })
    }

    for (const adHoc of args.extraction.adHocTasks) {
      const status = STATUS_MAP[adHoc.status]
      const isComplete = status === 'COMPLETED' || status === 'PARTIALLY_COMPLETED'
      const needsReview =
        adHoc.confidence !== undefined && adHoc.confidence < 0.7
          ? true
          : args.extraction.needsReview || adHoc.source === 'plan_variation'

      await tx.dailyCareAction.create({
        data: {
          dailyCareLogId: args.dailyCareLogId,
          bucket: BUCKET_MAP[adHoc.bucket],
          source: SOURCE_MAP[adHoc.source],
          nameSnapshot: adHoc.name,
          status,
          notes: adHoc.notes ?? null,
          substitutedForTaskId: adHoc.substitutedForTaskId ?? null,
          metadata: (adHoc.metadata ?? null) as Prisma.InputJsonValue,
          extractionConfidence: adHoc.confidence ?? null,
          needsReview,
          completedAt: isComplete ? now : null,
          completedByUserId: isComplete ? args.userId : null
        }
      })

      if (adHoc.substitutedForTaskId && adHoc.status === 'completed') {
        const substituted = await tx.dailyCareAction.findFirst({
          where: { id: adHoc.substitutedForTaskId, dailyCareLogId: args.dailyCareLogId }
        })
        if (substituted && substituted.status === 'PENDING') {
          await tx.dailyCareAction.update({
            where: { id: substituted.id },
            data: {
              status: 'SKIPPED',
              notes: adHoc.notes ? `Skipped: ${adHoc.notes}` : 'Substituted by voice update',
              needsReview: true
            }
          })
        }
      }
    }

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
      const obsType = OBS_TYPE_MAP[obs.type]
      await tx.healthObservation.create({
        data: {
          dogId: args.dogId,
          dailyCareLogId: args.dailyCareLogId,
          userId: args.userId,
          voiceNoteId: args.voiceNoteId,
          type: obsType,
          bucket:
            obs.bucket !== undefined
              ? BUCKET_MAP[obs.bucket]
              : observationTypeToBucket(obsType),
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
