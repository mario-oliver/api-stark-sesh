import sharp from 'sharp'
import { getSpriteFrameSize } from '../../../config/s3.js'

export type FrameValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

/**
 * Validates a post-processed frame PNG:
 * - Correct dimensions (targetSize × targetSize)
 * - Has alpha channel
 * - Non-empty (not fully transparent)
 */
export async function validateFrame(buffer: Buffer): Promise<FrameValidationResult> {
  const targetSize = getSpriteFrameSize()

  let metadata: sharp.Metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch (err) {
    return { ok: false, reason: `Failed to read image metadata: ${String(err)}` }
  }

  if (metadata.width !== targetSize || metadata.height !== targetSize) {
    return {
      ok: false,
      reason: `Expected ${targetSize}×${targetSize}, got ${metadata.width}×${metadata.height}`
    }
  }

  if (!metadata.hasAlpha) {
    return { ok: false, reason: 'Frame has no alpha channel' }
  }

  // Check the image has some non-transparent pixels
  const stats = await sharp(buffer).stats()
  const alphaChannel = stats.channels[3]
  if (alphaChannel && alphaChannel.max === 0) {
    return { ok: false, reason: 'Frame is fully transparent (empty)' }
  }

  return { ok: true }
}
