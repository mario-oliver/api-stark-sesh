import type { CareActionCategory, CareActionFrequency, CareActionTimeOfDay } from '../../generated/client.js'

export type DefaultCareActionStepInput = {
  name: string
  description?: string
  instructions?: string
  sortOrder: number
}

export type DefaultCareActionInput = {
  name: string
  description?: string
  category: CareActionCategory
  frequency: CareActionFrequency
  timeOfDay?: CareActionTimeOfDay
  sortOrder: number
  instructions?: string
  steps?: DefaultCareActionStepInput[]
}

export const DEFAULT_MOBILITY_STRENGTH_PLAN_NAME = 'Mobility & strength routine'

const MORNING_STRETCH_MOVEMENTS: DefaultCareActionStepInput[] = [
  {
    name: 'Front leg stretch',
    description: 'Gentle extension of the front leg, hold briefly as tolerated.',
    instructions: 'Support under the chest; extend one front leg forward without forcing.',
    sortOrder: 1
  },
  {
    name: 'Elbow stretch',
    description: 'Light flexion and extension at the elbow.',
    instructions: 'Bend and straighten the elbow slowly; stop if resistance or discomfort.',
    sortOrder: 2
  },
  {
    name: 'Shoulder muscle stretch',
    description: 'Gentle shoulder mobility through comfortable range.',
    instructions: 'Guide the limb through a small arc; keep movements smooth and slow.',
    sortOrder: 3
  },
  {
    name: 'Hip flexor stretch',
    description: 'Mild hip flexor lengthening in standing or side-lying.',
    instructions: 'Use treats to encourage a shallow stretch; never pull past tolerance.',
    sortOrder: 4
  }
]

export const DEFAULT_MOBILITY_STRENGTH_ACTIONS: DefaultCareActionInput[] = [
  {
    name: 'Morning stretch routine',
    description: 'Morning hip and mobility stretches',
    category: 'STRETCH',
    frequency: 'DAILY',
    timeOfDay: 'MORNING',
    sortOrder: 1,
    instructions: 'Work through each movement slowly; pause if pain or stiffness increases.',
    steps: MORNING_STRETCH_MOVEMENTS
  },
  {
    name: 'Evening stretch routine',
    description: 'Evening hip and mobility stretches',
    category: 'STRETCH',
    frequency: 'DAILY',
    timeOfDay: 'EVENING',
    sortOrder: 2,
    instructions: 'Gentle hip stretches in the evening.'
  },
  {
    name: 'Assisted strength workout',
    description: 'Assisted sit-to-stand and strength exercises',
    category: 'STRENGTH',
    frequency: 'EVERY_OTHER_DAY',
    timeOfDay: 'EVENING',
    sortOrder: 3,
    instructions: 'Assisted sit-to-stand reps as tolerated.'
  },
  {
    name: 'Short controlled walk',
    description: 'Short controlled walk for mobility',
    category: 'MOBILITY',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    sortOrder: 4,
    instructions: 'Short controlled walk on even surfaces.'
  },
  {
    name: 'Mobility/pain check',
    description: 'Daily mobility and pain tolerance checkpoint',
    category: 'OBSERVATION_CHECKPOINT',
    frequency: 'DAILY',
    timeOfDay: 'ANYTIME',
    sortOrder: 5,
    instructions: 'Note stiffness, pain, and mobility during the day.'
  }
]
