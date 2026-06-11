import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { FastifyReply } from 'fastify'
import type { CareAgentController } from './careAgentController.js'
import type { AuthenticatedRequest } from '../types/auth.js'

// ── Dispatch gate (DB-free; always runs) ──────────────────────────────────────
//
// Acceptance criterion 0010: the unified create endpoint dispatches by `kind`
// onto the matching agent orchestration, and rejects an unsupported kind with
// 400. The two agent services and the membership check are module-mocked, so no
// DB or OpenAI is touched — this asserts ROUTING, not agent behaviour.

type Calls = { exerciseCreate: number; auditCreate: number }
const calls: Calls = { exerciseCreate: 0, auditCreate: 0 }

function fakeSession(kind: string) {
  return {
    id: 's',
    dogId: 'dog-1',
    userId: 'user-1',
    kind,
    status: 'DRAFT_READY',
    messages: [],
    questions: null,
    draft: null,
    voiceNoteId: null,
    createdAt: new Date('2026-06-10T00:00:00.000Z'),
    updatedAt: new Date('2026-06-10T00:00:00.000Z')
  }
}

function fakeReply() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined }
  const reply = {
    status(code: number) {
      state.statusCode = code
      return reply
    },
    send(body: unknown) {
      state.body = body
      return reply
    },
    _state: state
  }
  return reply
}

function fakeRequest(body: unknown) {
  return { params: { id: 'dog-1' }, body, user: { id: 'user-1' } } as unknown as AuthenticatedRequest
}

describe('CareAgentController — create dispatch by kind', () => {
  let controller: CareAgentController

  before(async () => {
    const url = (rel: string) => new URL(rel, import.meta.url).href

    await mock.module(url('../lib/dogAccess.ts'), {
      namedExports: { assertDogMemberAccess: async () => ({ role: 'caregiver' }) }
    })
    await mock.module(url('../services/exerciseAgent/sessionService.ts'), {
      namedExports: {
        createExerciseSession: async () => {
          calls.exerciseCreate++
          return { session: fakeSession('PLAN_BUILD'), error: null }
        },
        sendExerciseAgentMessage: async () => ({ session: fakeSession('PLAN_BUILD'), error: null }),
        confirmExerciseSession: async () => ({ action: { id: 'a' } }),
        cancelExerciseSession: async () => {}
      }
    })
    await mock.module(url('../services/programAudit/sessionService.ts'), {
      namedExports: {
        createAuditSession: async () => {
          calls.auditCreate++
          return { session: fakeSession('PLAN_AUDIT'), error: null }
        },
        sendProgramAuditMessage: async () => ({ session: fakeSession('PLAN_AUDIT'), error: null }),
        confirmAuditSession: async () => ({ applied: [], changesApplied: 0 }),
        cancelAuditSession: async () => {}
      }
    })

    const mod = await import('./careAgentController.js')
    controller = new mod.CareAgentController()
  })

  it('PLAN_BUILD create → exercise agent, 201, payload kind PLAN_BUILD', async () => {
    calls.exerciseCreate = 0
    calls.auditCreate = 0
    const reply = fakeReply()
    await controller.createSession(fakeRequest({ kind: 'PLAN_BUILD', message: 'hip weakness' }), reply as unknown as FastifyReply)

    assert.equal(calls.exerciseCreate, 1, 'PLAN_BUILD must route to the exercise agent')
    assert.equal(calls.auditCreate, 0)
    assert.equal(reply._state.statusCode, 201)
    assert.equal((reply._state.body as { data: { kind: string } }).data.kind, 'PLAN_BUILD')
  })

  it('PLAN_AUDIT create → program audit agent, 201, payload kind PLAN_AUDIT', async () => {
    calls.exerciseCreate = 0
    calls.auditCreate = 0
    const reply = fakeReply()
    await controller.createSession(fakeRequest({ kind: 'PLAN_AUDIT' }), reply as unknown as FastifyReply)

    assert.equal(calls.auditCreate, 1, 'PLAN_AUDIT must route to the program-audit agent')
    assert.equal(calls.exerciseCreate, 0)
    assert.equal(reply._state.statusCode, 201)
    assert.equal((reply._state.body as { data: { kind: string } }).data.kind, 'PLAN_AUDIT')
  })

  it('unsupported kind (e.g. DAILY_LOG) → 400, no agent invoked', async () => {
    calls.exerciseCreate = 0
    calls.auditCreate = 0
    const reply = fakeReply()
    await controller.createSession(fakeRequest({ kind: 'DAILY_LOG' }), reply as unknown as FastifyReply)

    assert.equal(reply._state.statusCode, 400)
    assert.equal(calls.exerciseCreate, 0)
    assert.equal(calls.auditCreate, 0)
  })
})
