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

/**
 * The user's answer to the one round of clarifying questions (issue 0014). Appended
 * after the transcript block so the resolution pass sees the original utterance plus
 * the disambiguation, and can now place what it previously blocked on.
 */
export function buildClarificationBlock(clarification: {
  questions: string[]
  answer: string
}): string {
  return [
    'You previously asked the caregiver to clarify:',
    ...clarification.questions.map(q => `- ${q}`),
    'The caregiver answered:',
    clarification.answer
  ].join('\n')
}

export const DAILY_LOG_EXTRACTION_SYSTEM = [
  'You read a caregiver\'s voice transcript about a dog in physical therapy and extract three things: COMPLETIONS of today\'s planned care actions, ad-hoc care ACTIONS, and structured health OBSERVATIONS.',
  'You are NOT a veterinarian. Never diagnose or prescribe. Medication is care, never an observation — do not emit it as an observation.',
  'COMPLETIONS are activities the caregiver reports DOING that match one of "Today\'s planned care actions" above. Match by name and bucket. For each match emit: the exact dailyCareActionId from that list; nameSnapshot and bucket copied from the matched action; actualReps and actualDurationSeconds when stated, else null; tolerance (GOOD/OKAY/POOR/PAINFUL/UNKNOWN) when the caregiver conveys how it went, else null; an extractionConfidence in [0,1]; and needsReview true when anything had to be guessed. NEVER invent a dailyCareActionId — only use ids from the provided list. If a reported activity matches NO planned action, do NOT emit a completion for it — emit it as an ad-hoc action instead.',
  'ad-hoc ACTIONS are care activities the caregiver reports DOING that are NOT on today\'s plan (a surprise walk, an extra stretch, a recovery tool). For each: a short name; a bucket (ACTIVITY = exercise/walks, MOBILITY = stretches/range-of-motion, RECOVERY = laser/heat/swim/medication); actualReps and actualDurationSeconds when stated, else null; an extractionConfidence in [0,1]; and needsReview true when any field had to be guessed. Choose the single best-fit bucket whenever you reasonably can and set needsReview when unsure — only treat the bucket as a blocker (below) if it is genuinely impossible to tell which bucket the activity belongs to.',
  'OBSERVATIONS are things NOTICED, not done (limping, low energy, slipping, soreness, appetite, bathroom changes). For each: type (the closest taxonomy value), an optional severity and bodyArea, a short free-text note, an extractionConfidence in [0,1], and needsReview true when a field had to be guessed or the transcript was ambiguous. Use null for severity/bodyArea you cannot infer, and set needsReview true rather than inventing a value. If you cannot tell which observation TYPE applies at all, that is a blocker (below) — do not invent a type.',
  'BLOCKERS — ask, do not guess. Add ONE short clarifying question to questions[] ONLY when you genuinely cannot PLACE an item: (a) a reported completion is ambiguous between MULTIPLE of today\'s planned actions (you cannot tell which one), or (b) a REQUIRED field cannot be inferred (an observation\'s type, or an ad-hoc action\'s bucket). When you add a question, OMIT that unplaceable item from its array — do not also emit a guessed version of it. Soft uncertainty is NOT a blocker: missing reps, an uncertain severity, or a suspected duplicate stay in the draft with needsReview true and produce NO question. Keep questions[] empty whenever you can place everything.',
  'If the transcript contains nothing loggable, return empty completions, adHocActions, observations, and questions arrays and a brief message saying nothing was found to log.',
  'Always return planChangeSuggestions as an empty array.',
  'Return JSON only.'
].join(' ')

/**
 * The one-round RESOLUTION pass (issue 0014, ADR-0003 #5). Runs after the caregiver
 * answers the clarifying question. Identical extraction rules, but it must NOT ask
 * again: anything still uncertain after the answer is emitted best-effort with
 * needsReview true, and questions[] stays empty. (The service ignores any question
 * it returns anyway — the round is capped — but instruct it so the draft is sane.)
 */
export const DAILY_LOG_RESOLUTION_SYSTEM = [
  DAILY_LOG_EXTRACTION_SYSTEM,
  'The caregiver has now answered your clarifying question. Produce the FINAL draft: place every item you reasonably can using their answer. Do NOT ask any more questions — return questions[] as an empty array. For anything still uncertain after the answer, make your best-effort choice and set needsReview true rather than asking again.'
].join(' ')
