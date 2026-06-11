# Issue: Ask one round of clarifying questions only when extraction is genuinely blocked

## ID
`0014`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- Vocabulary: `context.md#CareAgentSession` (the two correction mechanisms:
  `AWAITING_INPUT` blocker vs. confirm-with-selection curation).
- Wire shape: uses the existing `questions[]` field on `CareAgentSessionPayload` and the
  `sendMessage` route — no new contract.

## Goal
When extraction can't place an item — a completion is ambiguous between multiple
candidate actions, or a required field can't be inferred — the session goes
`AWAITING_INPUT` and asks one round of questions; the user's reply resolves it into a
`DRAFT_READY` draft. Softer uncertainty never triggers a question.

## Context
[[PRD-daily-log-voice-flow]] FR3 (the `AWAITING_INPUT` branch). [[ADR-0003-daily-log-voice-flow]]
decision 5. This layers the blocking-question path on top of the happy paths from
0011–0013.

## Dependencies
- Blocked by: 0013
- Blocks: 0020

## Scope
- Detect genuine blockers during extraction: (a) a completion ambiguous between
  multiple candidate `DailyCareAction`s, or (b) an un-inferable required field
  (`HealthObservation.type`, an ad-hoc action's `bucket`).
- On a blocker: status → `AWAITING_INPUT`, populate `questions[]`, do not finalize the
  draft. Cap at **one round** — after the user's `sendMessage` reply, resolve to
  `DRAFT_READY` (best-effort; remaining uncertainty rides `needsReview`).
- Route DAILY_LOG through `CareAgentController.sendMessage`.
- Soft uncertainty (missing reps, uncertain severity, suspected dup) stays in the draft
  with `needsReview: true` — explicitly **not** a question.

## Out of scope
- More than one question round / open-ended chat.
- Changing the confirm/commit logic from 0011–0013.

## Acceptance criteria
- [x] (machine) A transcript ambiguous between two today's stretch actions →
  `AWAITING_INPUT` with a non-empty `questions[]`; no draft committed.
- [x] (machine) A `sendMessage` reply naming the action resolves to `DRAFT_READY` with
  the correct completion.
- [x] (machine) An un-inferable `HealthObservation.type` → `AWAITING_INPUT`.
- [x] (machine) Missing reps / uncertain severity → `DRAFT_READY` directly with
  `needsReview: true` (no question).
- [x] (machine) Only one question round occurs (a second blocker after the reply does
  not loop — it resolves with `needsReview`).

## Feedback Loops
```bash
node --experimental-test-module-mocks --test
npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Baseline ref
`611fb4e96b58029c8e3d4db067ff773e8790ffcc` (epic/daily-log-voice-flow tip; cut issue-0014 branch off it)

## Notes for agent
- `CareAgentSessionStatus.AWAITING_INPUT` already exists; PLAN_BUILD uses the same
  questions/sendMessage shape — mirror it.
- Keep the blocker test list tight (ambiguous match; un-inferable required field) so the
  flow stays voice-first low-friction.
