# Issue: Build the iOS DAILY_LOG draft-review + confirm flow (chosen design)

## ID
`0019`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS / SwiftUI)

## Contract (frozen)
- Real serialized Contract: `CareAgentSessionPayload` with the DAILY_LOG `draft` shape
  realized by 0011, plus the `/v1/dogs/:id/care-agent/sessions` create / `messages` /
  `confirm` routes. Gates against the Contract and **mocks the API** in XCTest; the real
  cross-repo path is 0020.
- Vocabulary: `context.md#CareAgentSession` (DAILY_LOG), `#DailyCareAction`,
  `#HealthObservation`.

## Goal
After recording a voice note, the iOS app creates a `DAILY_LOG` session, renders the
returned draft (the design chosen in 0018), supports the one clarifying question, and
confirms with `selectedChangeIds` — the primary voice-first capture loop, end to end on
device (against a mocked API).

## Context
[[PRD-daily-log-voice-flow]] FR1, FR3, FR5, FR6; §UX. Implements the 0018-selected design.

## Dependencies
- Blocked by: 0011 (real draft contract), 0013 (completions), 0018 (design choice)
- Blocks: 0020

## Scope
- Networking: add DAILY_LOG session create (`voiceNoteId`), `sendMessage`, and `confirm`
  (`selectedChangeIds`) to the iOS API layer; decode the `CareAgentSessionPayload`
  DAILY_LOG draft.
- Wire the post-recording flow to open the session and render the chosen draft-review UI:
  per-item select/deselect, pre-selection, `needsReview` flags, the `AWAITING_INPUT`
  one-question state, the empty-draft message, and the inert plan-change nudge.
- XCTest coverage for decoding the draft and building the confirm payload (mock API).

## Out of scope
- Real API integration / on-device e2e against a live API (→ 0020).
- The PLAN_AUDIT handoff target (deferred); the nudge only navigates/stubs.

## Acceptance criteria
- [x] (machine) Decoding a mock `CareAgentSessionPayload` yields the expected
      completions/ad-hoc/observations; the confirm payload contains exactly the selected
      `changeId`s and never a `planChangeSuggestion`. ✅ `DailyLogDraftReviewTests`:
      decode + selectable/default/confirm selection (filters plan-change & stale ids) +
      view-model create→answer→commit against a mock API.
- [x] (machine) `xcodebuild test` (scheme `StarkHealthiOS`, `-only-testing:StarkHealthiOSTests`)
      passes with the new tests. ✅ TEST SUCCEEDED on iPhone 17 / OS 26.2 (baseline was
      green first; new suite green in isolation too).
- [ ] (trust-prior-verify) The on-device flow matches the 0018-selected design.
      **Mario eyeballs** — run the app, record a note, walk the review sheet
      (triage → View all → summary → View receipt → plan-change save-first).

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
# swiftlint not configured (test-gates) — skip lint gate unless added.
```

## Baseline ref
`848d75f` — branch `issue/0019-ios-build-draft-review-confirm` off umbrella
`epic/daily-log-voice-flow` (after merging 0018). Baseline `xcodebuild test` green.

## Notes for agent
- Decode against the exact Contract field names (avoid client/api drift —
  [[stark-web-api-bucket-contract-drift]]).
- Keep wording assertions out of tests (LLM output is non-deterministic) — assert
  structure/decoding/selection, not copy.
- Delete the 0018 throwaway screen as part of this issue.
- iOS gates are slow — lower turn cap; confirm the simulator destination first.
