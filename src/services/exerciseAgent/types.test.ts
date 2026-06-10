import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { proposedExerciseSchema } from './types.js'

describe('proposedExerciseSchema', () => {
  const validDraft = {
    name: 'Hip mobility routine',
    description: 'Gentle hip work',
    bucket: 'MOBILITY',
    frequency: 'DAILY',
    timeOfDay: 'MORNING',
    targetReps: null,
    targetDurationSeconds: null,
    instructions: 'Go slowly',
    rationale: 'Supports hip strength goals.',
    safetyNotes: 'Not veterinary advice. Stop if pain.',
    researchSummary: 'Based on canine rehab guidance.'
  }

  it('accepts a valid draft carrying a bucket', () => {
    const parsed = proposedExerciseSchema.parse(validDraft)
    assert.equal(parsed.name, 'Hip mobility routine')
    assert.equal(parsed.bucket, 'MOBILITY')
  })

  it('rejects a missing bucket', () => {
    const { bucket: _bucket, ...withoutBucket } = validDraft
    void _bucket
    assert.throws(() => proposedExerciseSchema.parse(withoutBucket))
  })

  it('rejects an invalid bucket (old category value)', () => {
    assert.throws(() => proposedExerciseSchema.parse({ ...validDraft, bucket: 'STRETCH' }))
  })

  it('carries no sub-step movements (flat action)', () => {
    const parsed = proposedExerciseSchema.parse(validDraft) as Record<string, unknown>
    assert.equal('movements' in parsed, false)
  })
})
