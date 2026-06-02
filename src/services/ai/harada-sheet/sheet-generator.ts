import { initChatModel, SystemMessage, HumanMessage } from 'langchain'
import { HARADA_EXPERT_SYSTEM_PROMPT, createHaradaPrompt, createRedesignPrompt } from './prompts.js'
import { haradaSheetResponseSchema, type GeneratedHaradaSheet } from '../../../schemas/aiServiceSchemas.js'
import { retrieveHaradaContext } from '../rag.js'

export async function generateHaradaSheet(goalTitle: string, goalDescription: string): Promise<GeneratedHaradaSheet> {
  // Initialize model
  const model = await initChatModel(process.env.AI_MODEL, {
    // maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
    // timeout: 30000
  })

  // Bind structured output format
  const modelWithFormat = model.withStructuredOutput(haradaSheetResponseSchema)

  // Retrieve RAG context
  const ragContext = await retrieveHaradaContext(goalTitle, goalDescription)

  // Create messages following LangChain message format
  // Reference: https://docs.langchain.com/oss/javascript/langchain/messages
  const systemMessage = new SystemMessage(HARADA_EXPERT_SYSTEM_PROMPT)
  const userMessage = new HumanMessage(createHaradaPrompt(goalTitle, goalDescription, ragContext))
  // const userMessage = new HumanMessage(createHaradaPrompt(goalTitle, goalDescription))

  const messages = [systemMessage, userMessage]

  // Invoke model with structured output
  const response = await modelWithFormat.invoke(messages)

  // Validate response (zod schema ensures structure, but double-check)
  const validated = haradaSheetResponseSchema.parse(response)

  // Additional validation
  if (validated.pillars.length !== 8) {
    throw new Error('Generated sheet must have exactly 8 pillars')
  }

  for (const pillar of validated.pillars) {
    if (pillar.tasks.length !== 8) {
      throw new Error(`Pillar "${pillar.name}" must have exactly 8 tasks`)
    }
    if (pillar.position < 0 || pillar.position > 7) {
      throw new Error(`Pillar position must be 0-7, got ${pillar.position}`)
    }
    for (const task of pillar.tasks) {
      if (task.position < 0 || task.position > 7) {
        throw new Error(`Task position must be 0-7, got ${task.position}`)
      }
    }
  }

  return validated
}

export async function redesignHaradaSheet(
  currentSheet: {
    title: string
    mainGoal: string
    description?: string
    pillars: Array<{ name: string; description?: string; position: number; tasks: Array<{ label: string; description?: string; position: number }> }>
  },
  newGuidance: string
): Promise<GeneratedHaradaSheet> {
  // Initialize model
  const model = await initChatModel(process.env.AI_MODEL, {
    // maxTokens: parseInt(process.env.AI_MAX_TOKENS || '4000'),
    // timeout: 30000
  })

  // Bind structured output format
  const modelWithFormat = model.withStructuredOutput(haradaSheetResponseSchema)

  // Retrieve RAG context using the current goal and new guidance
  const ragContext = await retrieveHaradaContext(currentSheet.mainGoal, `${currentSheet.description || ''}\n\nNew guidance: ${newGuidance}`)

  // Create messages following LangChain message format
  const systemMessage = new SystemMessage(HARADA_EXPERT_SYSTEM_PROMPT)
  const userMessage = new HumanMessage(createRedesignPrompt(currentSheet, newGuidance, ragContext))

  const messages = [systemMessage, userMessage]

  // Invoke model with structured output
  const response = await modelWithFormat.invoke(messages)

  // Validate response (zod schema ensures structure, but double-check)
  const validated = haradaSheetResponseSchema.parse(response)

  // Additional validation
  if (validated.pillars.length !== 8) {
    throw new Error('Redesigned sheet must have exactly 8 pillars')
  }

  for (const pillar of validated.pillars) {
    if (pillar.tasks.length !== 8) {
      throw new Error(`Pillar "${pillar.name}" must have exactly 8 tasks`)
    }
    if (pillar.position < 0 || pillar.position > 7) {
      throw new Error(`Pillar position must be 0-7, got ${pillar.position}`)
    }
    for (const task of pillar.tasks) {
      if (task.position < 0 || task.position > 7) {
        throw new Error(`Task position must be 0-7, got ${task.position}`)
      }
    }
  }

  return validated
}
