import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { proposedExerciseSchema } from './types.js'

describe('proposedExerciseSchema', () => {
  const validDraft = {
    name: 'Hip mobility routine',
    description: 'Gentle hip work',
    category: 'MOBILITY',
    frequency: 'DAILY',
    timeOfDay: 'MORNING',
    targetReps: null,
    targetDurationSeconds: null,
    instructions: 'Go slowly',
    movements: [
      {
        name: 'Hip flexor stretch',
        description: null,
        instructions: 'Stop if pain appears.',
        sortOrder: null
      }
    ],
    rationale: 'Supports hip strength goals.',
    safetyNotes: 'Not veterinary advice. Stop if pain.',
    researchSummary: 'Based on canine rehab guidance.'
  }

  it('accepts a valid draft', () => {
    const parsed = proposedExerciseSchema.parse(validDraft)
    assert.equal(parsed.name, 'Hip mobility routine')
    assert.equal(parsed.movements.length, 1)
  })

  it('rejects MEDICATION category', () => {
    assert.throws(() =>
      proposedExerciseSchema.parse({ ...validDraft, category: 'MEDICATION' })
    )
  })

  it('rejects empty movements', () => {
    assert.throws(() => proposedExerciseSchema.parse({ ...validDraft, movements: [] }))
  })

  it('rejects more than 8 movements', () => {
    const movements = Array.from({ length: 9 }, (_, i) => ({
      name: `Movement ${i + 1}`
    }))
    assert.throws(() => proposedExerciseSchema.parse({ ...validDraft, movements }))
  })
})
