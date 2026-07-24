# Issue: Build the Workout flow — Today card, stepper, weekly counter, voice close

## ID
`0025`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- The 0020 contract: today/history/calendar rows expose `tier` + target fields of
  the linked CareAction. Mocks the API in tests; real cross-repo path is 0027.
- Vocabulary: `context.md#Workout` — derived, NO Workout table, weekly counter
  computed never stored; workout day = every CORE `DailyCareAction` of the day
  `COMPLETED` or `PARTIALLY_COMPLETED`; week is Mon–Sun; target "3–4".
- Completion writes go through the EXISTING daily-action update endpoint shape
  (`updateDailyAction` with status/tolerance/actuals) — no new API surface.

## Goal
From Today, a caregiver starts a Workout, is guided through the day's CORE
exercises with Vicky's targets (the 0024-chosen design), quick-logs
completion/tolerance per step, sees "N of 3–4 workouts this week", and lands on
the existing voice bar to speak how it went.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirements 9–12, 17; UX
decisions; ADR-0004 §4, §6.

## Dependencies
- Blocked by: 0020 (contract), 0024 (chosen design)
- Blocks: 0026, 0027

## Scope
- Today page Workout card: start button, core-set summary, weekly counter.
- Workout stepper route implementing the chosen 0024 design over today's CORE
  rows; per-step complete/skip + tolerance + actuals via the existing
  daily-action update client; timers/rep affordances as designed.
- `lib/care/workout.ts`: `isWorkoutDay(dayRows)` (all-CORE rule) and
  `workoutsThisWeek(days)` (Mon–Sun) computed from the existing history/calendar
  payloads — pure functions, vitest-heavy.
- End-of-flow: surface the existing `VoiceRecordBar` → `DailyLogReviewDialog`
  path unchanged ("how did it go?").
- Delete the 0024 dev-route throwaways as part of this issue.
- vitest: workout-day rule (PARTIALLY_COMPLETED counts, SKIPPED doesn't, mixed
  days, no-CORE days are not workout days), week boundary (Mon–Sun, not rolling
  7), counter display states (0, in-range, >4), stepper state transitions.

## Out of scope
- No video capture (0026 adds the real record button; keep the placeholder slot).
- No API changes, no DAILY_LOG / `CareAgentSession` changes, no `VoiceNote`
  changes.
- ROUTINE / ON_WALKS / AS_NEEDED UI beyond what already exists (they stay in
  bucket pages; AS_NEEDED stays ad-hoc-loggable via the existing path).

## Acceptance criteria
- [ ] (machine) `isWorkoutDay`: true only when every CORE row of the day is
      COMPLETED/PARTIALLY_COMPLETED; days with zero CORE rows are false.
- [ ] (machine) `workoutsThisWeek`: Mon–Sun window proven across a month
      boundary; counter matches fixture histories.
- [ ] (machine) Stepper drives the mocked update client with correct
      status/tolerance/actuals payloads per step; finish state reached with
      skips present.
- [ ] (machine) `npm test`, `npx tsc --noEmit`, scoped lint, `npm run build` pass.
- [ ] (trust-prior-verify) Flow matches the 0024-chosen design on a phone; the
      voice close feels like one continuous motion.

## Feedback Loops
```bash
BASE=<baseline ref filled at preflight>
npm test
npx tsc --noEmit
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts' '*.tsx')
if [ -n "$CHANGED" ]; then npx eslint $CHANGED; else echo "scoped-lint: no changed TS files"; fi
npm run build
```

## Baseline ref
`<filled by the inner loop at preflight>`

## Notes for agent
- **Design constraints:** `stark-sesh/design-system/stark-sesh/pages/workout.md`
  (overrides MASTER.md) — thumb-zone bottom bar + safe areas, target sizes,
  numeral-hero timers (transform/opacity only), gesture and reduced-motion
  rules. The 0024 choice decides palette/type adoption; if adopted, tokens go
  app-wide via CSS variables, not workout-only.
- Weekly counter reads existing `getHistory`/`getCalendar` payloads (0020 adds
  `tier` to their rows) — do NOT invent a new endpoint.
- Existing pieces to reuse: `TodayPageClient`, `ExerciseTimer`, `RepCounter`,
  `MeasurementCompletePrompt`, `VoiceRecordBar`, `DailyLogReviewDialog`,
  `lib/care/measurement.ts`.
- Branch off umbrella `epic/stark-plan-workout` (stark-sesh), merge back into it.
