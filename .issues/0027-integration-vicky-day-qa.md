# Issue: Integration — a full Vicky day, end-to-end for real

## ID
`0027`

## Type
- Work: `Human-in-the-loop`
- Shape: `integration issue`

## Target repo
`api-stark-sesh` + `stark-sesh` + `StarkHealthiOS` (real API, real S3, real DB —
no mocks)

## Contract (frozen)
- The three PRDs' Definitions of Done are the checklist:
  [[PRD-stark-plan-fidelity-workout-video]] §Definition of Done,
  [[PRD-stark-plan-fidelity-workout-video-ios]] §Definition of Done, and
  [[PRD-batched-workout-scheduling]] §Definition of Done (ADR-0005).

## Goal
The whole epic proven as one lived day: Vicky's Plan 2 imported for real, a
Workout done on a phone with a clip recorded and a voice note confirmed, the day
panel showing all of it — before the umbrella branches merge.

## Context
Final gate of the epic, same role 0009 played for the consolidation epic.

## Dependencies
- Blocked by: 0021, 0023, 0025, 0026 (and 0022 via 0026), 0028, 0029, 0030,
  0031, 0032, 0033
- Blocks: — (epic ships after this)

## Scope
Run web + API + the iOS app together on the umbrella branches against a dev DB
with real S3 config — web on a phone-sized viewport (and at least once on an
actual phone), iOS on a real device (camera):
1. Run `plan:import` → plan page shows "Plan 2 — June 26, 2026": 15 rows,
   4 tier groups, dosages, the YouTube link on Stairs Hip Stretch; prior plan
   deactivated; run import again → nothing changes. Verify on web AND iOS.
2. Web: Start Workout → step through the 5 CORE rows (skip one on purpose) →
   record a clip on Ground Poles → finish → speak a voice note → confirm the
   draft.
3. Verify: completions + tolerance on today; the clip plays and downloads from
   the day panel; the weekly counter incremented (and the skipped-step day
   still counts — ADR-0005: ≥2 CORE completions, skips never veto).
3b. Batched behavior (ADR-0005): a day with no CORE interaction shows zero
   CORE rows on Today AND a clean calendar entry, and scores full with ROM
   done; the recommendation line reads sensibly across recommended / rest /
   done-today states; complete only ONE CORE exercise on some day → it logs
   but the weekly counter does NOT tick; abandon a workout after 2 exercises →
   the day has exactly 2 CORE rows; "Add exercise" works from Today and
   in-flow (add an ON_WALKS circle set mid-workout and complete it).
4. Standalone walking video: upload from Today, download it back.
5. iOS (on device): a second full Workout day — step the CORE rows → film one
   exercise via the system camera → finish → voice note → confirm; clip plays,
   saves to Photos, share sheet works; weekly counter consistent with what web
   shows for the same week.
6. Cross-platform consistency: a clip recorded on iOS is visible/playable on
   web for the same day, and vice versa.
7. Sanity: `DAILY_LOG` extraction, `VoiceNote` worker, and sprite companion
   behavior unchanged (existing suites green on all three repos).
8. File follow-up issues for anything found; nothing gets "fixed live" here.

## Out of scope
- No new features, no fixes beyond trivial gate-breakers — findings become issues.

## Acceptance criteria
- [ ] (machine) All three repos' full gates green on the umbrella branches.
- [ ] (trust-prior-verify) Steps 1–7 pass end-to-end, witnessed by Mario;
      findings filed.

## Feedback Loops
```bash
# api-stark-sesh
npm test && npx tsc --noEmit && npm run lint && npm run build
# stark-sesh
npm test && npx tsc --noEmit && npm run lint && npm run build
# StarkHealthiOS
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`<filled at preflight — one per repo>`

## Notes for agent
- Umbrella branches: `epic/stark-plan-workout` in all three repos; this issue
  runs on them and gates the umbrella → master PRs (review-diff on the
  cumulative diff per repo).
