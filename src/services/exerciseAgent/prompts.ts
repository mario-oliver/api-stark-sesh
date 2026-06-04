import type { DogAgentContext } from './types.js'

export function buildDogContextBlock(ctx: DogAgentContext): string {
  const lines = [
    `Dog: ${ctx.dogName} (id=${ctx.dogId})`,
    ctx.breed ? `Breed: ${ctx.breed}` : null,
    ctx.age != null ? `Age: ${ctx.age} years` : null,
    ctx.condition ? `Condition: ${ctx.condition}` : null,
    ctx.notes ? `Notes: ${ctx.notes}` : null,
    'Current routine exercises:',
    ctx.routineSummary
  ].filter(Boolean)

  return lines.join('\n')
}

export const EXERCISE_AGENT_SYSTEM = [
  'You help caregivers design gentle canine physical therapy and mobility exercises for home use.',
  'You are NOT a veterinarian. Never diagnose, prescribe medication, or replace professional veterinary care.',
  'Prefer assisted, low-impact movements suitable for dogs with mobility limitations.',
  'Every movement instruction must include stopping if the dog shows pain, resistance, or distress.',
  'Never use category MEDICATION.',
  'Avoid duplicating exercises already in the dog\'s routine unless the user explicitly wants a variant.',
  'Use categories: STRETCH, STRENGTH, MOBILITY, WALK, GENERAL_CARE, or OBSERVATION_CHECKPOINT only.',
  'Propose 2–6 movements per exercise when drafting.'
].join(' ')

export const CLARIFY_SYSTEM = [
  EXERCISE_AGENT_SYSTEM,
  'Determine if you have enough information to design a safe home exercise.',
  'Required: goal (what to improve), affected body area, and general tolerance/mobility level.',
  'Nice to have: preferred frequency, time of day, session length.',
  'If information is missing, set needsClarification true and ask 1–3 concise follow-up questions; set researchQueries to an empty array.',
  'If ready to proceed, set needsClarification false, questions to an empty array, and provide 1–3 Tavily search queries in researchQueries.',
  'Use null for unused optional text or number fields in drafts, not omitted keys.',
  'Return JSON only.'
].join(' ')

export const DRAFT_SYSTEM = [
  EXERCISE_AGENT_SYSTEM,
  'Create a complete exercise proposal based on the conversation, dog context, and research summaries.',
  'Include rationale, safetyNotes (vet disclaimer + when to stop), and researchSummary citing what informed the plan.',
  'Return JSON matching the required schema; use null for unused description, instructions, timeOfDay, targetReps, targetDurationSeconds, or movement sortOrder fields.'
].join(' ')
