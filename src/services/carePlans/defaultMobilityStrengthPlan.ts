import type { CareActionCategory, CareActionFrequency, CareActionTimeOfDay } from '../../generated/client.js'

export type DefaultCareActionInput = {
  name: string
  description?: string
  category: CareActionCategory
  frequency: CareActionFrequency
  timeOfDay?: CareActionTimeOfDay
  sortOrder: number
  instructions?: string
}

export const DEFAULT_MOBILITY_STRENGTH_PLAN_NAME = 'Mobility & strength routine'

export const DEFAULT_MOBILITY_STRENGTH_ACTIONS: DefaultCareActionInput[] = [
  {
    name: 'Morning stretch routine',
    description: 'Morning hip and mobility stretches',
    category: 'STRETCH',
    frequency: 'DAILY',
    timeOfDay: 'MORNING',
    sortOrder: 1,
    instructions: 'Gentle hip stretches in the morning.'
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
