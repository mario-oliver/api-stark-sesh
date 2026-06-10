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
  const { rationale, safetyNotes, researchSummary, ...actionFields } = draft
  void rationale
  void safetyNotes
  void researchSummary
  return actionFields
}

describe('confirm draft preparation', () => {
  const baseDraft = {
    name: 'Evening stretch',
    description: null,
    bucket: 'MOBILITY',
    frequency: 'DAILY',
    timeOfDay: 'EVENING',
    targetReps: null,
    targetDurationSeconds: null,
    instructions: null,
    rationale: 'Helps stiffness.',
    safetyNotes: 'Consult your vet.',
    researchSummary: 'General canine stretch info.'
  }

  it('maps draft to a flat care action input carrying its bucket', () => {
    const draft = prepareDraftForPersist(baseDraft)
    const input = toCareActionInput(draft)
    assert.equal(input.name, 'Evening stretch')
    assert.equal(input.bucket, 'MOBILITY')
    assert.equal('steps' in input, false)
    assert.equal('movements' in input, false)
  })

  it('applies edits overlay before validation', () => {
    const draft = prepareDraftForPersist(baseDraft, { name: 'Renamed stretch' })
    assert.equal(draft.name, 'Renamed stretch')
  })
})
