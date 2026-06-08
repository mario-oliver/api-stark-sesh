import type { SpriteAnimation } from './types.js'

export const SYSTEM_PROMPT = `You are a pixel-art sprite illustrator creating a premium companion sprite for a dog care app.

Style rules (enforce on every frame):
- Flat vector illustration, NOT photograph or realistic render
- Clean solid outlines, limited color palette (5–8 colors max), no gradients or photorealism
- Pure transparent background — the dog is the only opaque content
- Strict side-profile view (dog facing RIGHT) with consistent body proportions across all frames
- Warm, calm, premium — appropriate for aging-dog health care context
- The dog should clearly read as the given breed but remains stylized, not a breed diagram
- Frame size: 1024×1024, centered subject, generous transparent margin on all sides
- No shadows on the ground; soft cast shadow under the dog is acceptable
- Consistent character identity across frames: same colors, markings, body shape, proportions`

const IDLE_POSES: Record<number, string> = {
  0: 'Relaxed standing pose, weight evenly distributed, head held naturally, ears slightly forward, tail at rest horizontal, mouth gently closed. This is the base reference frame.',
  1: 'Subtle weight shift: the left front paw lifts very slightly off the ground, body almost identical to frame 1, tail curves 5° upward.',
  2: 'Head tilts 8° to the right with curious expression, mouth slightly parted. Paws back on ground.',
  3: 'Gentle chest rise — breathing in: ribcage visible very slightly expanded, tail returns to horizontal.',
  4: 'Head returns to center, ears perk forward attentively. Body identical to frame 1.'
}

const RUN_POSES: Record<number, string> = {
  0: 'Mid-stride: front-left leg and rear-right leg fully extended forward, front-right and rear-left legs tucked back. Body low and stretched, ears back, mouth open in joyful pant, tail streaming behind.',
  1: 'Peak suspension: all four legs tucked under body, body at maximum stretch, tail arcing up.',
  2: 'Landing stride mirror: front-right and rear-left extended forward, front-left and rear-right tucked back. Body rising.'
}

const BARK_POSES: Record<number, string> = {
  0: 'Bark open: alert stance, weight on front legs, head raised 15°, mouth wide open mid-bark, tongue visible, ears fully erect, tail raised.',
  1: 'Bark closed: mouth snapping shut, jaw still slightly open, ears still erect, identical body position to frame 1.'
}

const ANIMATION_POSES: Record<SpriteAnimation, Record<number, string>> = {
  idle: IDLE_POSES,
  run: RUN_POSES,
  bark: BARK_POSES
}

export function buildBaseReferencePrompt(breed: string): string {
  return `Create a flat vector illustration model sheet for a ${breed} dog that will be used as the character reference for a sprite animation.

Show the dog in a clean standing side-profile view facing right. The dog should have:
- Clearly readable ${breed} breed characteristics but illustrated in flat vector style
- Consistent color palette that will be used across all animation frames
- Warm, friendly expression
- Pure transparent background

This image will be used as the reference to generate multiple animation frames, so ensure the proportions and color palette are well-defined and consistent.

${SYSTEM_PROMPT}`
}

export function buildFramePrompt(
  animation: SpriteAnimation,
  frameIndex: number,
  breed: string
): string {
  const pose = ANIMATION_POSES[animation][frameIndex] ?? 'Side-profile standing pose, transparent background.'
  const animLabel = animation === 'idle' ? 'breathing/idle cycle' : animation === 'run' ? 'running animation' : 'barking animation'

  return `Create frame ${frameIndex + 1} of the ${animLabel} for a ${breed} dog sprite.

Pose for this frame: ${pose}

Critical requirements:
- MATCH the character design, colors, and proportions EXACTLY from the provided reference images
- Pure transparent background
- Side-profile facing RIGHT
- Flat vector illustration style consistent with reference
- The character must be IDENTICAL across frames — only the pose changes

${SYSTEM_PROMPT}`
}
