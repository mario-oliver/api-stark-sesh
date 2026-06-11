import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { DAILY_LOG_EXTRACTION_SYSTEM, buildTranscriptBlock } from './prompts.js'
import {
  dailyLogExtractionSchema,
  type DailyLogContext,
  type DailyLogExtraction
} from './types.js'

/**
 * The single DAILY_LOG extraction pass (ADR-0003 decision 1). Unlike the
 * exercise/audit agents this is one stateless structured-output call — no
 * multi-turn graph yet. It is its own module so the session service can be
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
}): Promise<DailyLogExtraction> {
  const model = getModel().withStructuredOutput(dailyLogExtractionSchema, {
    name: 'daily_log_extraction'
  })

  return model.invoke([
    new SystemMessage(DAILY_LOG_EXTRACTION_SYSTEM),
    new HumanMessage(buildTranscriptBlock(input.context))
  ])
}
