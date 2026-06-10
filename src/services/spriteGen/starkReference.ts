import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SpriteAnimation } from './engine/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = join(__dirname, '../../../../assets/stark-reference')

/**
 * Load a Stark reference frame as a Buffer. Returns null if the file does not
 * exist — callers should proceed gracefully (generation still works without it).
 */
export function loadStarkReferenceFrame(
  animation: SpriteAnimation,
  frameIndex: number
): Buffer | null {
  const padded = String(frameIndex + 1).padStart(3, '0')
  const filename = `${animation}_${padded}.png`
  const filepath = join(ASSETS_DIR, animation, filename)

  if (!existsSync(filepath)) {
    return null
  }

  try {
    return readFileSync(filepath)
  } catch {
    return null
  }
}

/**
 * Load a single Stark style reference image (first idle frame as canonical style).
 * Returns null if not present.
 */
export function loadStarkStyleReference(): Buffer | null {
  return loadStarkReferenceFrame('idle', 0)
}
