# Issue: iOS — batched workout mirror: on-do flow, ≥2 rule, recommendation, add-exercise picker

## ID
`0033`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS)

## Contract (frozen)
- [[PRD-batched-workout-scheduling]] §Contract: `POST /v1/dogs/:id/daily-actions`
  request/response shape verbatim (mock the API in tests; real path is 0027).
- Rules from `context.md#Workout` / [[ADR-0005-batched-workout-scheduling]]:
  workout day ≡ ≥2 CORE rows COMPLETED|PARTIALLY_COMPLETED (skips never veto);
  rhythm + quota recommendation, advisory only; rows written on first
  interaction only.
- Same truth-table fixtures as web 0032 — fixture parity is the contract-drift
  guard.

## Goal
iOS matches web batch semantics exactly: UI-only cards until first interaction,
advisory recommendation on the Today workout card, whole-plan add-exercise
picker, ≥2-completions weekly counter — from the same fixtures as web.

## Context
[[PRD-batched-workout-scheduling]] FRs 3–6 on iOS. Amends 0028/0029/0030 work
on the same epic branch.

## Dependencies
- Blocked by: — (epic branch already carries 0028–0030; contract frozen above)
- Blocks: 0027

## Scope
- `WorkoutModels`: workout-day logic → ≥2-completions counting rule (legacy
  MOBILITY-bridge fallback untouched); recommendation pure fn mirroring web's
  states (`recommended` / `rest` / `doneToday`).
- `APIClient` / `VideoClipAPI` neighbors: create-daily-action endpoint per
  contract; decoding the created row (tier + dosage keys).
- `WorkoutViewModel` / `WorkoutFlowView`: flow opens with CORE set as UI-only
  cards from the active plan; create on first interaction then PATCH; re-entry
  merges rows already written today; abandoning leaves exactly the
  interacted-with rows.
- Video path: `VideoUploadCoordinator` creates the row (status PENDING) before
  registering a clip with `dailyCareActionId` (0022 routes unchanged).
- Add-exercise picker on Today (`TodayWorkoutCardView` area) and in-flow:
  entire active plan grouped by Tier via `PlanTierGrouping` / `CareDisplay`.
- Today card recommendation line (three states; copy mirrors web's intent).
- XCTests per acceptance criteria; async test pattern for @MainActor
  @Observable VMs (`await Task.yield()`); update tests that assumed
  pre-instantiated CORE rows.

## Out of scope
- No API implementation (0031 owns it). No web. No visual redesign — Variant B
  adaptation, BrandColors blues, and capture sheet stand. No voice changes.

## Acceptance criteria
- [ ] (machine) Workout-day truth table matches web 0032 fixtures: 1
      completion → false; 2 → true; 2 + SKIPPED → true; PARTIALLY_COMPLETED
      counts; old-model PENDING rows ignored.
- [ ] (machine) Recommendation truth table matches web 0032 fixtures across
      recommended / rest / doneToday.
- [ ] (machine) View-model flow: create called on first interaction only;
      abandon after 2 interactions → exactly 2 create calls; re-entry merges;
      video attach creates the row before clip registration (mocked client
      asserts call order).
- [ ] (machine) Picker lists all tiers from the active plan; adding + completing
      round-trips create + PATCH against the mocked contract.
- [ ] (machine) iOS gate green: `xcodebuild test` → TEST SUCCEEDED; no existing
      tests weakened.

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`<filled at preflight>`

## Notes for agent
- Worktree gotchas: copy `StarkHealthiOS/Config/Secrets.xcconfig` from the main
  checkout (gitignored; note the nested path); simulator mutex
  `/tmp/stark-ios-sim.lock` (mkdir loop + trap rmdir) if anything else is
  testing.
- `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — mark service/URLSession code
  nonisolated as needed.
- Branch off umbrella `epic/stark-plan-workout` (StarkHealthiOS), merge back
  into it.
