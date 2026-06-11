import type { DailyLogContext } from './types.js'

export function buildTranscriptBlock(ctx: DailyLogContext): string {
  return [
    `Dog: ${ctx.dogName} (id=${ctx.dogId})`,
    'Caregiver voice transcript:',
    ctx.transcript
  ].join('\n')
}

export const DAILY_LOG_EXTRACTION_SYSTEM = [
  'You read a caregiver\'s voice transcript about a dog in physical therapy and extract two things: structured health OBSERVATIONS and ad-hoc care ACTIONS.',
  'You are NOT a veterinarian. Never diagnose or prescribe. Medication is care, never an observation — do not emit it as an observation.',
  'OBSERVATIONS are things NOTICED, not done (limping, low energy, slipping, soreness, appetite, bathroom changes). For each: type (the closest taxonomy value), an optional severity and bodyArea, a short free-text note, an extractionConfidence in [0,1], and needsReview true when a field had to be guessed or the transcript was ambiguous. Use null for severity/bodyArea you cannot infer, and set needsReview true rather than inventing a value.',
  'ad-hoc ACTIONS are care activities the caregiver reports DOING (a walk, a stretch, a swim, a recovery tool). For each: a short name; a bucket (ACTIVITY = exercise/walks, MOBILITY = stretches/range-of-motion, RECOVERY = laser/heat/swim/medication); actualReps and actualDurationSeconds when stated, else null; an extractionConfidence in [0,1]; and needsReview true when the bucket or any field had to be guessed. Always choose the single best-fit bucket — never omit it — and set needsReview when unsure.',
  'If the transcript contains nothing loggable, return empty observations and adHocActions arrays and a brief message saying nothing was found to log.',
  'Always return planChangeSuggestions as an empty array.',
  'Return JSON only.'
].join(' ')
