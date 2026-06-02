import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveFinalMetric } from './statDerivation.js'

test('resolveFinalMetric prefers manual override', () => {
  const next = resolveFinalMetric({
    computed: 8,
    isLocked: false,
    manualOverride: 12,
    currentFinal: 8
  })
  assert.equal(next, 12)
})

test('resolveFinalMetric keeps current final when locked and no override', () => {
  const next = resolveFinalMetric({
    computed: 9,
    isLocked: true,
    manualOverride: null,
    currentFinal: 3
  })
  assert.equal(next, 3)
})

test('resolveFinalMetric uses computed when unlocked and no override', () => {
  const next = resolveFinalMetric({
    computed: 6,
    isLocked: false,
    manualOverride: null,
    currentFinal: 2
  })
  assert.equal(next, 6)
})
