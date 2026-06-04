import { prisma } from '../../lib/prisma.js'
import type {
  CareActionCategory,
  CareActionFrequency,
  CareActionTimeOfDay
} from '../../generated/client.js'
import { actionAppliesOnDate } from '../dailyCare/actionAppliesOnDate.js'
import { formatCalendarDate, parseCalendarDate } from '../dailyCare/dateUtils.js'
import { serializeCareActionStep, type CareActionStepRow } from './serializeCareActionStep.js'

export type CreateCareActionInput = {
  name: string
  description?: string | null
  category: CareActionCategory
  frequency: CareActionFrequency
  timeOfDay?: CareActionTimeOfDay | null
  targetReps?: number | null
  targetDurationSeconds?: number | null
  instructions?: string | null
  sortOrder?: number
}

export type UpdateCareActionInput = Partial<CreateCareActionInput>

export type CreateCareActionStepInput = {
  name: string
  description?: string | null
  instructions?: string | null
  targetReps?: number | null
  targetDurationSeconds?: number | null
  sortOrder?: number
}

export type CreateCareActionWithStepsInput = CreateCareActionInput & {
  steps: CreateCareActionStepInput[]
}

type CareActionRow = {
  id: string
  carePlanId: string
  name: string
  description: string | null
  category: CareActionCategory
  frequency: CareActionFrequency
  timeOfDay: CareActionTimeOfDay | null
  targetReps: number | null
  targetDurationSeconds: number | null
  instructions: string | null
  sortOrder: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  steps?: CareActionStepRow[]
}

async function serializeCareAction(action: CareActionRow) {
  const steps = action.steps
    ? await Promise.all(
        action.steps
          .filter(s => s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map(serializeCareActionStep)
      )
    : []

  return {
    id: action.id,
    carePlanId: action.carePlanId,
    name: action.name,
    description: action.description,
    category: action.category,
    frequency: action.frequency,
    timeOfDay: action.timeOfDay,
    targetReps: action.targetReps,
    targetDurationSeconds: action.targetDurationSeconds,
    instructions: action.instructions,
    sortOrder: action.sortOrder,
    isActive: action.isActive,
    createdAt: action.createdAt.toISOString(),
    updatedAt: action.updatedAt.toISOString(),
    steps
  }
}

async function serializeCarePlan(plan: {
  id: string
  dogId: string
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
  actions: CareActionRow[]
}) {
  const actions = await Promise.all(plan.actions.map(serializeCareAction))
  return {
    id: plan.id,
    dogId: plan.dogId,
    name: plan.name,
    isActive: plan.isActive,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    actions
  }
}

const actionInclude = {
  where: { isActive: true },
  orderBy: { sortOrder: 'asc' as const },
  include: {
    steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' as const } }
  }
}

export async function getActiveCarePlan(dogId: string) {
  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true },
    include: { actions: actionInclude }
  })

  if (!plan) return null

  return serializeCarePlan(plan)
}

export async function updateCarePlanName(dogId: string, name: string) {
  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true }
  })
  if (!plan) {
    throw new Error('No active care plan found')
  }

  const updated = await prisma.carePlan.update({
    where: { id: plan.id },
    data: { name },
    include: { actions: actionInclude }
  })

  return serializeCarePlan(updated)
}

export async function createCareAction(dogId: string, input: CreateCareActionInput) {
  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true },
    include: {
      actions: { where: { isActive: true }, orderBy: { sortOrder: 'desc' }, take: 1 }
    }
  })
  if (!plan) {
    throw new Error('No active care plan found')
  }

  const maxSort = plan.actions[0]?.sortOrder ?? 0
  const sortOrder = input.sortOrder ?? maxSort + 1

  const action = await prisma.careAction.create({
    data: {
      carePlanId: plan.id,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      frequency: input.frequency,
      timeOfDay: input.timeOfDay ?? null,
      targetReps: input.targetReps ?? null,
      targetDurationSeconds: input.targetDurationSeconds ?? null,
      instructions: input.instructions ?? null,
      sortOrder
    },
    include: { steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } }
  })

  return serializeCareAction(action)
}

export async function createCareActionWithSteps(
  dogId: string,
  input: CreateCareActionWithStepsInput
) {
  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true },
    include: {
      actions: { where: { isActive: true }, orderBy: { sortOrder: 'desc' }, take: 1 }
    }
  })
  if (!plan) {
    throw new Error('No active care plan found')
  }

  const maxSort = plan.actions[0]?.sortOrder ?? 0
  const sortOrder = input.sortOrder ?? maxSort + 1
  const { steps, ...actionInput } = input

  const action = await prisma.$transaction(async tx => {
    const created = await tx.careAction.create({
      data: {
        carePlanId: plan.id,
        name: actionInput.name,
        description: actionInput.description ?? null,
        category: actionInput.category,
        frequency: actionInput.frequency,
        timeOfDay: actionInput.timeOfDay ?? null,
        targetReps: actionInput.targetReps ?? null,
        targetDurationSeconds: actionInput.targetDurationSeconds ?? null,
        instructions: actionInput.instructions ?? null,
        sortOrder
      }
    })

    if (steps.length > 0) {
      await tx.careActionStep.createMany({
        data: steps.map((step, index) => ({
          careActionId: created.id,
          name: step.name,
          description: step.description ?? null,
          instructions: step.instructions ?? null,
          targetReps: step.targetReps ?? null,
          targetDurationSeconds: step.targetDurationSeconds ?? null,
          sortOrder: step.sortOrder ?? index + 1
        }))
      })
    }

    return tx.careAction.findUniqueOrThrow({
      where: { id: created.id },
      include: { steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } }
    })
  })

  return serializeCareAction(action)
}

export async function updateCareAction(
  dogId: string,
  actionId: string,
  input: UpdateCareActionInput
) {
  const action = await prisma.careAction.findFirst({
    where: {
      id: actionId,
      isActive: true,
      carePlan: { dogId, isActive: true }
    }
  })
  if (!action) {
    throw new Error('Care action not found')
  }

  const updated = await prisma.careAction.update({
    where: { id: actionId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.frequency !== undefined && { frequency: input.frequency }),
      ...(input.timeOfDay !== undefined && { timeOfDay: input.timeOfDay }),
      ...(input.targetReps !== undefined && { targetReps: input.targetReps }),
      ...(input.targetDurationSeconds !== undefined && {
        targetDurationSeconds: input.targetDurationSeconds
      }),
      ...(input.instructions !== undefined && { instructions: input.instructions }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder })
    },
    include: { steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } }
  })

  return serializeCareAction(updated)
}

export async function deactivateCareAction(dogId: string, actionId: string) {
  const action = await prisma.careAction.findFirst({
    where: {
      id: actionId,
      isActive: true,
      carePlan: { dogId, isActive: true }
    }
  })
  if (!action) {
    throw new Error('Care action not found')
  }

  const updated = await prisma.careAction.update({
    where: { id: actionId },
    data: { isActive: false },
    include: { steps: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } }
  })

  return serializeCareAction(updated)
}

export async function getCalendarSummary(dogId: string, month: string) {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(month)
  if (!monthMatch) {
    throw new Error('Invalid month format. Use YYYY-MM.')
  }

  const year = Number(monthMatch[1])
  const monthIndex = Number(monthMatch[2]) - 1
  if (monthIndex < 0 || monthIndex > 11) {
    throw new Error('Invalid month')
  }

  const startDate = new Date(Date.UTC(year, monthIndex, 1))
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0))

  const plan = await prisma.carePlan.findFirst({
    where: { dogId, isActive: true },
    include: {
      actions: { where: { isActive: true } }
    }
  })

  const logs = await prisma.dailyCareLog.findMany({
    where: {
      dogId,
      date: { gte: startDate, lte: endDate }
    },
    include: {
      dailyCareActions: { select: { status: true } }
    }
  })

  const logByDate = new Map(
    logs.map(log => [formatCalendarDate(log.date), log])
  )

  const days: Array<{
    date: string
    completedCount: number
    totalActions: number
    hasLog: boolean
  }> = []

  const daysInMonth = endDate.getUTCDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const logDate = parseCalendarDate(dateStr)!
    const log = logByDate.get(dateStr)

    if (log) {
      const completedCount = log.dailyCareActions.filter(
        a => a.status === 'COMPLETED' || a.status === 'PARTIALLY_COMPLETED'
      ).length
      days.push({
        date: dateStr,
        completedCount,
        totalActions: log.dailyCareActions.length,
        hasLog: true
      })
    } else if (plan) {
      const expectedTotal = plan.actions.filter(a =>
        actionAppliesOnDate(a.frequency, plan.createdAt, logDate)
      ).length
      days.push({
        date: dateStr,
        completedCount: 0,
        totalActions: expectedTotal,
        hasLog: false
      })
    } else {
      days.push({
        date: dateStr,
        completedCount: 0,
        totalActions: 0,
        hasLog: false
      })
    }
  }

  return { month, days }
}
