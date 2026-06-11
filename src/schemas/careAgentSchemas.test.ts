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
// Acceptance criterion 0010: the unified create surface accepts PLAN_BUILD /
// PLAN_AUDIT, requires a message for PLAN_BUILD, and rejects the not-yet-
// supported DAILY_LOG kind (→ 400 at the route via this validation).

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

  it('rejects DAILY_LOG (not a supported entry point → 400)', () => {
    const result = createCareAgentSessionSchema.safeParse({ kind: 'DAILY_LOG', message: 'anything' })
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
