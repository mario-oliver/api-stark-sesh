import type { SpriteAnimation } from './types.js'
import { editImage } from './openaiImage.js'
import { postProcessFrame } from './postProcess.js'
import { validateFrame } from './validateFrame.js'
import { buildFramePrompt } from './prompts.js'

const MAX_RETRIES = 3

type GenerateFrameArgs = {
  animation: SpriteAnimation
  frameIndex: number
  breed: string
  baseReference: Buffer
  priorFrame: Buffer | null
  starkPoseFrame: Buffer | null
}

/**
 * Generate a single animation frame, post-process, and validate.
 * Retries up to MAX_RETRIES times on validation failure.
 */
export async function generateFrame(args: GenerateFrameArgs): Promise<Buffer> {
  const { animation, frameIndex, breed, baseReference, priorFrame, starkPoseFrame } = args
  const prompt = buildFramePrompt(animation, frameIndex, breed)

  const references: Buffer[] = [baseReference]
  if (priorFrame) references.push(priorFrame)
  if (starkPoseFrame) references.push(starkPoseFrame)

  let lastError: string | null = null
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const raw = await editImage({ images: references, prompt })
    const processed = await postProcessFrame(raw)
    const validation = await validateFrame(processed)

    if (validation.ok) {
      return processed
    }

    lastError = validation.reason
    console.warn(
      `[spriteGen] frame ${animation}[${frameIndex}] validation failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastError}`
    )
  }

  throw new Error(
    `Failed to generate valid frame ${animation}[${frameIndex}] after ${MAX_RETRIES} attempts. Last error: ${lastError}`
  )
}
