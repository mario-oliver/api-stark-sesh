# Issue: Match completions to today's actions and update them in place, idempotently

## ID
`0013`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- Vocabulary: `context.md#DailyCareAction`, `context.md#CareAgentSession` (DAILY_LOG).
- Wire shape: adds `completions[]` to the DAILY_LOG draft (paper Contract in
  [[Issues - DAILY_LOG Voice Flow]]).

## Goal
"We did his stretches, 12 reps" marks today's matching `DailyCareAction` as done with
the actual reps — updating the existing row in place, and converging (not duplicating)
when the same action is logged twice.

## Context
[[PRD-daily-log-voice-flow]] FR2 (completions), FR3 (matching), FR7 (idempotency).
[[ADR-0003-daily-log-voice-flow]] decisions 2, 6, 7.

## Dependencies
- Blocked by: 0012
- Blocks: 0014, 0017, 0019, 0020

## Scope
- Inject **today's instantiated `DailyCareAction`s** (from `resolveTodayLog`) as
  extraction context (name, bucket, status).
- Produce `completions[]` (each: `changeId`, `dailyCareActionId`, `nameSnapshot`,
  `bucket`, `actualReps?`, `actualDurationSeconds?`, `tolerance?`,
  `extractionConfidence`, `needsReview`) for confident name+bucket matches. No
  confident match but a real activity → route to ad-hoc (0012's path).
- Commit: completion updates the matched `DailyCareAction` in place (`status: DONE`,
  `completedAt`, `completedByUserId`, actual reps/duration, `tolerance`, `voiceNoteId`;
  keep `source: PLAN`). Re-logging converges on the same row (the unique constraint),
  merging actuals.
- Suspected same-day duplicate ad-hoc/observation items → `needsReview: true` in the
  draft (no hard dedup).

## Out of scope
- Asking a clarifying question on ambiguous/multiple matches (→ 0014) — here, surface
  the best candidate with `needsReview: true`; the blocking question path is 0014.
- Any new daily-execution table or matching against the full `CarePlan` (matching is
  against today's instantiated actions only).

## Acceptance criteria
- [ ] (machine) Extraction with a seeded today's-log fixture matches a planned action
  and emits a `completions[]` item referencing the correct `dailyCareActionId`.
- [ ] (machine) Confirm sets that row `status: DONE` with actual reps/duration and
  `voiceNoteId`, keeping `source: PLAN`.
- [ ] (machine) Re-logging the same completion updates the same row (no second row;
  unique constraint honored) and merges later actuals (e.g. a later "12 reps").
- [ ] (machine) An activity with no confident match routes to an ad-hoc row, not a
  bogus completion.
- [ ] (machine) Observation + ad-hoc paths (0011/0012) still pass.

## Feedback Loops
```bash
node --experimental-test-module-mocks --test
npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Baseline ref
`e29aac6` (epic/daily-log-voice-flow tip, post-0012 merge)

## Notes for agent
- `resolveTodayLog` already instantiates today's `DailyCareAction`s — match against
  those, do not re-instantiate.
- `DailyCareActionStatus` and `Tolerance` enums exist; reuse them.
- Matching is in the extraction prompt/tool — keep it deterministic in tests by mocking
  the model and asserting the commit logic given a fixed draft.
