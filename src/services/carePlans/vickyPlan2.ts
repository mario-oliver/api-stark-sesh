import type {
  CareActionFrequency,
  CareActionTier,
  CareActionTimeOfDay,
  CareBucket
} from '../../generated/client.js'

/**
 * Vicky's Plan 2 (issued June 26, 2026) — the authoritative seed content for
 * Stark's second CarePlan. This is a DATA file: the 15 CareAction rows verbatim
 * from Vicky's plan doc + email guidance (ADR-0004 §2–3, PRD "Plan 2 seed
 * content"). Changing a row here is an outer-loop decision.
 *
 * Conventions (frozen):
 *  - `sortOrder` = listed order (1-based).
 *  - Dosage ints carry the UPPER bound of Vicky's range; the verbatim range text
 *    stays in `instructions`.
 *  - `timeOfDay` is ANYTIME throughout.
 *  - Unlisted numeric fields are null.
 *  - `AS_NEEDED` rows carry AS_NEEDED for BOTH tier and frequency (context.md#
 *    instantiation: never auto-instantiated into Today).
 */

export type VickyPlanAction = {
  name: string
  bucket: CareBucket
  tier: CareActionTier
  frequency: CareActionFrequency
  timeOfDay: CareActionTimeOfDay
  daysPerWeek: number | null
  targetReps: number | null
  targetHoldSeconds: number | null
  targetSets: number | null
  restBetweenSetsSeconds: number | null
  targetDurationSeconds: number | null
  referenceUrl: string | null
  instructions: string
  sortOrder: number
}

export const VICKY_PLAN_2_NAME = 'Plan 2 — June 26, 2026'

/** Plan-level dosing notes, exported for UI copy reuse. */
export const VICKY_PLAN_2_NOTES =
  'Perform exercises 3 to 4 days a week. Start with 1 set of exercises. Progress ' +
  'to 2 sets, resting 2 to 4 minutes in between sets. If doing a set, focus on ' +
  'the top 4: step up with head stretches, walk-through with hind legs on the ' +
  'platform, sit-to-stands, and the pole exercise.'

function romInstructions(joint: 'elbow' | 'shoulder' | 'hip'): string {
  return (
    `Lying on his side, as relaxed as possible. Gently move the ${joint} through ` +
    'flexion and extension only to the point of resistance; hold a few seconds at ' +
    'end range. 10–15 movements, 4–7 days/week, once or twice daily as needed.'
  )
}

export const VICKY_PLAN_2_ACTIONS: VickyPlanAction[] = [
  {
    name: 'Step Up + Head Stretch — Left',
    bucket: 'MOBILITY',
    tier: 'CORE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 3,
    targetReps: 5,
    targetHoldSeconds: 3,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Front feet on a low raised non-slip platform, back legs on a non-slip ' +
      'surface. Use a treat to guide a very slight head stretch toward the left ' +
      'hip; hold 2–3 seconds. 3–5 stretches per side, 3 days/week. (Plan: ' +
      "'Front Feet on Raised Platform — Cookie Stretches'; Vicky's top-4: 'step " +
      "up with left and right head stretch.')",
    sortOrder: 1
  },
  {
    name: 'Step Up + Head Stretch — Right',
    bucket: 'MOBILITY',
    tier: 'CORE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 3,
    targetReps: 5,
    targetHoldSeconds: 3,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Front feet on a low raised non-slip platform, back legs on a non-slip ' +
      'surface. Use a treat to guide a very slight head stretch toward the right ' +
      'hip; hold 2–3 seconds. 3–5 stretches per side, 3 days/week. (Plan: ' +
      "'Front Feet on Raised Platform — Cookie Stretches'; Vicky's top-4: 'step " +
      "up with left and right head stretch.')",
    sortOrder: 2
  },
  {
    name: 'Walk-Through, Hind Legs on Platform',
    bucket: 'ACTIVITY',
    tier: 'CORE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 3,
    targetReps: 3,
    targetHoldSeconds: 10,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Walk over the low platform and pause with hind legs on the platform, front ' +
      'legs on the floor; hold 5–10 seconds. 3 repetitions, 3 days/week. (Plan: ' +
      "'Hind Wobble Cushion' walk-through; Vicky's top-4.)",
    sortOrder: 3
  },
  {
    name: 'Modified Sit to Stand on Knee',
    bucket: 'ACTIVITY',
    tier: 'CORE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 3,
    targetReps: 4,
    targetHoldSeconds: null,
    targetSets: 2,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Requires two people: one kneels behind Stark, one stands in front. Guide ' +
      'him to sit with the kneeling person supporting alignment, then stand. 3–4 ' +
      'sit-to-stands, 1–2 sets, on a non-slip surface, 3 days/week. (Vicky\'s ' +
      'top-4.)',
    sortOrder: 4
  },
  {
    name: 'Ground Poles',
    bucket: 'ACTIVITY',
    tier: 'CORE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 3,
    targetReps: 6,
    targetHoldSeconds: null,
    targetSets: 2,
    restBetweenSetsSeconds: 120,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Encourage a steady controlled walk over the pole(s), 4–6 passes back and ' +
      'forth per set, 1–2 sets, resting ~2 minutes between sets. Start with 1 ' +
      'pole, secured so it cannot roll, on a non-slip surface. He may catch the ' +
      'pole at first — improves with repetition. 3 days/week. (Vicky\'s top-4.)',
    sortOrder: 5
  },
  {
    name: 'Backing Up',
    bucket: 'ACTIVITY',
    tier: 'AS_NEEDED',
    frequency: 'AS_NEEDED',
    timeOfDay: 'ANYTIME',
    daysPerWeek: null,
    targetReps: 3,
    targetHoldSeconds: null,
    targetSets: 1,
    restBetweenSetsSeconds: 180,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Stand in front with a treat at nose height and take small steps forward to ' +
      'encourage 4–6 backward steps; 2–3 repetitions. Alternatively block a narrow ' +
      'path and place the treat at the end. Vicky (email): do as needed — when ' +
      'putting on booties, ask for back-ups periodically.',
    sortOrder: 6
  },
  {
    name: 'All Four Leg Lifts',
    bucket: 'ACTIVITY',
    tier: 'AS_NEEDED',
    frequency: 'AS_NEEDED',
    timeOfDay: 'ANYTIME',
    daysPerWeek: null,
    targetReps: 1,
    targetHoldSeconds: 10,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'Standing square with forward focus, lift one leg at a time by the carpus ' +
      '(front) or hock (hind); hold 5–10 seconds per paw. Encourages core ' +
      'stability and weight-shifting. Vicky (email): as needed (booties).',
    sortOrder: 7
  },
  {
    name: 'Large Circles',
    bucket: 'ACTIVITY',
    tier: 'ON_WALKS',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: null,
    targetReps: 2,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions:
      'On walks, guide Stark in 1–2 large circles in each direction; increase if ' +
      'able. Can be done multiple times daily. Vicky (email): do on walks.',
    sortOrder: 8
  },
  {
    name: 'Stairs Hip Stretch',
    bucket: 'MOBILITY',
    tier: 'ON_WALKS',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: null,
    targetReps: null,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: 'https://www.youtube.com/watch?v=DtUvGctKHdY',
    instructions:
      'Hip stretch on a set of stairs outside — start with just one step for now. ' +
      'Do on walks. (From Vicky\'s email; demo video linked.)',
    sortOrder: 9
  },
  {
    name: 'ROM — Elbow, Left',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('elbow'),
    sortOrder: 10
  },
  {
    name: 'ROM — Elbow, Right',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('elbow'),
    sortOrder: 11
  },
  {
    name: 'ROM — Shoulder, Left',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('shoulder'),
    sortOrder: 12
  },
  {
    name: 'ROM — Shoulder, Right',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('shoulder'),
    sortOrder: 13
  },
  {
    name: 'ROM — Hip, Left',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('hip'),
    sortOrder: 14
  },
  {
    name: 'ROM — Hip, Right',
    bucket: 'MOBILITY',
    tier: 'ROUTINE',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    daysPerWeek: 7,
    targetReps: 15,
    targetHoldSeconds: null,
    targetSets: null,
    restBetweenSetsSeconds: null,
    targetDurationSeconds: null,
    referenceUrl: null,
    instructions: romInstructions('hip'),
    sortOrder: 15
  }
]
