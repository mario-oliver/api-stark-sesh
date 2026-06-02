import OpenAI, { toFile } from 'openai'

const defaultPrompt =
  'This transcript is about basketball. It may include coaching terms, plays, sets, player positions, and game strategy.'

/**
 * Transcribe audio using OpenAI's speech-to-text API (aligned with film-sesh lib/speech-to-text).
 * Uses gpt-4o-transcribe by default; accepts a Buffer from Fastify multipart and converts to File for the SDK.
 */
export async function transcribe(
  file: Buffer,
  options: { prompt?: string; model?: string } = {}
): Promise<{ text: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const openai = new OpenAI({ apiKey })
  const prompt = (options.prompt?.trim() || defaultPrompt).slice(0, 4096)

  const uploadable = await toFile(file, 'recording.wav', { type: 'audio/wav' })

  const transcription = await openai.audio.transcriptions.create({
    file: uploadable,
    model: options.model ?? 'gpt-4o-transcribe',
    response_format: 'json',
    prompt
  })

  const text =
    typeof transcription === 'string' ? transcription : transcription.text ?? ''
  return { text: text.trim() }
}
