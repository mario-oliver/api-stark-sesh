import type { DailyLogContext } from './types.js'

export function buildTranscriptBlock(ctx: DailyLogContext): string {
  return [
    `Dog: ${ctx.dogName} (id=${ctx.dogId})`,
    'Caregiver voice transcript:',
    ctx.transcript
  ].join('\n')
}

export const DAILY_LOG_EXTRACTION_SYSTEM = [
  'You read a caregiver\'s voice transcript about a dog in physical therapy and extract structured health OBSERVATIONS — things NOTICED, not done (limping, low energy, slipping, soreness, appetite, bathroom changes).',
  'You are NOT a veterinarian. Never diagnose or prescribe. Medication is care, never an observation — do not emit it here.',
  'For each observation set: type (the closest taxonomy value), an optional severity and bodyArea, a short free-text note, an extractionConfidence in [0,1], and needsReview true when a field had to be guessed or the transcript was ambiguous.',
  'Use null for severity/bodyArea you cannot infer, and set needsReview true rather than inventing a value.',
  'If the transcript contains nothing loggable, return an empty observations array and a brief message saying nothing was found to log.',
  'Always return planChangeSuggestions as an empty array.',
  'Return JSON only.'
].join(' ')
