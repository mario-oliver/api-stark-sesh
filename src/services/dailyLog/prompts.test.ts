import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DAILY_LOG_EXTRACTION_SYSTEM, DAILY_LOG_RESOLUTION_SYSTEM } from './prompts.js'

/**
 * Prompt-contract gate for issue 0015. The extraction pass is module-mocked in the
 * session-service tests, so the SYSTEM prompt's plan-change behavior is pinned only
 * here: prove the prompt now INSTRUCTS plan-change detection into
 * `planChangeSuggestions` and no longer hard-codes the 0011 empty-array placeholder,
 * so detection cannot silently regress. The model's actual detection QUALITY over a
 * real transcript is trust-prior-verify — not provable from a string.
 */
describe('DAILY_LOG extraction prompt — plan-change detection (issue 0015)', () => {
  it('no longer hard-codes planChangeSuggestions to an empty array', () => {
    assert.doesNotMatch(
      DAILY_LOG_EXTRACTION_SYSTEM,
      /always return planChangeSuggestions as an empty array/i,
      'the 0011 placeholder instruction must be replaced by real detection guidance'
    )
  })

  it('instructs detection of forward-looking plan-change intent into planChangeSuggestions', () => {
    assert.match(DAILY_LOG_EXTRACTION_SYSTEM, /planChangeSuggestions/)
    // names the two fields the contract requires on each suggestion
    assert.match(DAILY_LOG_EXTRACTION_SYSTEM, /\btext\b/)
    assert.match(DAILY_LOG_EXTRACTION_SYSTEM, /likelyAction/)
    // frames it as a forward-looking prescription change, not today's activity
    assert.match(
      DAILY_LOG_EXTRACTION_SYSTEM,
      /going forward|from now on|prescription|plan change|change the plan/i
    )
  })

  it('keeps plan changes inert — detected, not committed, distinct from completions/ad-hoc', () => {
    assert.match(
      DAILY_LOG_EXTRACTION_SYSTEM,
      /not a completion|commit to nothing|commits to nothing|do not apply|read-only|inert/i
    )
  })

  it('the resolution pass inherits the same detection guidance (issue 0014 + 0015)', () => {
    assert.match(DAILY_LOG_RESOLUTION_SYSTEM, /planChangeSuggestions/)
    assert.doesNotMatch(
      DAILY_LOG_RESOLUTION_SYSTEM,
      /always return planChangeSuggestions as an empty array/i
    )
  })
})
