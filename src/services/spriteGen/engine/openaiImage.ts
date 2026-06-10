import OpenAI, { toFile } from 'openai'
import { getSpriteImageModel } from '../../../config/s3.js'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
    client = new OpenAI({ apiKey })
  }
  return client
}

type EditImageArgs = {
  images: Buffer[]
  prompt: string
  size?: '1024x1024' | '1024x1536' | '1536x1024'
}

export async function editImage({ images, prompt, size = '1024x1024' }: EditImageArgs): Promise<Buffer> {
  const openai = getClient()
  const model = getSpriteImageModel()

  const imageFiles = await Promise.all(
    images.map((buf, i) =>
      toFile(buf, `reference_${i}.png`, { type: 'image/png' })
    )
  )

  // Use non-streaming overload via type cast; gpt-image-1 always returns b64_json
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response: { data?: Array<{ b64_json?: string }> } = await (openai.images.edit as any)({
    model,
    image: imageFiles,
    prompt,
    background: 'transparent',
    size,
    output_format: 'png'
  })

  const b64 = response.data?.[0]?.b64_json
  if (!b64) {
    throw new Error('OpenAI image edit returned no image data')
  }

  return Buffer.from(b64, 'base64')
}
