# Issue: Cross-repo integration QA on the consolidated contract

## ID
`0009`

## Type
- Work: `Human-in-the-loop`
- Shape: `integration issue`

## Target repo
`api-stark-sesh` + `stark-sesh` (+ `StarkHealthiOS`) — spans repos.

## Contract (frozen)
- The real, running contract: the API serving consolidated shapes, consumed by web
  (and iOS). Proves `context.md` holds when the real pieces talk — no mocks.

## Goal
A caregiver can, end to end over the real stack: see the three buckets, complete a
`DailyCareAction`, and run a `PLAN_BUILD` / `PLAN_AUDIT` `CareAgentSession` — against
the seeded data, with no contract mismatches.

## Context
PRD → Testing decisions (the manual/subjective gate) + the multi-repo rule: this is the
ONLY issue that runs the real cross-repo path. Human-in-the-loop because it needs
orchestration setup and human QA judgment (the skill: AI review assists but does not
replace human QA).

## Dependencies
- Blocked by: 0006 (seed), 0007 (web), 0008 (iOS)
- Blocks: —

## Scope
- Stand up the API against a test DB with the issue-0006 seed.
- Install Playwright in `stark-sesh` (not yet present) and write a thin e2e for the
  bucket dashboard + a daily completion against the live API; optionally run an iOS UI
  test against the live/staged API.
- Confirm CareAgentSession PLAN_BUILD and PLAN_AUDIT round-trip over the wire.
- Freeze the boot/orchestration commands back into `inner-loop/references/test-gates.md`
  (the integration-gate section is currently a stub).

## Out of scope
- New product features. Changing the contract (that would be an outer-loop/ADR
  decision — stop and flag instead).

## Acceptance criteria
- [ ] (machine) Each repo's own gate is green first (paste exit codes).
- [ ] (machine) Web e2e against the live API passes for: bucket dashboard renders the
      three buckets from seed; completing a DailyCareAction persists and re-renders.
- [ ] (trust-prior-verify) A human runs PLAN_BUILD and PLAN_AUDIT against the live API
      and confirms a sensible draft/report commits. (Human QA — taste + correctness.)

## Feedback Loops
```bash
# 1. per-repo gates must already be green (api / web / iOS)
# 2. real cross-repo path (fill in exact boot from the first run, then freeze):
#    - boot API on test DB with seed
npm --prefix ../stark-sesh run test:e2e -- --base-url http://localhost:<api-port>
```

## Baseline ref
`<filled at preflight>`

## Notes for agent
Do NOT auto-pass this — it carries the human QA gate the rest of the epic intentionally
defers. Playwright must be installed first (test-gates flags it absent). After the first
successful run, write the concrete orchestration commands back into the test-gates
integration section so the next integration issue inherits them.
