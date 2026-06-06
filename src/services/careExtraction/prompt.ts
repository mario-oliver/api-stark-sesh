import type { TodayActionContext, TodayTaskContext } from './types.js'

export function buildCareExtractionPrompt(args: {
  dogName: string
  dogId: string
  userId: string
  userName: string
  date: string
  actions: TodayActionContext[]
  tasks: TodayTaskContext[]
  transcript: string
}) {
  const actionLines =
    args.actions.length === 0
      ? 'No legacy scheduled care actions.'
      : args.actions
          .map(
            (a, i) =>
              `${i + 1}. dailyCareActionId=${a.id}, name=${a.name}, category=${a.category}, status=${a.status}`
          )
          .join('\n')

  const taskLines =
    args.tasks.length === 0
      ? 'No daily tasks for today.'
      : args.tasks
          .map(
            (t, i) =>
              `${i + 1}. dailyTaskId=${t.id}, name=${t.name}, bucket=${t.bucket}, status=${t.status}, source=${t.source}`
          )
          .join('\n')

  const system = [
    'You extract structured dog physical therapy care updates from caregiver voice transcripts.',
    'Return ONLY valid JSON with keys: matchedTaskUpdates, adHocTasks, observations, bucketHints, caregiverNote, needsReview, dailyActionUpdates.',
    'Prefer matchedTaskUpdates using dailyTaskId when the caregiver clearly refers to an existing task.',
    'Create adHocTasks for novel activities (e.g. "walked stairs instead of ramp") with source plan_variation when substituting, or llm_extracted for new items.',
    'Set substitutedForTaskId when a new task replaces a planned one.',
    'Set needsReview true when substitution occurs, confidence is low, or interpretation is uncertain.',
    'Create observations for symptoms, mobility issues, pain, stiffness, appetite, mood, rest quality.',
    'Do NOT diagnose, recommend medication, or add items to the recurring care plan.',
    'Never auto-promote ad hoc tasks to the plan.',
    'bucket values: activity, mobility, recovery.',
    'matchedTaskUpdates status: completed, skipped, partially_completed, unclear, pending.',
    'observation type: slipping, limping, weakness, stiffness, pain, low_energy, appetite, bathroom, medication, general_note.'
  ].join(' ')

  const user = [
    `Dog: ${args.dogName} (id=${args.dogId})`,
    `Caregiver: ${args.userName} (id=${args.userId})`,
    `Date: ${args.date}`,
    "Today's daily tasks (primary — use dailyTaskId):",
    taskLines,
    'Legacy care actions (fallback — use dailyCareActionId only if no task match):',
    actionLines,
    'Transcript:',
    args.transcript
  ].join('\n\n')

  return { system, user }
}
