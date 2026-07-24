# Issue: Build the iOS Workout flow — Today card, stepper, weekly counter, voice close

## ID
`0029`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS)

## Contract (frozen)
- The 0020 contract: today/history/calendar rows expose `tier` + linked-action
  targets. Mocks the API in tests; real path is 0027.
- Vocabulary: `context.md#Workout` — derived, no table; workout day = every CORE
  `DailyCareAction` `COMPLETED` or `PARTIALLY_COMPLETED`; Mon–Sun; target 3–4;
  counter computed, never stored. Same rule as web `lib/care/workout.ts` — same
  fixture semantics.
- Design contract: the web-0024-chosen design direction (recorded in issue 0024
  on completion) — adapted SwiftUI-native, not pixel-ported (0018→0019
  precedent).
- Completion writes use the EXISTING daily-action update endpoint shape.

## Goal
From the iOS Today view, a caregiver starts a Workout, is guided through the
day's CORE exercises with Vicky's targets, quick-logs completion/tolerance per
step, sees "N of 3–4 workouts this week", and lands in the existing iOS voice →
DAILY_LOG draft-review → confirm path.

## Context
[[PRD-stark-plan-fidelity-workout-video-ios]] Functional requirements 3–5.
Sibling of web issue 0025. iOS DAILY_LOG flow (0018/0019) is merged — reuse,
don't touch.

## Dependencies
- Blocked by: 0020 (contract), 0024 (design choice)
- Blocks: 0030, 0027

## Scope
- `TodayView` Workout card: start button, core-set summary, weekly counter.
- Workout stepper (SwiftUI): today's CORE rows, targets shown, complete/skip +
  tolerance + actuals via existing `APIClient` daily-action update; a
  placeholder slot per step for the 0030 camera button.
- Workout logic (view-model or small model type): `isWorkoutDay` + Mon–Sun
  `workoutsThisWeek` from existing history/calendar payloads — pure, test-heavy.
- End-of-flow: present the existing `VoiceRecordBarView` →
  `DailyLogReviewView` path unchanged.
- XCTests: workout-day rule (PARTIALLY_COMPLETED counts, SKIPPED doesn't,
  no-CORE days false), month-boundary week windows, stepper view-model
  transitions incl. skip, correct update payloads.

## Out of scope
- No video capture (0030 fills the placeholder).
- No API changes; no DAILY_LOG / voice flow changes; no sprite changes.
- No separate iOS prototypes — the design source is the 0024 choice.

## Acceptance criteria
- [ ] (machine) `isWorkoutDay` / `workoutsThisWeek` fixtures pass (mirroring the
      web tests' semantics).
- [ ] (machine) Stepper view-model drives mocked client with correct
      status/tolerance/actuals per step; finish reachable with skips.
- [ ] (machine) iOS gate green.
- [ ] (trust-prior-verify) Flow reads as the chosen 0024 direction, feels
      iOS-native, one-handed usable; voice close is one continuous motion.

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`<filled by the inner loop at preflight>`

## Notes for agent
- Read the 0024 issue file first — the chosen design is recorded there.
- **Design constraints:** `stark-sesh/design-system/stark-sesh/pages/workout.md`
  §"iOS translation" — haptics on Complete/workout-done, Dynamic Type on
  numerals, Reduce Motion, VoiceOver order, system camera sheet; SwiftUI-native
  spacing/idiom over pixel parity.
- Reuse `TodayView` patterns, `VoiceRecordCoordinator`,
  `DailyLogReviewViewModel`; don't fork the voice path.
- iOS gates are slower — lower turn cap.
- Branch off umbrella `epic/stark-plan-workout` (StarkHealthiOS), merge back
  into it.
