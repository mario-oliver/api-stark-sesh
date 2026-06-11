import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  careAgentSessionIdParamSchema,
  confirmCareAgentSessionSchema,
  createCareAgentSessionSchema,
  sendCareAgentMessageSchema
} from './careAgentSchemas.js'

// ── Request-contract gate (DB-free; always runs) ──────────────────────────────
//
// Acceptance criteria 0010 + 0011: the unified create surface accepts
// PLAN_BUILD / PLAN_AUDIT / DAILY_LOG, each requiring its own field —
// PLAN_BUILD a message, DAILY_LOG a voiceNoteId — and rejects unknown kinds.

describe('createCareAgentSessionSchema — kind dispatch contract', () => {
  it('accepts PLAN_BUILD with a message', () => {
    const parsed = createCareAgentSessionSchema.parse({ kind: 'PLAN_BUILD', message: 'hip weakness' })
    assert.equal(parsed.kind, 'PLAN_BUILD')
    assert.equal(parsed.message, 'hip weakness')
  })

  it('rejects PLAN_BUILD without a message', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'PLAN_BUILD' })
    assert.equal(result.success, false)
  })

  it('accepts PLAN_AUDIT with no message', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'PLAN_AUDIT' })
    assert.equal(result.success, true)
  })

  it('accepts DAILY_LOG with a voiceNoteId (now a supported entry point)', () => {
    const parsed = createCareAgentSessionSchema.parse({ kind: 'DAILY_LOG', voiceNoteId: randomUUID() })
    assert.equal(parsed.kind, 'DAILY_LOG')
    assert.ok(parsed.voiceNoteId)
  })

  it('rejects DAILY_LOG without a voiceNoteId (→ 400 at the route)', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'DAILY_LOG' })
    assert.equal(result.success, false)
  })

  it('rejects DAILY_LOG with a non-uuid voiceNoteId', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'DAILY_LOG', voiceNoteId: 'not-a-uuid' })
    assert.equal(result.success, false)
  })

  it('rejects an unknown kind', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'NONSENSE' })
    assert.equal(result.success, false)
  })
})

describe('care-agent message + confirm + param schemas', () => {
  it('requires a non-empty message', () => {
    assert.equal(sendCareAgentMessageSchema.safeParse({ message: '' }).success, false)
    assert.equal(sendCareAgentMessageSchema.safeParse({ message: 'ok' }).success, true)
  })

  it('confirm accepts an optional selectedChangeIds array of uuids', () => {
    assert.equal(confirmCareAgentSessionSchema.safeParse({}).success, true)
    assert.equal(
      confirmCareAgentSessionSchema.safeParse({ selectedChangeIds: [randomUUID()] }).success,
      true
    )
    assert.equal(
      confirmCareAgentSessionSchema.safeParse({ selectedChangeIds: ['not-a-uuid'] }).success,
      false
    )
  })

  it('param schema requires uuid id + sessionId', () => {
    assert.equal(
      careAgentSessionIdParamSchema.safeParse({ id: randomUUID(), sessionId: randomUUID() }).success,
      true
    )
    assert.equal(
      careAgentSessionIdParamSchema.safeParse({ id: 'x', sessionId: 'y' }).success,
      false
    )
  })
})
