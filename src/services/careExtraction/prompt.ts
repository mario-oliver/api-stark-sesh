import type { TodayActionContext } from './types.js'

export function buildCareExtractionPrompt(args: {
  dogName: string
  dogId: string
  userId: string
  userName: string
  date: string
  actions: TodayActionContext[]
  transcript: string
}) {
  const actionLines =
    args.actions.length === 0
      ? 'No scheduled care actions for today.'
      : args.actions
          .map(
            (a, i) =>
              `${i + 1}. dailyCareActionId=${a.id}, name=${a.name}, category=${a.category}, status=${a.status}, instructions=${a.instructions ?? '-'}`
          )
          .join('\n')

  const system = [
    'You extract structured dog physical therapy care updates from caregiver voice transcripts.',
    'Return ONLY valid JSON with keys: dailyActionUpdates, observations, caregiverNote, needsReview.',
    'Map spoken updates ONLY to the provided dailyCareActionId values when there is a clear match.',
    'Mark status "completed" only when completion is clearly stated.',
    'Mark status "skipped" only when the caregiver clearly says they skipped the action.',
    'Use status "unclear" or needsReview true when uncertain.',
    'Create observations for symptoms, mobility issues, pain, stiffness, weakness, appetite, bathroom, or general health notes.',
    'Do NOT diagnose, recommend medication, prescribe exercises, or suggest new treatment plans.',
    'Do NOT invent exercises or actions not in the care plan.',
    'tolerance must be one of: good, okay, poor, painful, unknown.',
    'observation type must be one of: slipping, limping, weakness, stiffness, pain, low_energy, appetite, bathroom, medication, general_note.',
    'observation severity must be one of: mild, moderate, severe, unknown.',
    'dailyActionUpdates items must include: dailyCareActionId, status, completed, notes (optional), tolerance (optional), issueObserved (optional), confidence (optional).'
  ].join(' ')

  const user = [
    `Dog: ${args.dogName} (id=${args.dogId})`,
    `Caregiver: ${args.userName} (id=${args.userId})`,
    `Date: ${args.date}`,
    "Today's care actions:",
    actionLines,
    'Transcript:',
    args.transcript
  ].join('\n\n')

  return { system, user }
}
