/**
 * MEDICATION dropped from the observation taxonomy - machine proof for issue 0005.
 *
 * Medication is a CareAction(bucket: RECOVERY), never a HealthObservation type
 * (context.md#HealthObservation, ADR-0002). This asserts the observation
 * contract can no longer carry MEDICATION at any layer: the request schemas and
 * the generated Prisma enum. (Voice extraction path was removed in issue 0004.)
 *
 * The filename avoids the "observation" token on purpose: the issue's grep loop
 * globs src/ ** /observation* and a test asserting MEDICATION's absence must
 * contain the string, which would self-trip such a grep.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createObservationSchema, updateObservationSchema } from './dogSchemas.js'
import { HealthObservationType } from '../generated/enums.js'

describe('HealthObservationType drops MEDICATION', () => {
  it('generated HealthObservationType has no MEDICATION member', () => {
    assert.equal(
      Object.prototype.hasOwnProperty.call(HealthObservationType, 'MEDICATION'),
      false
    )
    assert.equal((Object.values(HealthObservationType) as string[]).includes('MEDICATION'), false)
  })

  it('createObservationSchema rejects type MEDICATION', () => {
    assert.throws(() =>
      createObservationSchema.parse({ type: 'MEDICATION', note: 'gave him his pill' })
    )
  })

  it('createObservationSchema still accepts a valid observation type', () => {
    const parsed = createObservationSchema.parse({ type: 'PAIN', note: 'sore after walk' })
    assert.equal(parsed.type, 'PAIN')
  })

  it('updateObservationSchema rejects type MEDICATION', () => {
    assert.throws(() => updateObservationSchema.parse({ type: 'MEDICATION' }))
  })
})
