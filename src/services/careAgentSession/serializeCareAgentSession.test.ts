import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { serializeCareAgentSession } from './serializeCareAgentSession.js'
import type { CareAgentSession } from './sessionRepository.js'

// ── Wire-shape gate (DB-free; always runs) ────────────────────────────────────
//
// Acceptance criterion 0010: the unified serializer emits exactly the
// CareAgentSessionPayload field set the consolidated clients expect, with a
// kind-appropriate `draft` view. No exact LLM wording is asserted — only shape.

const PAYLOAD_KEYS = [
  'createdAt',
  'dogId',
  'draft',
  'id',
  'kind',
  'messages',
  'questions',
  'status',
  'updatedAt',
  'voiceNoteId'
]

function baseRow(overrides: Partial<CareAgentSession>): CareAgentSession {
  return {
    id: 'session-1',
    dogId: 'dog-1',
    userId: 'user-1',
    kind: 'PLAN_BUILD',
    status: 'DRAFT_READY',
    messages: [{ role: 'user', content: 'hi' }],
    questions: null,
    draft: null,
    voiceNoteId: null,
    committedCarePlanId: null,
    committedCareActionId: null,
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
    updatedAt: new Date('2026-06-10T01:00:00.000Z'),
    ...overrides
  } as CareAgentSession
}

const exercise = {
  name: 'Sit-to-stand',
  description: null,
  bucket: 'MOBILITY',
  frequency: 'DAILY',
  timeOfDay: null,
  targetReps: 10,
  targetDurationSeconds: null,
  instructions: null,
  rationale: 'Builds hind-limb strength',
  safetyNotes: 'Stop if wobbly',
  researchSummary: 'Common post-op rehab movement'
}

describe('serializeCareAgentSession — unified wire shape', () => {
  it('emits exactly the CareAgentSessionPayload key set', () => {
    const payload = serializeCareAgentSession(baseRow({}))
    assert.deepEqual(Object.keys(payload).sort(), PAYLOAD_KEYS)
  })

  it('PLAN_BUILD: draft is the proposed exercise; research is not leaked; questions pass through', () => {
    const payload = serializeCareAgentSession(
      baseRow({
        kind: 'PLAN_BUILD',
        questions: ['What surgery?'],
        draft: { exercise, research: [{ source: 'x', snippet: 'y' }] },
        voiceNoteId: 'vn-9'
      })
    )
    assert.equal(payload.kind, 'PLAN_BUILD')
    assert.deepEqual(payload.draft, exercise)
    assert.equal((payload.draft as Record<string, unknown>).research, undefined)
    assert.deepEqual(payload.questions, ['What surgery?'])
    assert.equal(payload.voiceNoteId, 'vn-9')
    assert.equal(payload.createdAt, '2026-06-10T00:00:00.000Z')
  })

  it('PLAN_BUILD: an empty envelope yields a null draft', () => {
    const payload = serializeCareAgentSession(baseRow({ kind: 'PLAN_BUILD', draft: null }))
    assert.equal(payload.draft, null)
  })

  it('PLAN_AUDIT: draft is the { report, plan } envelope; questions default to []', () => {
    const report = { summary: 's', strengths: [], gaps: [], observations: [], overallRating: 'FAIR' }
    const plan = { summary: 'p', changes: [] }
    const payload = serializeCareAgentSession(
      baseRow({ kind: 'PLAN_AUDIT', status: 'DRAFT_READY', questions: null, draft: { report, plan } })
    )
    assert.equal(payload.kind, 'PLAN_AUDIT')
    assert.deepEqual(payload.draft, { report, plan })
    assert.deepEqual(payload.questions, [])
  })

  it('PLAN_AUDIT: report-only envelope keeps plan null under draft', () => {
    const report = { summary: 's', strengths: [], gaps: [], observations: [], overallRating: 'GOOD' }
    const payload = serializeCareAgentSession(
      baseRow({ kind: 'PLAN_AUDIT', status: 'AWAITING_INPUT', draft: { report, plan: null } })
    )
    assert.deepEqual(payload.draft, { report, plan: null })
  })

  it('PLAN_AUDIT: an empty envelope yields a null draft', () => {
    const payload = serializeCareAgentSession(baseRow({ kind: 'PLAN_AUDIT', draft: null }))
    assert.equal(payload.draft, null)
  })
})
