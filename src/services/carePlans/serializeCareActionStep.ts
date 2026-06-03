import { getPresignedCareStepMediaViewUrl } from '../s3/careStepMedia.js'

export type CareActionStepRow = {
  id: string
  careActionId: string
  name: string
  description: string | null
  instructions: string | null
  mediaKey: string | null
  mediaContentType: string | null
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export async function serializeCareActionStep(step: CareActionStepRow) {
  const mediaUrl = await getPresignedCareStepMediaViewUrl(step.mediaKey)
  return {
    id: step.id,
    careActionId: step.careActionId,
    name: step.name,
    description: step.description,
    instructions: step.instructions,
    mediaKey: step.mediaKey,
    mediaContentType: step.mediaContentType,
    mediaUrl,
    sortOrder: step.sortOrder,
    isActive: step.isActive,
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString()
  }
}
