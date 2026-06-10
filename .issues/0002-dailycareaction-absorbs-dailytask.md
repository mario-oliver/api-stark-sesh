# Issue: Collapse DailyTask into DailyCareAction

## ID
`0002`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: `context.md#DailyCareAction` — the single daily-execution record,
  carrying the richer `DailyTask` field set.
- Target schema: `Engineering/Data Model.md` (Daily Tracking section).

## Goal
There is exactly one daily-execution table, `DailyCareAction`, holding the union of
fields; `DailyTask` no longer exists.

## Context
PRD → functional requirement 3; ADR-0002 move 3. `DailyTask` is the newer voice/agent
shape — keep its fields, drop the older split.

## Dependencies
- Blocked by: 0001 (both edit `DailyCareAction`; serialize to avoid migration thrash)
- Blocks: 0006 (reseed)

## Scope
- Schema: add to `DailyCareAction` the fields currently on `DailyTask` (`bucket`,
  `source`, `actualReps`, `actualDurationSeconds`, `substitutedForTaskId`,
  `extractionConfidence`, `needsReview`, `metadata`, `descriptionSnapshot`,
  `instructionsSnapshot`, `sortOrder`); delete model `DailyTask` and enum
  `DailyTaskStatus` (use `DailyCareActionStatus`); delete `DailyCareAction.issueObserved`;
  rename enum `DailyTaskSource` → `DailyCareActionSource` (name no longer references a
  dead table).
- Code: repoint everything that wrote/read `DailyTask` to `DailyCareAction`; daily-log
  endpoints return the unified shape; drop `issueObserved` writers.
- Tests: a daily completion with `source` + actual-vs-target persists and round-trips.

## Out of scope
- Sessions, VoiceNote, HealthObservation, CareAction taxonomy (other issues).

## Acceptance criteria
- [ ] (machine) A `DailyCareAction` can be created with `source`, `actualReps`,
      `actualDurationSeconds`, `bucket` and round-trips through the daily-log service.
- [ ] (machine) `DailyTask`, `DailyTaskStatus`, `issueObserved` absent from `src/`.
- [ ] (machine) `npx prisma validate` passes; generated client exposes the new
      `DailyCareAction` fields and no `dailyTask` model.
- [ ] (machine) typecheck, lint, test, build exit 0.

## Feedback Loops
```bash
npm test                 # incl. unified daily-execution test
npx tsc --noEmit
npm run lint
npm run build
! grep -rEn "DailyTask|DailyTaskStatus|issueObserved" src
```

## Baseline ref
`0b712ed171a022ccd9b693452d29111e6c58fa42`  (master; post-0001 merge, native gates green, grep red = the job)

## Notes for agent
Watch for `needsReview` — it MUST survive on `DailyCareAction`; only the `VoiceNote`
copy is removed (issue 0004). The `substitutedForTaskId` self-relation moves onto
`DailyCareAction`. Likely files: daily-log service/routes, voice-extraction writer
that currently emits `DailyTask`.
