/**
 * Issue 0006 — reseed to the consolidated shape (machine proof for acceptance
 * criterion 2). `prisma/seed.ts` is a thin DB-writer over the pure `buildSeedData()`
 * builder; this asserts the builder produces the consolidated-shape dataset without
 * touching a database, so it runs in the standard `npm test` gate.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSeedData } from './buildSeedData.js'

describe('buildSeedData — consolidated-shape seed (issue 0006)', () => {
  const data = buildSeedData()

  it('wires a User, Dog, DogMember, and an active CarePlan', () => {
    assert.ok(data.user.id && data.user.email)
    assert.ok(data.dog.id)
    assert.equal(data.dogMember.dogId, data.dog.id)
    assert.equal(data.dogMember.userId, data.user.id)
    assert.equal(data.carePlan.dogId, data.dog.id)
    assert.equal(data.carePlan.isActive, true)
  })

  it('covers all three buckets with flat CareActions on the plan', () => {
    const buckets = new Set(data.careActions.map(a => a.bucket))
    for (const b of ['ACTIVITY', 'MOBILITY', 'RECOVERY'] as const) {
      assert.ok(buckets.has(b), `missing a CareAction in bucket ${b}`)
    }
    assert.ok(
      data.careActions.every(a => a.carePlanId === data.carePlan.id),
      'every CareAction belongs to the seeded plan'
    )
  })

  it('includes a medication CareAction in RECOVERY', () => {
    const meds = data.careActions.filter(a => a.bucket === 'RECOVERY' && a.isMedication)
    assert.ok(meds.length >= 1, 'expected ≥1 RECOVERY medication action')
  })

  it('models distinct left/right movements as separate CareActions', () => {
    const left = data.careActions.filter(a => /\bleft\b/i.test(a.name))
    const right = data.careActions.filter(a => /\bright\b/i.test(a.name))
    assert.ok(left.length >= 1, 'need a left-side action')
    assert.ok(right.length >= 1, 'need a right-side action')
    const ids = new Set([...left, ...right].map(a => a.id))
    assert.equal(ids.size, left.length + right.length, 'left/right are distinct rows')
  })

  it('has a DailyCareLog with a non-PLAN DailyCareAction and actual-vs-target', () => {
    assert.equal(data.dailyCareLog.dogId, data.dog.id)
    assert.ok(data.dailyCareActions.length >= 1)
    assert.ok(
      data.dailyCareActions.every(d => d.dailyCareLogId === data.dailyCareLog.id),
      'daily actions belong to the seeded log'
    )
    assert.ok(
      data.dailyCareActions.some(d => d.source !== 'PLAN'),
      'expected ≥1 DailyCareAction with a non-PLAN source'
    )
    assert.ok(
      data.dailyCareActions.some(d => d.targetReps != null && d.actualReps != null),
      'expected ≥1 DailyCareAction showing actual-vs-target reps'
    )
  })

  it('records a HealthObservation that is never MEDICATION', () => {
    assert.ok(data.healthObservations.length >= 1, 'expected ≥1 HealthObservation')
    assert.ok(
      data.healthObservations.every(o => o.type !== ('MEDICATION' as unknown as typeof o.type)),
      'observations never carry the dropped MEDICATION type (issue 0005)'
    )
  })

  it('seeds a CareAgentSession per surviving plan kind (PLAN_BUILD, PLAN_AUDIT)', () => {
    assert.ok(data.careAgentSessions.length >= 1)
    const kinds = new Set(data.careAgentSessions.map(s => s.kind))
    assert.ok(kinds.has('PLAN_BUILD'), 'expected a PLAN_BUILD session')
    assert.ok(kinds.has('PLAN_AUDIT'), 'expected a PLAN_AUDIT session')
  })
})
