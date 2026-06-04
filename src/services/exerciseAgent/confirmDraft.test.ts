import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { proposedExerciseSchema } from './types.js'

/** Mirrors confirm path: merge edits then validate before persist. */
function prepareDraftForPersist(
  rawDraft: unknown,
  edits?: Record<string, unknown>
) {
  const merged = { ...(rawDraft as object), ...(edits ?? {}) }
  return proposedExerciseSchema.parse(merged)
}

function toCareActionInput(draft: ReturnType<typeof proposedExerciseSchema.parse>) {
  const { movements, rationale, safetyNotes, researchSummary, ...actionFields } = draft
  void rationale
  void safetyNotes
  void researchSummary
  return {
    ...actionFields,
    steps: movements.map((m, index) => ({
      name: m.name,
      description: m.description ?? null,
      instructions: m.instructions ?? null,
      sortOrder: m.sortOrder ?? index + 1
    }))
  }
}

describe('confirm draft preparation', () => {
  const baseDraft = {
    name: 'Evening stretch',
    description: null,
    category: 'STRETCH',
    frequency: 'DAILY',
    timeOfDay: 'EVENING',
    targetReps: null,
    targetDurationSeconds: null,
    instructions: null,
    movements: [
      {
        name: 'Neck stretch',
        description: null,
        instructions: 'Gentle only.',
        sortOrder: null
      }
    ],
    rationale: 'Helps stiffness.',
    safetyNotes: 'Consult your vet.',
    researchSummary: 'General canine stretch info.'
  }

  it('maps draft to care action with steps', () => {
    const draft = prepareDraftForPersist(baseDraft)
    const input = toCareActionInput(draft)
    assert.equal(input.name, 'Evening stretch')
    assert.equal(input.steps.length, 1)
    assert.equal(input.steps[0].name, 'Neck stretch')
    assert.equal(input.steps[0].sortOrder, 1)
  })

  it('applies edits overlay before validation', () => {
    const draft = prepareDraftForPersist(baseDraft, { name: 'Renamed stretch' })
    assert.equal(draft.name, 'Renamed stretch')
  })
})
