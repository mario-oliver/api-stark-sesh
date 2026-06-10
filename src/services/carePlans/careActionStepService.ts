import { prisma } from '../../lib/prisma.js'
import { assertCareStepMediaKeyOwnedByUser } from '../s3/careStepMedia.js'
import { serializeCareActionStep } from './serializeCareActionStep.js'
import type { CareBucket } from '../../generated/client.js'

export type CreateCareActionStepInput = {
  name: string
  bucket?: CareBucket | null
  description?: string | null
  instructions?: string | null
  targetReps?: number | null
  targetDurationSeconds?: number | null
  mediaKey?: string | null
  mediaContentType?: string | null
  sortOrder?: number
}

export type UpdateCareActionStepInput = Partial<CreateCareActionStepInput>

async function assertCareActionForDog(dogId: string, actionId: string) {
  const action = await prisma.careAction.findFirst({
    where: {
      id: actionId,
      isActive: true,
      carePlan: { dogId, isActive: true }
    }
  })
  if (!action) {
    throw new Error('Care action not found')
  }
  return action
}

function validateMediaKey(mediaKey: string | null | undefined, userId: string) {
  if (mediaKey) {
    assertCareStepMediaKeyOwnedByUser(mediaKey, userId)
  }
}

export async function createCareActionStep(
  dogId: string,
  actionId: string,
  input: CreateCareActionStepInput,
  userId: string
) {
  const action = await assertCareActionForDog(dogId, actionId)
  validateMediaKey(input.mediaKey, userId)

  const maxStep = await prisma.careActionStep.findFirst({
    where: { careActionId: action.id, isActive: true },
    orderBy: { sortOrder: 'desc' },
    take: 1
  })
  const sortOrder = input.sortOrder ?? (maxStep?.sortOrder ?? 0) + 1

  const step = await prisma.careActionStep.create({
    data: {
      careActionId: action.id,
      name: input.name,
      bucket: input.bucket ?? action.bucket,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      targetReps: input.targetReps ?? null,
      targetDurationSeconds: input.targetDurationSeconds ?? null,
      mediaKey: input.mediaKey ?? null,
      mediaContentType: input.mediaContentType ?? null,
      sortOrder
    }
  })

  return serializeCareActionStep(step)
}

export async function updateCareActionStep(
  dogId: string,
  actionId: string,
  stepId: string,
  input: UpdateCareActionStepInput,
  userId: string
) {
  await assertCareActionForDog(dogId, actionId)
  validateMediaKey(input.mediaKey, userId)

  const step = await prisma.careActionStep.findFirst({
    where: { id: stepId, careActionId: actionId, isActive: true }
  })
  if (!step) {
    throw new Error('Movement not found')
  }

  const updated = await prisma.careActionStep.update({
    where: { id: stepId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.bucket !== undefined && { bucket: input.bucket }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.instructions !== undefined && { instructions: input.instructions }),
      ...(input.targetReps !== undefined && { targetReps: input.targetReps }),
      ...(input.targetDurationSeconds !== undefined && {
        targetDurationSeconds: input.targetDurationSeconds
      }),
      ...(input.mediaKey !== undefined && { mediaKey: input.mediaKey }),
      ...(input.mediaContentType !== undefined && { mediaContentType: input.mediaContentType }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder })
    }
  })

  return serializeCareActionStep(updated)
}

export async function deactivateCareActionStep(dogId: string, actionId: string, stepId: string) {
  await assertCareActionForDog(dogId, actionId)

  const step = await prisma.careActionStep.findFirst({
    where: { id: stepId, careActionId: actionId, isActive: true }
  })
  if (!step) {
    throw new Error('Movement not found')
  }

  const updated = await prisma.careActionStep.update({
    where: { id: stepId },
    data: { isActive: false }
  })

  return serializeCareActionStep(updated)
}
