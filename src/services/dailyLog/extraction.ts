import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  DAILY_LOG_EXTRACTION_SYSTEM,
  DAILY_LOG_RESOLUTION_SYSTEM,
  buildClarificationBlock,
  buildTranscriptBlock
} from './prompts.js'
import {
  dailyLogExtractionSchema,
  type DailyLogContext,
  type DailyLogExtraction
} from './types.js'

/**
 * The DAILY_LOG extraction pass (ADR-0003 decision 1). Unlike the exercise/audit
 * agents this is one stateless structured-output call — no multi-turn graph yet.
 * Passing `clarification` switches it to the one-round RESOLUTION pass (issue 0014):
 * the caregiver's answer is appended after the transcript and the no-more-questions
 * system prompt is used. It is its own module so the session service can be
 * unit-tested with this seam module-mocked (no OpenAI, deterministic output).
 */

function getModel() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = process.env.AI_DAILY_LOG_MODEL || process.env.AI_CARE_MODEL || 'gpt-4o-mini'
  return new ChatOpenAI({ apiKey, model, temperature: 0.2 })
}

export async function runDailyLogExtraction(input: {
  context: DailyLogContext
  clarification?: { questions: string[]; answer: string }
}): Promise<DailyLogExtraction> {
  const model = getModel().withStructuredOutput(dailyLogExtractionSchema, {
    name: 'daily_log_extraction'
  })

  const messages = [
    new SystemMessage(input.clarification ? DAILY_LOG_RESOLUTION_SYSTEM : DAILY_LOG_EXTRACTION_SYSTEM),
    new HumanMessage(buildTranscriptBlock(input.context))
  ]
  if (input.clarification) {
    messages.push(new HumanMessage(buildClarificationBlock(input.clarification)))
  }

  return model.invoke(messages)
}
