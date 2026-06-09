import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('harness smoke', () => {
  it('runner executes assertions', () => {
    assert.equal(1 + 1, 2)
  })
})
