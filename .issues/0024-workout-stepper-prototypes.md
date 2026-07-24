# Issue: Prototype the Workout stepper (3 throwaways)

## ID
`0024`

## Type
- Work: `Human-in-the-loop`   <!-- AI explores, Mario's taste decides -->
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- Vocabulary: `context.md#Workout` (derived concept — the flow walks today's CORE
  `DailyCareAction`s; the word is Workout, never "Session"), `context.md#Tier`.
- Fixture data: the 5 CORE rows from
  [[PRD-stark-plan-fidelity-workout-video]] §"Plan 2 seed content" with their
  targets — prototypes must render real dosage shapes (sets, reps, holds, rest),
  not lorem ipsum.

## Goal
Three throwaway, interactive takes on the Workout stepper live under one dev
route with mock data, different enough to make Mario's choice informative — so
0025 builds a chosen design instead of the agent's default taste.

## Context
[[PRD-stark-plan-fidelity-workout-video]] UX decisions (taste-sensitive:
prototypes-as-issues, same pattern as 0016 → 0017). Mobile-web first: this gets
used one-handed next to a Great Dane.

## Dependencies
- Blocked by: —
- Blocks: 0025, 0029

## Scope
- `app/dev/workout-proto/` route (pattern of `app/dev/daily-log-proto/`):
  shared fixtures + VariantA/B/C, each a full walk-through: start → 5 core steps
  (targets, complete/skip, tolerance quick-log, timer/rep affordances, a
  placeholder video-record button) → finish screen with a placeholder voice bar.
- Variants should genuinely differ (e.g. one-step-per-screen wizard vs single
  scrolling checklist vs timer-led autoplay) — not one layout in three colors.
- A short README in the route listing what each variant bets on.

## Out of scope
- No real API calls, no persistence, no MediaRecorder — buttons are dumb.
- No changes outside the dev route.
- The chosen design's real build is 0025; deleting the throwaways happens there.

## Acceptance criteria
- [x] (machine) `npm test`, `npx tsc --noEmit`, scoped lint, `npm run build` pass
      (dev route compiles; no test regressions).
- [x] (trust-prior-verify) Mario walks all three on a phone-sized viewport and
      picks one (or a combination) — the choice recorded in this issue file.
      ✅ CHOSEN 2026-07-23: **Variant B — Checklist** (whole-workout scrolling
      page, one card expanded at a time, auto-advance on complete, sticky
      progress header), INCLUDING the Master palette/type it wears (warm
      orange #F97316 / trust blue #2563EB on cream #FFF7ED, Varela Round +
      Nunito Sans). Per design-system rule, palette/type adoption is app-wide
      via tokens — applied by 0025, never workout-only. 0029 adapts B
      SwiftUI-native.
      ⚠️ AMENDED 2026-07-24 (Mario): the ORANGE PALETTE IS REJECTED — colors
      revert to the app's original blue (#1b69a1) + light-blue accents,
      app-wide (web tokens + iOS BrandColors). Variant B layout and the
      Varela Round / Nunito Sans typography adoption stand.

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
`6723bb3c94285afbdc791029245680727973bdd2`

## Notes for agent
- **Design constraints (read first):** `stark-sesh/design-system/stark-sesh/pages/workout.md`
  (overrides `MASTER.md`; ignore Master's landing-page PATTERN section). Hard
  rules for every variant: one primary CTA, bottom-bar thumb zone with safe-area
  padding, ≥44px targets (Complete ≥56px), tabular-nums numeral-hero targets/
  timers, tolerance as icon+label segments (never color-only), no
  swipe-between-steps, subtle motion tier, reduced-motion support.
- Palette/type exploration: one variant wears the Master palette (warm orange /
  trust blue / Varela Round + Nunito Sans), one stays close to the app's current
  shadcn look — adoption is part of Mario's choice and would then apply
  app-wide.
- Reuse `ExerciseTimer` / `RepCounter` where a variant wants them.
- Fixtures: 5 CORE rows (Step Up + Head Stretch L/R, Walk-Through Hind Legs,
  Modified Sit to Stand, Ground Poles) with the PRD targets verbatim.
- Branch off umbrella `epic/stark-plan-workout` (stark-sesh), merge back into it.
