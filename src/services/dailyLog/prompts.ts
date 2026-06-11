import type { DailyLogContext } from './types.js'

export function buildTranscriptBlock(ctx: DailyLogContext): string {
  const plannedBlock = ctx.plannedActions.length
    ? ctx.plannedActions
        .map(
          a =>
            `- dailyCareActionId=${a.dailyCareActionId} | name="${a.name}" | bucket=${a.bucket} | status=${a.status}`
        )
        .join('\n')
    : '(no actions planned for today)'

  return [
    `Dog: ${ctx.dogName} (id=${ctx.dogId})`,
    "Today's planned care actions — match reported completions against these by name + bucket:",
    plannedBlock,
    'Caregiver voice transcript:',
    ctx.transcript
  ].join('\n')
}

export const DAILY_LOG_EXTRACTION_SYSTEM = [
  'You read a caregiver\'s voice transcript about a dog in physical therapy and extract three things: COMPLETIONS of today\'s planned care actions, ad-hoc care ACTIONS, and structured health OBSERVATIONS.',
  'You are NOT a veterinarian. Never diagnose or prescribe. Medication is care, never an observation — do not emit it as an observation.',
  'COMPLETIONS are activities the caregiver reports DOING that match one of "Today\'s planned care actions" above. Match by name and bucket. For each match emit: the exact dailyCareActionId from that list; nameSnapshot and bucket copied from the matched action; actualReps and actualDurationSeconds when stated, else null; tolerance (GOOD/OKAY/POOR/PAINFUL/UNKNOWN) when the caregiver conveys how it went, else null; an extractionConfidence in [0,1]; and needsReview true when anything had to be guessed. NEVER invent a dailyCareActionId — only use ids from the provided list. If a reported activity matches NO planned action, do NOT emit a completion for it — emit it as an ad-hoc action instead.',
  'ad-hoc ACTIONS are care activities the caregiver reports DOING that are NOT on today\'s plan (a surprise walk, an extra stretch, a recovery tool). For each: a short name; a bucket (ACTIVITY = exercise/walks, MOBILITY = stretches/range-of-motion, RECOVERY = laser/heat/swim/medication); actualReps and actualDurationSeconds when stated, else null; an extractionConfidence in [0,1]; and needsReview true when the bucket or any field had to be guessed. Always choose the single best-fit bucket — never omit it — and set needsReview when unsure.',
  'OBSERVATIONS are things NOTICED, not done (limping, low energy, slipping, soreness, appetite, bathroom changes). For each: type (the closest taxonomy value), an optional severity and bodyArea, a short free-text note, an extractionConfidence in [0,1], and needsReview true when a field had to be guessed or the transcript was ambiguous. Use null for severity/bodyArea you cannot infer, and set needsReview true rather than inventing a value.',
  'If the transcript contains nothing loggable, return empty completions, adHocActions, and observations arrays and a brief message saying nothing was found to log.',
  'Always return planChangeSuggestions as an empty array.',
  'Return JSON only.'
].join(' ')
