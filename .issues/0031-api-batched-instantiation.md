# Issue: API — tier-aware instantiation, create-on-do endpoint, ROUTINE-only denominators

## ID
`0031`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- [[PRD-batched-workout-scheduling]] §Contract, verbatim:
  `POST /v1/dogs/:id/daily-actions` with body
  `{ date, careActionId, status?, tolerance?, actualReps?, actualSets?,
  actualDurationSeconds?, notes? }` → 201 serialized row in the exact
  today-payload row shape (0020 tier + dosage keys included); `status`
  defaults `PENDING`; creates the day's DailyCareLog if missing; snapshots per
  existing rules; `source: PLAN`; 404 when careActionId is not on the dog's
  active plan; POST always creates (no upsert).
- Vocabulary: `context.md#Tier` instantiation rule, `context.md#Workout`,
  [[ADR-0005-batched-workout-scheduling]].

## Goal
Rest days become clean data: only ROUTINE auto-instantiates into Today; CORE /
ON_WALKS / AS_NEEDED rows are born from a deliberate POST; expected counts and
bucketScores stop punishing days Vicky never assigned.

## Context
[[PRD-batched-workout-scheduling]] FRs 1, 2, 7, 8. Amends the shipped 0020/0021
behavior on the same epic branch. No schema change, no seed re-run.

## Dependencies
- Blocked by: — (epic branch already carries 0020–0023)
- Blocks: 0027

## Scope
- `actionAppliesOnDate` (and the daily-instantiation path that calls it)
  becomes tier-aware: ROUTINE → existing frequency rules; CORE / ON_WALKS /
  AS_NEEDED → never auto-instantiate. `frequency` on those tiers is display
  metadata only.
- New `POST /v1/dogs/:id/daily-actions` per the frozen contract (route beside
  the existing `PATCH /:id/daily-actions/:actionId`), including schema,
  controller, service, and score recompute after the write (same path the
  PATCH uses).
- `countApplicableActions` / expected-total / bucketScore denominators become
  ROUTINE-only; a day with ROM done and zero CORE rows scores clean.
- Tests for all of the above; update any existing tests that assumed CORE rows
  auto-exist (do not weaken unrelated assertions).

## Out of scope
- No schema migration, no Plan 2 re-import, no changes to PATCH, VideoClip
  routes, or voice flow. No recommendation logic (client-side by ADR-0005).

## Acceptance criteria
- [ ] (machine) `actionAppliesOnDate`: ROUTINE follows frequency; CORE /
      ON_WALKS / AS_NEEDED return false for auto-instantiation regardless of
      frequency; today payload for a fresh day contains ROUTINE rows only.
- [ ] (machine) POST creates the DailyCareLog when missing, snapshots
      name/description/instructions, defaults status PENDING, returns the
      today-row shape with tier + dosage keys, 404s for off-plan careActionId,
      and creates a second row on repeat POST (no upsert).
- [ ] (machine) Expected counts / bucketScores use ROUTINE-only denominators;
      a rest day with all ROM completed computes a full score; completed CORE
      rows raise numerators without ever being expected.
- [ ] (machine) Full gate green: `npm test`, `npx tsc --noEmit`, scoped lint,
      `npm run build`; no existing tests weakened.

## Feedback Loops
```bash
BASE=c7702cf3a01535e2dc361b714208c845233a4635
npm test
npx tsc --noEmit
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts')
if [ -n "$CHANGED" ]; then echo "$CHANGED" | xargs npx eslint; else echo "scoped-lint: no changed TS files"; fi
npm run build
```

## Baseline ref
`c7702cf3a01535e2dc361b714208c845233a4635`

## Notes for agent
- Run `npx prisma generate` after checkout (stale generated client causes
  phantom type errors — recurring gotcha).
- The instantiation call site is the today get-or-create path in
  `src/services/dailyCare/`; `actionAppliesOnDate.ts` already special-cases
  AS_NEEDED → extend that shape, passing tier alongside frequency.
- Old-model history rows (PENDING/SKIPPED CORE) must still serialize fine —
  read-compat is FR 8; no backfill.
- Branch off umbrella `epic/stark-plan-workout` (api-stark-sesh), merge back
  into it.
