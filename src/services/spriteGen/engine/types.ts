export type SpriteAnimation = 'idle' | 'run' | 'bark'

export type AnimationSpec = {
  animation: SpriteAnimation
  frameCount: number
  fps: number
  loop: boolean
}

export const DEFAULT_ANIMATION_SPECS: AnimationSpec[] = [
  { animation: 'idle', frameCount: 5, fps: 4, loop: true },
  { animation: 'run', frameCount: 3, fps: 6, loop: true },
  { animation: 'bark', frameCount: 2, fps: 4, loop: true }
]

export type SpriteGenInput = {
  referenceImage: Buffer
  styleReference: Buffer
  breed: string
  animations?: AnimationSpec[]
  frameSize?: number
}

export type FrameResult = {
  key: string
  animation: SpriteAnimation
  frameIndex: number
  buffer: Buffer
}

export type AnimationManifestEntry = {
  frames: number
  fps: number
  loop: boolean
  keys: string[]
}

export type SpriteGenManifest = {
  styleVersion: string
  breed: string
  generatedAt: string
  animations: Record<SpriteAnimation, AnimationManifestEntry>
}

export type SpriteGenOutput = {
  manifest: SpriteGenManifest
  frames: Map<string, Buffer>
}

export type ProgressEvent = {
  step: string
  framesComplete: number
  framesTotal: number
  progress: number
}
