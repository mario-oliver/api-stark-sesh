import { prisma } from '../../lib/prisma.js'
import { assertPhotoKeyOwnedByUser } from '../s3/dogPhotos.js'
import { enqueueSpriteGenerationJob } from './queue.js'
import type { SpriteGenManifest } from './engine/types.js'

export type SerializedSpriteSession = {
  id: string
  dogId: string
  userId: string
  status: string
  currentStep: string | null
  progress: number
  breedInput: string
  normalizedBreed: string | null
  spriteSetId: string | null
  error: string | null
  steps: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type SerializedSpriteSet = {
  id: string
  dogId: string
  isActive: boolean
  styleVersion: string
  storagePrefix: string
  manifest: SpriteGenManifest
  frameBaseUrl: string
  createdAt: string
}

export function serializeSession(
  session: Awaited<ReturnType<typeof prisma.spriteGenerationSession.findUniqueOrThrow>>
): SerializedSpriteSession {
  return {
    id: session.id,
    dogId: session.dogId,
    userId: session.userId,
    status: session.status,
    currentStep: session.currentStep,
    progress: session.progress,
    breedInput: session.breedInput,
    normalizedBreed: session.normalizedBreed,
    spriteSetId: session.spriteSetId,
    error: session.error,
    steps: (session.steps as Record<string, unknown>) ?? {},
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  }
}

export async function createSpriteSession(args: {
  dogId: string
  userId: string
  photoKey: string
  breed: string
}) {
  const dog = await prisma.dog.findUnique({ where: { id: args.dogId }, select: { id: true } })
  if (!dog) throw new Error('Dog not found')

  assertPhotoKeyOwnedByUser(args.photoKey, args.userId)

  const session = await prisma.spriteGenerationSession.create({
    data: {
      dogId: args.dogId,
      userId: args.userId,
      status: 'PENDING',
      sourcePhotoKey: args.photoKey,
      breedInput: args.breed.trim().slice(0, 200),
      steps: {}
    }
  })

  await enqueueSpriteGenerationJob(session.id, { source: 'create' })

  return session
}

export async function getSpriteSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  return prisma.spriteGenerationSession.findFirst({
    where: { id: args.sessionId, dogId: args.dogId }
  })
}

export async function cancelSpriteSession(args: {
  dogId: string
  userId: string
  sessionId: string
}) {
  const session = await prisma.spriteGenerationSession.findFirst({
    where: { id: args.sessionId, dogId: args.dogId }
  })
  if (!session) throw new Error('Session not found')

  await prisma.spriteGenerationSession.update({
    where: { id: args.sessionId },
    data: { status: 'CANCELED' }
  })

  // Mark any pending/retry jobs as failed so the worker skips them
  await prisma.spriteGenerationJob.updateMany({
    where: { sessionId: args.sessionId, status: { in: ['PENDING', 'RETRY'] } },
    data: { status: 'FAILED', lastError: 'Canceled by user' }
  })
}

export async function getActiveSpriteSet(args: {
  dogId: string
  apiBaseUrl: string
}): Promise<SerializedSpriteSet | null> {
  const spriteSet = await prisma.spriteSet.findFirst({
    where: { dogId: args.dogId, isActive: true, status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' }
  })

  if (!spriteSet) return null

  return {
    id: spriteSet.id,
    dogId: spriteSet.dogId,
    isActive: spriteSet.isActive,
    styleVersion: spriteSet.styleVersion,
    storagePrefix: spriteSet.storagePrefix,
    manifest: spriteSet.manifest as unknown as SpriteGenManifest,
    frameBaseUrl: `${args.apiBaseUrl}/v1/dogs/${args.dogId}/sprites`,
    createdAt: spriteSet.createdAt.toISOString()
  }
}
