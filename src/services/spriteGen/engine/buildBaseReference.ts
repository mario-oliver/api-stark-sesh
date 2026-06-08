import { editImage } from './openaiImage.js'
import { postProcessFrame } from './postProcess.js'
import { buildBaseReferencePrompt } from './prompts.js'

/**
 * Generate a canonical "model sheet" from the user's dog photo + the Stark
 * style reference. This base reference image is passed to all subsequent
 * frame generations to anchor consistent character identity.
 */
export async function buildBaseReference(args: {
  dogPhotoBuffer: Buffer
  starkStyleBuffer: Buffer
  breed: string
}): Promise<Buffer> {
  const prompt = buildBaseReferencePrompt(args.breed)

  const raw = await editImage({
    images: [args.dogPhotoBuffer, args.starkStyleBuffer],
    prompt
  })

  return postProcessFrame(raw)
}
