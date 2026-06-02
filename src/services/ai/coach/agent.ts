import { createAgent, initChatModel } from 'langchain'
import { MemorySaver } from '@langchain/langgraph'
import type { VectorStore } from '@langchain/core/vectorstores'
import { HARADA_COACH_SYSTEM_PROMPT } from './prompts.js'
import { createRAGTool } from './tools/ragTool.js'
// import { createBoardContextTool } from './tools/boardContextTool.js'
// import { analyzeBoardTool } from './tools/analysisTool.js'

export async function createHaradaCoachAgent(vectorStore?: VectorStore | null) {
  // Initialize model
  // Note: For reasoning models (like gpt-5-nano), tokens are used for both
  // internal reasoning and the actual response. We need a higher limit.
  const model = await initChatModel(process.env.AI_MODEL, {
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '8000')
    // timeout: 30000
  })

  // Create tools (RAG only when PGVectorStore is available)
  // const boardContextTool = createBoardContextTool(prisma)
  const tools = vectorStore ? [createRAGTool(vectorStore)] : []

  // Create agent with streaming support. Type assertion avoids TS2589 (excessively deep instantiation).
  const agent = createAgent({
    model,
    systemPrompt: HARADA_COACH_SYSTEM_PROMPT,
    tools,
    checkpointer: new MemorySaver() // For conversation state
  })

  return agent as unknown as HaradaCoachAgent
}

/** Minimal agent type to avoid TS2589 from LangChain's deep generics. */
export interface HaradaCoachAgent {
  stream(
    input: { messages: Array<{ role: string; content: string }> },
    config: { configurable: { thread_id: string } }
  ): Promise<AsyncIterable<unknown>>
}

/** Typed stream chunk to avoid deep inference in for-await loop. */
interface StreamChunk {
  model_request?: {
    messages?: Array<{
      content?: string
      tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
      usage_metadata?: {
        input_tokens?: number
        output_tokens?: number
        total_tokens?: number
        output_token_details?: { reasoning?: number }
      }
    }>
  }
  messages?: Array<{ content?: string }>
  tools?: Record<string, unknown>
}

export interface StreamMetrics {
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  toolsCalled: Array<{ name: string; args: Record<string, unknown> }>
  fullResponse: string
}

export async function* streamCoachResponse(
  agent: HaradaCoachAgent,
  sheetId: string,
  userMessage: string,
  threadId: string
) {
  const config = {
    configurable: { thread_id: threadId }
  }

  // Metrics tracking
  const metrics: StreamMetrics = {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    toolsCalled: [],
    fullResponse: ''
  }

  // Add board context to the message
  const enhancedMessage = `User's question: ${userMessage}\n\nPlease use get_board_context with sheetId: ${sheetId} to understand their current board state.`

  // Stream agent response
  const stream = await agent.stream({ messages: [{ role: 'user', content: enhancedMessage }] }, config)

  for await (const rawChunk of stream) {
    const chunk = rawChunk as StreamChunk
    console.log('Chunk received:', JSON.stringify(chunk, null, 2))

    // Handle model_request chunks (contains messages)
    if (chunk.model_request?.messages) {
      const latestMessage = chunk.model_request.messages.at(-1)
      console.log(`Agent message:`, latestMessage)

      // Track token usage
      if (latestMessage?.usage_metadata) {
        const usage = latestMessage.usage_metadata
        metrics.promptTokens = usage.input_tokens || 0
        metrics.completionTokens = usage.output_tokens || 0
        metrics.totalTokens = usage.total_tokens || 0
        // Reasoning tokens from output_token_details
        if (usage.output_token_details?.reasoning) {
          metrics.reasoningTokens = usage.output_token_details.reasoning
        }
      }

      // Check if it's an AI message with content
      if (latestMessage?.content) {
        metrics.fullResponse += latestMessage.content
        yield {
          type: 'text',
          content: latestMessage.content
        }
      }

      // Check for tool calls in the message
      if (latestMessage?.tool_calls && latestMessage.tool_calls.length > 0) {
        for (const toolCall of latestMessage.tool_calls) {
          // Track tool call
          metrics.toolsCalled.push({
            name: toolCall.name,
            args: toolCall.args
          })

          yield {
            type: 'tool_call',
            toolName: toolCall.name,
            toolInput: toolCall.args
          }
        }
      }
    }

    // Handle direct messages if they exist
    if (chunk.messages && !chunk.model_request) {
      const latestMessage = chunk.messages.at(-1)
      if (latestMessage?.content) {
        metrics.fullResponse += latestMessage.content
        yield {
          type: 'text',
          content: latestMessage.content
        }
      }
    }

    // Handle tool results if they come in a different format
    if (chunk.tools) {
      for (const [toolName, toolCall] of Object.entries(chunk.tools)) {
        yield {
          type: 'tool_result',
          toolName,
          toolResult: toolCall
        }
      }
    }
  }

  // Send threadId and metrics back to caller
  yield { type: 'done', threadId, metrics }
}
