import sharp from 'sharp'
import { getSpriteFrameSize } from '../../../config/s3.js'

/**
 * Trim transparent border, center-pad to square, resize to target size, and
 * enforce RGBA PNG output with alpha channel.
 */
export async function postProcessFrame(input: Buffer): Promise<Buffer> {
  const targetSize = getSpriteFrameSize()

  const img = sharp(input).ensureAlpha()

  const trimmed = await img.trim({ threshold: 10 }).toBuffer({ resolveWithObject: true })

  const { width = 0, height = 0 } = trimmed.info
  const maxDim = Math.max(width, height, 1)

  const padded = await sharp(trimmed.data)
    .extend({
      top: Math.floor((maxDim - height) / 2),
      bottom: Math.ceil((maxDim - height) / 2),
      left: Math.floor((maxDim - width) / 2),
      right: Math.ceil((maxDim - width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .resize(targetSize, targetSize, { fit: 'fill' })
    .png()
    .toBuffer()

  return padded
}
