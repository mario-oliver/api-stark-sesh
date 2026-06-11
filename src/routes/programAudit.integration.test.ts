/**
 * Program Audit API — integration tests
 *
 * Requires DATABASE_URL_TEST (Neon branch). Tests are skipped when the variable
 * is absent so the existing unit-test gate remains green everywhere.
 *
 * Idempotency guarantees:
 *   - All entities are created with unique run-scoped IDs; no shared seed data.
 *   - afterEach restores care-action state so confirm tests don't bleed.
 *   - after deletes the test dog (cascade) + test users.
 *   - The LangGraph layer is replaced by a deterministic mock; no OpenAI calls.
 *
 * Load order (inside before):
 *   1. setupTestEnv()        — swaps DATABASE_URL → DATABASE_URL_TEST
 *   2. registerMockAuditGraph() — registers mock.module on graphRunner.ts
 *   3. dynamic import of buildTestApp — production code (prisma, routes) loads
 *      here, after env swap and mock are in place.
 */

import { describe, it, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

import { setupTestEnv } from '../test/helpers/testEnv.js'
import { registerMockAuditGraph, setMockActionIds } from '../test/helpers/mockAuditGraph.js'
import {
  createTestPrisma,
  seedProgramAuditFixture,
  restoreCareActions,
  teardownFixture,
  type ProgramAuditFixture
} from '../test/fixtures/programAuditFixture.js'

// ── Suite (skipped when DATABASE_URL_TEST is absent) ─────────────────────────

describe('Program Audit API – integration', { skip: !process.env.DATABASE_URL_TEST }, () => {
  let app: FastifyInstance
  let testAuth: { userId: string; email: string }
  let testPrisma: ReturnType<typeof createTestPrisma>
  let fixture: ProgramAuditFixture

  // ── URL helpers ─────────────────────────────────────────────────────────────

  const sessionsUrl = () => `/v1/dogs/${fixture.dogId}/care-agent/sessions`
  const messagesUrl = (sid: string) =>
    `/v1/dogs/${fixture.dogId}/care-agent/sessions/${sid}/messages`
  const confirmUrl = (sid: string) =>
    `/v1/dogs/${fixture.dogId}/care-agent/sessions/${sid}/confirm`
  const deleteUrl = (sid: string) =>
    `/v1/dogs/${fixture.dogId}/care-agent/sessions/${sid}`
  const getUrl = (sid: string) =>
    `/v1/dogs/${fixture.dogId}/care-agent/sessions/${sid}`

  // ── Shared helpers ──────────────────────────────────────────────────────────

  /** Creates an AWAITING_INPUT (report-ready) session as the owner. Returns the serialised session. */
  async function createSession() {
    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: sessionsUrl(),
      headers: { 'content-type': 'application/json' },
      payload: { kind: 'PLAN_AUDIT' }
    })
    assert.equal(res.statusCode, 201, `createSession: expected 201, got ${res.statusCode}`)
    return res.json().data as Record<string, unknown>
  }

  /** Creates a DRAFT_READY (plan-ready) session (one create + one propose-changes message). */
  async function createPlanReadySession() {
    const session = await createSession()
    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: messagesUrl(session.id as string),
      headers: { 'content-type': 'application/json' },
      payload: { message: 'propose changes please' }
    })
    assert.equal(
      res.statusCode,
      200,
      `createPlanReadySession: expected 200, got ${res.statusCode}`
    )
    return res.json().data as Record<string, unknown>
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  before(async () => {
    setupTestEnv()
    await registerMockAuditGraph()

    // Production code loaded here — DATABASE_URL already points at test branch
    // and graphRunner.ts mock is already registered.
    const helpers = await import('../test/helpers/buildTestApp.js')
    testAuth = helpers.testAuth
    app = await helpers.buildTestApp()

    testPrisma = createTestPrisma()
    fixture = await seedProgramAuditFixture(testPrisma)
    setMockActionIds(fixture.actionIds)
  })

  afterEach(async () => {
    try {
      await restoreCareActions(testPrisma, fixture)
    } catch {
      // best-effort; teardown in after() is the definitive cleanup
    }
  })

  after(async () => {
    await app.close()
    await teardownFixture(testPrisma, fixture)
    await testPrisma.$disconnect()
  })

  // ── Test 1 — create session ─────────────────────────────────────────────────

  it('POST /sessions { kind: PLAN_AUDIT } → 201, unified payload, status AWAITING_INPUT, report valid', async () => {
    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: sessionsUrl(),
      headers: { 'content-type': 'application/json' },
      payload: { kind: 'PLAN_AUDIT' }
    })

    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.equal(body.success, true)

    const data = body.data
    assert.ok(data.id, 'session must have an id')
    assert.equal(data.kind, 'PLAN_AUDIT', 'unified payload carries the kind discriminator')
    assert.equal(data.status, 'AWAITING_INPUT')
    assert.ok(Array.isArray(data.messages), 'unified payload carries messages')
    assert.ok(Array.isArray(data.questions), 'unified payload carries questions')
    assert.ok(data.draft, 'draft envelope must be present')
    assert.ok(data.draft.report, 'report must be present under draft')
    assert.equal(typeof data.draft.report.summary, 'string')
    assert.ok(Array.isArray(data.draft.report.strengths))
    assert.ok(Array.isArray(data.draft.report.gaps))
    assert.ok(Array.isArray(data.draft.report.observations))
    assert.ok(
      ['GOOD', 'FAIR', 'NEEDS_WORK'].includes(data.draft.report.overallRating as string),
      'overallRating must be one of GOOD | FAIR | NEEDS_WORK'
    )
  })

  // ── Test 2 — question message ───────────────────────────────────────────────

  it('POST /messages with a question → status stays AWAITING_INPUT, assistant reply appended', async () => {
    const session = await createSession()

    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: messagesUrl(session.id as string),
      headers: { 'content-type': 'application/json' },
      payload: { message: 'What should I focus on first?' }
    })

    assert.equal(res.statusCode, 200)
    const data = res.json().data
    assert.equal(data.status, 'AWAITING_INPUT')
    assert.equal(data.draft.plan, null)

    const messages = data.messages as Array<{ role: string; content: string }>
    const lastMsg = messages[messages.length - 1]
    assert.equal(lastMsg.role, 'assistant')
    assert.equal(typeof lastMsg.content, 'string')
  })

  // ── Test 3 — propose changes message ───────────────────────────────────────

  it('POST /messages "propose changes" → status DRAFT_READY, changes have UUIDs', async () => {
    const session = await createSession()

    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: messagesUrl(session.id as string),
      headers: { 'content-type': 'application/json' },
      payload: { message: 'propose changes please' }
    })

    assert.equal(res.statusCode, 200)
    const data = res.json().data
    assert.equal(data.status, 'DRAFT_READY')
    assert.ok(data.draft.plan, 'plan must be present under draft')

    const changes = data.draft.plan.changes as Array<{ id: string; type: string }>
    assert.ok(changes.length >= 1, 'plan must have at least one change')

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const change of changes) {
      assert.match(change.id, uuidRe, `change.id "${change.id}" must be a UUID`)
    }
  })

  // ── Test 4 — partial confirm ────────────────────────────────────────────────

  it('POST /confirm { selectedChangeIds: [oneId] } → only that change applied, status committed', async () => {
    const session = await createPlanReadySession()
    const changes = ((session.draft as { plan: { changes: Array<{ id: string; type: string }> } }).plan).changes

    // Pick the DEACTIVATE change to apply selectively
    const deactivateChange = changes.find(c => c.type === 'DEACTIVATE')
    assert.ok(deactivateChange, 'expected a DEACTIVATE change in the fixture plan')

    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: confirmUrl(session.id as string),
      headers: { 'content-type': 'application/json' },
      payload: { selectedChangeIds: [deactivateChange.id] }
    })

    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.equal(body.data.changesApplied, 1)
    assert.equal(body.data.status, 'committed')

    // Verify DB: action[1] is now inactive
    const action1 = await testPrisma.careAction.findUnique({
      where: { id: fixture.actionIds[1] }
    })
    assert.equal(action1!.isActive, false, 'action1 should be deactivated')

    // Verify DB: action[0] is still active and not renamed
    const action0 = await testPrisma.careAction.findUnique({
      where: { id: fixture.actionIds[0] }
    })
    assert.equal(action0!.isActive, true, 'action0 should still be active')
    assert.equal(action0!.name, fixture.actionSnapshot[0].name, 'action0 name should be unchanged')
  })

  // ── Test 5 — full confirm ───────────────────────────────────────────────────

  it('POST /confirm {} → all changes applied, all mutation types verified in DB', async () => {
    const session = await createPlanReadySession()
    const changes = ((session.draft as { plan: { changes: Array<{ id: string; type: string }> } }).plan).changes

    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: confirmUrl(session.id as string),
      headers: { 'content-type': 'application/json' },
      payload: {}
    })

    assert.equal(res.statusCode, 201)
    const body = res.json()
    assert.equal(body.data.changesApplied, changes.length)
    assert.equal(body.data.status, 'committed')

    // UPDATE: action[0] renamed
    const action0 = await testPrisma.careAction.findUnique({
      where: { id: fixture.actionIds[0] }
    })
    assert.equal(action0!.name, 'Updated Action Name')

    // DEACTIVATE: action[1] inactive
    const action1 = await testPrisma.careAction.findUnique({
      where: { id: fixture.actionIds[1] }
    })
    assert.equal(action1!.isActive, false)

    // CREATE: a new care action now exists beyond the two seeded
    const allActions = await testPrisma.careAction.findMany({
      where: { carePlanId: fixture.planId }
    })
    assert.ok(
      allActions.length > 2,
      `expected > 2 care actions after CREATE confirm, got ${allActions.length}`
    )
  })

  // ── Test 6 — delete session ─────────────────────────────────────────────────

  it('DELETE /sessions/:id → { cancelled: true }; subsequent GET returns 404', async () => {
    const session = await createSession()
    testAuth.userId = fixture.ownerId

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: deleteUrl(session.id as string)
    })
    assert.equal(deleteRes.statusCode, 200)
    assert.equal(deleteRes.json().data.cancelled, true)

    const getRes = await app.inject({
      method: 'GET',
      url: getUrl(session.id as string)
    })
    assert.equal(getRes.statusCode, 404)
  })

  // ── Test 7 — unknown dog ────────────────────────────────────────────────────

  /**
   * assertDogMemberAccess queries DogMember by { dogId, userId }. A non-existent
   * dogId has no DogMember record, so the controller returns 403 (not 404) to
   * avoid leaking whether the resource exists.
   */
  it('POST with unknown dog UUID → 403 (no member record)', async () => {
    testAuth.userId = fixture.ownerId
    const res = await app.inject({
      method: 'POST',
      url: `/v1/dogs/${randomUUID()}/care-agent/sessions`,
      headers: { 'content-type': 'application/json' },
      payload: { kind: 'PLAN_AUDIT' }
    })
    assert.equal(res.statusCode, 403)
    assert.equal(res.json().success, false)
  })

  // ── Test 8 — wrong user ─────────────────────────────────────────────────────

  it('POST with non-member user → 403', async () => {
    testAuth.userId = fixture.strangerId
    const res = await app.inject({
      method: 'POST',
      url: sessionsUrl(),
      headers: { 'content-type': 'application/json' },
      payload: { kind: 'PLAN_AUDIT' }
    })
    assert.equal(res.statusCode, 403)
    assert.equal(res.json().success, false)
  })
})
