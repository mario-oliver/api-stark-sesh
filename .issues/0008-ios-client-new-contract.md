# Issue: Update the iOS client to the consolidated contract

## ID
`0008`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS)

## Contract (frozen)
- Shared vocabulary: `context.md` + `Engineering/Data Model.md`. Gates against the
  frozen Contract and **mocks the API**.

## Goal
The iOS app builds and its `Codable` models / API client match the consolidated API
shapes, with no references to removed fields.

## Context
PRD → UX (existing screens keep working) + multi-repo rule (parallel with API; Contract
frozen). iOS gates are simulator-dependent and slower — lower the turn cap.

## Dependencies
- Blocked by: — (Contract already frozen)
- Blocks: INT1

## Scope
- Update Swift `Codable` models and API client for: required `bucket` on CareAction;
  removal of steps/`category`; unified `DailyCareAction` (with `source`,
  actual-vs-target); `CareAgentSession` replacing the two session types; slimmed
  `VoiceNote`.
- Tests: XCTest unit coverage for the changed decoding against new-shape fixtures.

## Out of scope
- No new screens/features. No real cross-repo calls (INT1). Do not touch other repos.

## Acceptance criteria
- [x] (machine) iOS unit tests decode new-shape fixtures for CareAction (with bucket),
      DailyCareAction (with source), CareAgentSession, slimmed VoiceNote.
      → `StarkHealthiOSTests/ContractDecodingTests.swift` (8 tests, all green).
- [x] (machine) `xcodebuild test` (scheme `StarkHealthiOS`) exits 0. → exit 0, TEST SUCCEEDED.
- [ ] (trust-prior-verify) Bucket and daily screens render correctly against new-shape
      fixtures in the simulator. (Human eyeballs.) → ALSO eyeball the two rewired agent
      screens (ExerciseAgentView / ProgramAuditView) — the audit phase logic now derives
      from `draft` contents since `REPORT_READY`/`PLAN_READY` were dropped.

## Status
`DONE (loops green)` — inner loop 2026-06-10. trust-prior-verify pending human eyeball.
Not merged/pushed (shipping is an outer-loop step).

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
# confirm the kill-list is gone from Swift sources:
! grep -rEn "CareActionStep|DailyTask|ExerciseAgentSession|ProgramAuditSession" Sources StarkHealthiOS
```

## Baseline ref
`fc73a81ece0f65f748f9112dc831441d073e3671`  <!-- StarkHealthiOS HEAD @ preflight 2026-06-10 -->
Preflight: `xcodebuild test` GREEN (TEST SUCCEEDED); grep kill-list gate RED by design
(58 matches — exactly the terms this issue removes). Proceeding is override case (b).

## Notes for agent
Run in `StarkHealthiOS`. `iPhone 15` is unavailable on Xcode 26.2 — use `iPhone 17,
OS=26.2` or adapt via `xcodebuild -showdestinations`. swiftlint is not configured, so no
lint gate. Much of iOS is taste-sensitive — lean on trust-prior-verify for visuals.
