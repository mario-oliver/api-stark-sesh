import { initChatModel } from 'langchain'

const AGENT_TIMEOUT_MS = 30_000

export async function createCampaignFunnelModel() {
  const model = await initChatModel(process.env.AI_MODEL || 'gpt-4o-mini', {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '8000', 10)
  })
  return model
}

export async function invokeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs = AGENT_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Agent timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}
