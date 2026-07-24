/**
 * ROUTINE-only bucketScore denominator (issue 0031 / ADR-0005).
 *
 * Pure gate on the exported `computeActivityScore`:
 *  - The expected denominator counts ONLY auto-instantiated rows (ROUTINE, plus
 *    legacy null-tier PLAN rows). CORE / ON_WALKS / AS_NEEDED rows are never
 *    expected.
 *  - Completed CORE / ON_WALKS work raises the numerator even though it was
 *    never expected.
 *  - A rest day with all ROUTINE (ROM) rows completed scores 100%.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeActivityScore } from './computeBucketScores.js'

type T = {
  status: string
  nameSnapshot: string
  source: string
  careAction?: { tier: string | null } | null
}

const routine = (status: string, name = 'ROM'): T => ({
  status,
  nameSnapshot: name,
  source: 'PLAN',
  careAction: { tier: 'ROUTINE' }
})
const core = (status: string, name = 'Ground Poles'): T => ({
  status,
  nameSnapshot: name,
  source: 'PLAN',
  careAction: { tier: 'CORE' }
})

describe('computeActivityScore — ROUTINE-only denominator (0031)', () => {
  it('rest day with all ROUTINE rows completed scores 100%', () => {
    const tasks = [routine('COMPLETED', 'ROM-A'), routine('COMPLETED', 'ROM-B')]
    assert.equal(computeActivityScore(tasks).score, 100)
  })

  it('a completed CORE row raises the numerator though it is never expected', () => {
    // 2 ROUTINE expected, 1 done → 50%. Add a completed CORE row → numerator 2/2 = 100%.
    const half = [routine('COMPLETED', 'ROM-A'), routine('PENDING', 'ROM-B')]
    assert.equal(computeActivityScore(half).score, 50)

    const withCore = [...half, core('COMPLETED')]
    assert.equal(computeActivityScore(withCore).score, 100)
  })

  it('CORE rows never inflate the denominator', () => {
    // 1 ROUTINE expected (done) + a PENDING CORE row that must NOT count as expected.
    const tasks = [routine('COMPLETED', 'ROM-A'), core('PENDING')]
    // Denominator is ROUTINE-only (1), numerator counts the 1 completion → 100%.
    assert.equal(computeActivityScore(tasks).score, 100)
  })

  it('a pure workout day (only CORE rows, no ROUTINE) scores on completions alone', () => {
    // No expected rows at all; ≥1 completion → 100% (batched work raises the numerator).
    const done = [core('COMPLETED', 'Poles'), core('COMPLETED', 'Sit-to-Stand')]
    assert.equal(computeActivityScore(done).score, 100)
    // No completions and no expected rows → 0.
    const none = [core('PENDING', 'Poles')]
    assert.equal(computeActivityScore(none).score, 0)
  })

  it('legacy null-tier PLAN rows still count as expected', () => {
    const legacy: T[] = [
      { status: 'COMPLETED', nameSnapshot: 'Old', source: 'PLAN', careAction: null },
      { status: 'PENDING', nameSnapshot: 'Old2', source: 'PLAN', careAction: null }
    ]
    assert.equal(computeActivityScore(legacy).score, 50)
  })
})
