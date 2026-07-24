# Issue: Web — batched workout: on-do flow, ≥2 rule, recommendation, add-exercise picker

## ID
`0032`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- [[PRD-batched-workout-scheduling]] §Contract: `POST /v1/dogs/:id/daily-actions`
  request/response shape verbatim (mock the API in tests; real path is 0027).
- Rules from `context.md#Workout` / [[ADR-0005-batched-workout-scheduling]]:
  workout day ≡ ≥2 CORE rows COMPLETED|PARTIALLY_COMPLETED (skips never veto);
  rhythm + quota recommendation (advisory, deterministic); rows written on
  first interaction only.
- The active CarePlan payload already carries tier + dosage per 0020 — the
  picker and UI-only cards render from it; no new read surface.

## Goal
The web workout experience matches the batch model: the flow opens as UI-only
cards and writes rows only on first interaction; Today shows an advisory
recommendation line; any plan exercise is addable from Today or in-flow; the
weekly counter ticks on ≥2 CORE completions.

## Context
[[PRD-batched-workout-scheduling]] FRs 3–6. Amends 0023/0025/0026 work on the
same epic branch; Variant B layout, colors, typography untouched.

## Dependencies
- Blocked by: — (contract frozen above; mock the API)
- Blocks: 0027

## Scope
- `lib/care/workout.ts`: `isWorkoutDay` → ≥2-completions counting rule (old
  PENDING/SKIPPED history rows ignored); add recommendation pure fn
  (suggested `workoutRecommendation(days, reference)` →
  `'recommended' | 'rest' | 'doneToday'`) beside `workoutsThisWeek`.
- `lib/api/endpoints/dogs.ts`: the POST create endpoint per contract.
- `lib/care/workoutFlow.ts` + `WorkoutFlowClient` / workout page: flow opens
  with the CORE set as UI-only cards from the active plan; a row is created on
  first interaction (complete / partial / explicit skip / video attach) then
  PATCHed; re-entry merges cards with rows already written today; abandoning
  after N interactions leaves exactly N rows.
- Video capture path: creating the row (status PENDING) before registering a
  clip with `dailyCareActionId` — 0022/0026 contract routes unchanged.
- Add-exercise picker on Today (`WorkoutCard` area) and in-flow: entire active
  plan grouped by Tier using the existing dosage formatter; adding appends a
  UI-only card.
- Today `WorkoutCard`: recommendation state line (three states: recommended /
  rest / done today — copy is agent's judgment); `workoutWeekLabel` unchanged.
- vitest coverage per the acceptance criteria; update tests that assumed
  pre-instantiated CORE rows.

## Out of scope
- No API implementation (0031 owns it — mock per contract). No iOS. No layout,
  color, or typography changes. No voice-flow changes. No stored
  recommendation or Workout table.

## Acceptance criteria
- [ ] (machine) `isWorkoutDay` truth table: 1 completion → false; 2 → true;
      2 completions + 1 SKIPPED → true; PARTIALLY_COMPLETED counts; old-model
      PENDING rows ignored.
- [ ] (machine) Recommendation truth table: under quota + rested → recommended;
      last 2 days both workouts → rest; end-of-week behind pace → recommended
      despite consecutive days; workout done today → doneToday.
- [ ] (machine) Flow reducer: rows created on first interaction only; abandon
      after 2 interactions → exactly 2 create calls; re-entry merges existing
      rows; video attach creates the row before clip registration.
- [ ] (machine) Picker offers all tiers from the active plan and appends a
      card whose completion round-trips through create + PATCH (mocked).
- [ ] (machine) Full gate green: `npm test`, `npx tsc --noEmit`, scoped lint,
      `npm run build`; no existing tests weakened.

## Feedback Loops
```bash
BASE=c6cea3b37cbe8bbcf0450102ae33740b983d6048
npm test
npx tsc --noEmit
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts' '*.tsx')
if [ -n "$CHANGED" ]; then echo "$CHANGED" | xargs npx eslint; else echo "scoped-lint: no changed TS files"; fi
npm run build
```

## Baseline ref
`c6cea3b37cbe8bbcf0450102ae33740b983d6048`

## Notes for agent
- Worktree gotcha: run a real `npm ci` (Turbopack rejects out-of-root
  node_modules symlinks). vitest lacks `@/` alias — use relative value imports
  in `lib/`.
- Keep every rule pure and DOM-free in `lib/care/` so iOS (0033) can mirror
  the same fixtures — fixture parity is the contract-drift guard.
- Design constraints still `design-system/stark-sesh/pages/workout.md`
  (thumb-zone, ≥44px targets, one primary CTA); the picker must respect them.
- Branch off umbrella `epic/stark-plan-workout` (stark-sesh), merge back into
  it.
