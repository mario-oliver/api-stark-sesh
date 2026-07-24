/**
 * Tier-aware auto-instantiation (issue 0031 / ADR-0005 / context.md#Tier).
 *
 * Pure unit gate on `actionAppliesOnDate` and `countApplicableActions`:
 *  - ROUTINE follows the existing frequency rules (DAILY / EVERY_OTHER_DAY /
 *    WEEKLY / AS_NEEDED).
 *  - CORE / ON_WALKS / AS_NEEDED never auto-instantiate, whatever the frequency.
 *  - A null tier (legacy plans that predate the concept) keeps the pre-0005
 *    frequency-only behavior.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { CareActionFrequency, CareActionTier } from '../../generated/client.js'
import { actionAppliesOnDate, countApplicableActions } from './actionAppliesOnDate.js'

const PLAN_CREATED = new Date('2026-06-26T00:00:00.000Z')
// Same day as plan creation → EVERY_OTHER_DAY/WEEKLY both hit their 0-index cases.
const SAME_DAY = new Date('2026-06-26T00:00:00.000Z')
const NEXT_DAY = new Date('2026-06-27T00:00:00.000Z')

describe('actionAppliesOnDate — tier gates frequency (0031)', () => {
  it('ROUTINE follows the frequency rules', () => {
    assert.equal(actionAppliesOnDate('DAILY', 'ROUTINE', PLAN_CREATED, NEXT_DAY), true)
    assert.equal(actionAppliesOnDate('EVERY_OTHER_DAY', 'ROUTINE', PLAN_CREATED, SAME_DAY), true)
    assert.equal(actionAppliesOnDate('EVERY_OTHER_DAY', 'ROUTINE', PLAN_CREATED, NEXT_DAY), false)
    assert.equal(actionAppliesOnDate('WEEKLY', 'ROUTINE', PLAN_CREATED, SAME_DAY), true)
    assert.equal(actionAppliesOnDate('WEEKLY', 'ROUTINE', PLAN_CREATED, NEXT_DAY), false)
    // AS_NEEDED frequency never instantiates, even under ROUTINE.
    assert.equal(actionAppliesOnDate('AS_NEEDED', 'ROUTINE', PLAN_CREATED, NEXT_DAY), false)
  })

  it('CORE / ON_WALKS / AS_NEEDED never auto-instantiate, whatever the frequency', () => {
    const nonRoutine: CareActionTier[] = ['CORE', 'ON_WALKS', 'AS_NEEDED']
    const frequencies: CareActionFrequency[] = ['DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'AS_NEEDED']
    for (const tier of nonRoutine) {
      for (const freq of frequencies) {
        assert.equal(
          actionAppliesOnDate(freq, tier, PLAN_CREATED, NEXT_DAY),
          false,
          `${tier} + ${freq} must never auto-instantiate`
        )
        // Even on the plan-creation day (index 0).
        assert.equal(actionAppliesOnDate(freq, tier, PLAN_CREATED, SAME_DAY), false)
      }
    }
  })

  it('null tier keeps legacy frequency-only behavior', () => {
    assert.equal(actionAppliesOnDate('DAILY', null, PLAN_CREATED, NEXT_DAY), true)
    assert.equal(actionAppliesOnDate('AS_NEEDED', null, PLAN_CREATED, NEXT_DAY), false)
  })

  it('countApplicableActions counts only what auto-instantiates', () => {
    const actions = [
      { frequency: 'DAILY' as CareActionFrequency, tier: 'ROUTINE' as CareActionTier }, // yes
      { frequency: 'DAILY' as CareActionFrequency, tier: 'CORE' as CareActionTier }, // no
      { frequency: 'DAILY' as CareActionFrequency, tier: 'ON_WALKS' as CareActionTier }, // no
      { frequency: 'DAILY' as CareActionFrequency, tier: 'AS_NEEDED' as CareActionTier }, // no
      { frequency: 'DAILY' as CareActionFrequency, tier: null }, // yes (legacy)
      { frequency: 'AS_NEEDED' as CareActionFrequency, tier: null } // no (frequency)
    ]
    assert.equal(countApplicableActions(actions, PLAN_CREATED, NEXT_DAY), 2)
  })
})
