import type { AuditDogContext, StoredMessage } from './types.js'

export function buildAuditContextBlock(ctx: AuditDogContext): string {
  const header = [
    `Dog: ${ctx.dogName} (id=${ctx.dogId})`,
    ctx.breed ? `Breed: ${ctx.breed}` : null,
    ctx.age != null ? `Age: ${ctx.age} years` : null,
    ctx.condition ? `Condition: ${ctx.condition}` : null,
    ctx.notes ? `Notes: ${ctx.notes}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const actionLines =
    ctx.actions.length === 0
      ? '(no exercises in routine)'
      : ctx.actions
          .map((a, i) => {
            const meta = [a.bucket, a.frequency, a.timeOfDay].filter(Boolean).join(', ')
            const desc = a.description ? `\n     Description: ${a.description}` : ''
            const instr = a.instructions ? `\n     Instructions: ${a.instructions}` : ''
            return `${i + 1}. [id=${a.id}] ${a.name} (${meta})${desc}${instr}`
          })
          .join('\n')

  return `${header}\n\nCurrent routine exercises:\n${actionLines}`
}

export function conversationText(messages: StoredMessage[]): string {
  return messages.map(m => `${m.role === 'user' ? 'Caregiver' : 'Assistant'}: ${m.content}`).join('\n\n')
}

export const AUDIT_BASE_SYSTEM = [
  'You help caregivers evaluate and improve a dog\'s physical therapy and mobility home routine.',
  'You are NOT a veterinarian. Do not diagnose, prescribe medication, or replace professional veterinary care.',
  'Assess the program holistically for: bucket coverage (Activity / Mobility / Recovery), appropriate variety,',
  'redundant exercises, missing recovery work, intensity progression suitability, and safety for a dog',
  'with the given condition and age.',
  'Never recommend medication.',
  'Keep your tone warm, specific, and actionable — written for a caring non-expert caregiver.'
].join(' ')

export const AUDIT_SYSTEM = [
  AUDIT_BASE_SYSTEM,
  'Analyze the dog\'s full exercise routine and return a structured AuditReport JSON.',
  'observations must include one entry per exercise that has a notable finding.',
  'For exercises that look good, you may omit them from observations or note severity LOW.',
  'strengths and gaps should be concise bullets (1–2 sentences each, max 5 of each).',
  'overallRating: GOOD = well-rounded program; FAIR = adequate but missing key areas;',
  'NEEDS_WORK = significant gaps or concerns.',
  'Return JSON only. Use the exact schema provided.'
].join(' ')

export const REFINE_SYSTEM = [
  AUDIT_BASE_SYSTEM,
  'You have already produced an audit report (provided below). The caregiver may ask questions about the',
  'analysis OR request specific changes to the program.',
  'Decide: if the caregiver is asking a question or discussing, return responseType="reply" with replyContent.',
  'If the caregiver asks you to propose changes, improve exercises, fix issues, or says anything that calls',
  'for concrete modifications to the routine, return responseType="plan" with planSummary and planChanges.',
  'Set unused fields to null (replyContent null for plan; planSummary and planChanges null for reply).',
  'When generating a plan:',
  '- Each change must reference a real actionId from the exercise context (for UPDATE/DEACTIVATE).',
  '- Prefer UPDATE over DEACTIVATE unless the exercise is clearly harmful or duplicate.',
  '- CREATE should only appear when a new exercise is genuinely missing from the routine.',
  '- Each change needs a concise reason (1–3 sentences).',
  '- Each change object must include a new uuid v4 in the id field.',
  '- Return JSON only matching the schema.'
].join(' ')
