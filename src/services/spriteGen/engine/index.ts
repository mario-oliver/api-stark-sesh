import type {
  SpriteGenInput,
  SpriteGenOutput,
  SpriteGenManifest,
  AnimationSpec,
  ProgressEvent
} from './types.js'
import { DEFAULT_ANIMATION_SPECS } from './types.js'
import { buildBaseReference } from './buildBaseReference.js'
import { generateFrame } from './generateFrame.js'

function frameKey(animation: string, frameIndex: number): string {
  const padded = String(frameIndex + 1).padStart(3, '0')
  return `${animation}_${padded}`
}

/**
 * Pure sprite generation engine — no Prisma, no S3, no HTTP.
 * Accepts raw buffers and returns manifest + frame buffers.
 * Extractable as a standalone product module.
 */
export async function generateSpriteSet(
  input: SpriteGenInput,
  options?: { onProgress?: (event: ProgressEvent) => void }
): Promise<SpriteGenOutput> {
  const specs: AnimationSpec[] = input.animations ?? DEFAULT_ANIMATION_SPECS
  const totalFrames = specs.reduce((sum, s) => sum + s.frameCount, 0)
  let framesComplete = 0

  const onProgress = options?.onProgress ?? (() => {})

  onProgress({ step: 'BUILD_BASE_REFERENCE', framesComplete: 0, framesTotal: totalFrames, progress: 0 })

  const baseReference = await buildBaseReference({
    dogPhotoBuffer: input.referenceImage,
    starkStyleBuffer: input.styleReference,
    breed: input.breed
  })

  const frames = new Map<string, Buffer>()
  const manifestAnimations: SpriteGenManifest['animations'] = {} as SpriteGenManifest['animations']

  for (const spec of specs) {
    const { animation, frameCount, fps, loop } = spec
    const keys: string[] = []
    let priorFrame: Buffer | null = null

    for (let i = 0; i < frameCount; i++) {
      onProgress({
        step: 'GENERATE_FRAMES',
        framesComplete,
        framesTotal: totalFrames,
        progress: 5 + Math.round((framesComplete / totalFrames) * 90)
      })

      const frameBuffer = await generateFrame({
        animation,
        frameIndex: i,
        breed: input.breed,
        baseReference,
        priorFrame,
        starkPoseFrame: null
      })

      const key = frameKey(animation, i)
      frames.set(key, frameBuffer)
      keys.push(key)
      priorFrame = frameBuffer
      framesComplete++
    }

    manifestAnimations[animation] = { frames: frameCount, fps, loop, keys }
  }

  const manifest: SpriteGenManifest = {
    styleVersion: 'v1',
    breed: input.breed,
    generatedAt: new Date().toISOString(),
    animations: manifestAnimations
  }

  onProgress({ step: 'FINALIZE', framesComplete: totalFrames, framesTotal: totalFrames, progress: 100 })

  return { manifest, frames }
}
