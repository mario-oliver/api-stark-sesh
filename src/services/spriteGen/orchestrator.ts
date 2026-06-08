import OpenAI from 'openai'
import { prisma } from '../../lib/prisma.js'
import { generateSpriteSet } from './engine/index.js'
import { putSpriteFrame, buildSpriteStoragePrefix } from './s3/dogSprites.js'
import { loadStarkStyleReference } from './starkReference.js'
import type { SpriteAnimation } from './engine/types.js'

const SPRITE_STYLE_VERSION = 'v1'

type StepRecord = {
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  error?: string
}

/**
 * Download the dog photo from S3 so we can pass it as a Buffer to the engine.
 */
async function downloadPhotoBuffer(photoKey: string): Promise<Buffer> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const { getS3Config } = await import('../../config/s3.js')
  const { getS3Client } = await import('../../lib/s3Client.js')
  const config = getS3Config()
  const client = getS3Client()

  const response = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: photoKey })
  )

  if (!response.Body) throw new Error('Dog photo S3 object is empty')

  const chunks: Buffer[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Normalize breed input via a quick LLM call (handles voice transcripts like
 * "he's a lab pit mix" → "Labrador/Pit Bull mix").
 */
async function normalizeBreed(rawBreed: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return rawBreed

  const model = process.env.AI_CARE_MODEL || 'gpt-4o-mini'
  const openai = new OpenAI({ apiKey })

  try {
    const response = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: 'system',
          content:
            'You are a dog breed identifier. Given raw user input (possibly from voice transcription), return only the clean, concise breed name(s). Examples: "lab pit mix" → "Labrador/Pit Bull mix", "golden" → "Golden Retriever", "he is a border collie" → "Border Collie". Return only the breed name(s), nothing else.'
        },
        { role: 'user', content: rawBreed }
      ]
    })
    return response.choices[0]?.message?.content?.trim() || rawBreed
  } catch {
    return rawBreed
  }
}

function setStep(steps: Record<string, StepRecord>, step: string, status: StepRecord['status'], error?: string): Record<string, StepRecord> {
  return {
    ...steps,
    [step]: {
      status,
      ...(status === 'running' ? { startedAt: new Date().toISOString() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
      ...(error ? { error } : {})
    }
  }
}

/**
 * Run the full sprite generation pipeline for a session.
 * Advances `currentStep` and `progress` in the DB after each major phase.
 */
export async function runSpriteGenerationSession(sessionId: string): Promise<void> {
  const session = await prisma.spriteGenerationSession.findUniqueOrThrow({
    where: { id: sessionId }
  })

  let steps: Record<string, StepRecord> = (session.steps as Record<string, StepRecord>) || {}

  async function advance(
    step: string,
    progress: number,
    fn: () => Promise<void>
  ) {
    steps = setStep(steps, step, 'running')
    await prisma.spriteGenerationSession.update({
      where: { id: sessionId },
      data: {
        currentStep: step as 'NORMALIZE_INPUT' | 'BUILD_BASE_REFERENCE' | 'GENERATE_FRAMES' | 'POST_PROCESS' | 'VALIDATE' | 'UPLOAD' | 'FINALIZE',
        progress,
        steps: steps as object
      }
    })
    try {
      await fn()
      steps = setStep(steps, step, 'completed')
    } catch (err) {
      steps = setStep(steps, step, 'failed', String(err))
      throw err
    }
  }

  // --- NORMALIZE_INPUT ---
  let normalizedBreed = session.normalizedBreed
  await advance('NORMALIZE_INPUT', 2, async () => {
    normalizedBreed = await normalizeBreed(session.breedInput)
    await prisma.spriteGenerationSession.update({
      where: { id: sessionId },
      data: { normalizedBreed, steps: steps as object }
    })
  })

  // --- BUILD_BASE_REFERENCE + GENERATE_FRAMES ---
  // Download dog photo
  let dogPhotoBuffer: Buffer | null = null
  await advance('BUILD_BASE_REFERENCE', 5, async () => {
    dogPhotoBuffer = await downloadPhotoBuffer(session.sourcePhotoKey)
  })

  const starkStyleBuffer = loadStarkStyleReference()

  // Create the SpriteSet record (status=PENDING)
  const spriteSet = await prisma.spriteSet.create({
    data: {
      dogId: session.dogId,
      userId: session.userId,
      status: 'PENDING',
      storagePrefix: buildSpriteStoragePrefix(session.userId, session.dogId, 'placeholder'),
      manifest: {},
      styleVersion: SPRITE_STYLE_VERSION,
      isActive: false
    }
  })

  // Update storagePrefix with real spriteSetId
  const storagePrefix = buildSpriteStoragePrefix(session.userId, session.dogId, spriteSet.id)
  await prisma.spriteSet.update({
    where: { id: spriteSet.id },
    data: { storagePrefix }
  })

  await prisma.spriteGenerationSession.update({
    where: { id: sessionId },
    data: { spriteSetId: spriteSet.id }
  })

  let generationOutput: Awaited<ReturnType<typeof generateSpriteSet>> | null = null
  let framesComplete = 0

  await advance('GENERATE_FRAMES', 10, async () => {
    generationOutput = await generateSpriteSet(
      {
        referenceImage: dogPhotoBuffer!,
        styleReference: starkStyleBuffer ?? dogPhotoBuffer!,
        breed: normalizedBreed ?? session.breedInput
      },
      {
        onProgress: async (event) => {
          framesComplete = event.framesComplete
          await prisma.spriteGenerationSession.update({
            where: { id: sessionId },
            data: { progress: event.progress }
          })
        }
      }
    )
  })

  // --- UPLOAD ---
  await advance('UPLOAD', 92, async () => {
    if (!generationOutput) throw new Error('No generation output to upload')

    for (const [key, buffer] of generationOutput.frames.entries()) {
      const parts = key.split('_')
      const animation = parts.slice(0, -1).join('_') as SpriteAnimation
      const frameIndex = parseInt(parts[parts.length - 1]!, 10) - 1

      await putSpriteFrame(session.userId, session.dogId, spriteSet.id, animation, frameIndex, buffer)
    }
  })

  // --- FINALIZE ---
  await advance('FINALIZE', 98, async () => {
    if (!generationOutput) throw new Error('No generation output to finalize')

    // Deactivate any prior sprite sets for this dog
    await prisma.spriteSet.updateMany({
      where: { dogId: session.dogId, isActive: true, NOT: { id: spriteSet.id } },
      data: { isActive: false }
    })

    await prisma.spriteSet.update({
      where: { id: spriteSet.id },
      data: {
        status: 'COMPLETED',
        manifest: generationOutput.manifest as object,
        isActive: true
      }
    })

    await prisma.spriteGenerationSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        progress: 100,
        steps: steps as object
      }
    })
  })
}
