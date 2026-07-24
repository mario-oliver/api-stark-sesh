# Issue: Web plan view speaks Vicky — tier grouping, dosage, reference links

## ID
`0023`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- The 0020 CareAction contract: `tier` (`CORE|ROUTINE|ON_WALKS|AS_NEEDED`),
  `daysPerWeek`, `targetHoldSeconds`, `targetSets`, `restBetweenSetsSeconds`,
  `referenceUrl` — field names verbatim. Mocks the API in tests (multi-repo
  rule); the real cross-repo path is 0027.
- Vocabulary: `context.md#Tier`, `context.md#CareAction`.

## Goal
The plan page shows Vicky's plan the way she prescribes it: grouped by Tier
(Core workout / Routine stretches / On walks / As needed), each exercise showing
her dosage (sets, reps, holds, rest, days/week) and a link to its reference
video where one exists.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirement 8; UX decisions.

## Dependencies
- Blocked by: 0020 (contract)
- Blocks: 0027

## Scope
- Extend the hand-written API types in `lib/api/endpoints/dogs.ts` with the new
  CareAction fields.
- Plan page (`(dashboard)/dogs/[dogId]/tasks` / care-plan surface): group actions
  by tier with the four labeled sections (null-tier actions fall back to the
  current bucket grouping); dosage line per action; external `referenceUrl` link.
- Display labels in `lib/care/labels.ts` for tiers.
- vitest for the grouping/fallback logic and the dosage-line formatter
  (mocked payloads).

## Out of scope
- No editing of tier/dosage fields in `CareActionForm` (plan entry is the 0021
  script; the form keeps its current fields).
- No Today/Workout changes (0025), no video (0026), no API changes.

## Acceptance criteria
- [ ] (machine) Grouping util: tiered actions land in the right section, ordered
      CORE → ROUTINE → ON_WALKS → AS_NEEDED; null-tier plans render exactly as
      today (regression case).
- [ ] (machine) Dosage formatter renders each PRD row correctly (e.g. Ground
      Poles → "2 sets × 6, rest 2 min, 3 d/wk"; holds render as seconds).
- [ ] (machine) `npm test`, `npx tsc --noEmit`, scoped lint, `npm run build`
      all pass.
- [ ] (trust-prior-verify) The plan page reads like Vicky's plan on a phone.

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
- Keep field names verbatim from the Contract — the web/api bucket drift bit
  before ([[stark-web-api-bucket-contract-drift]]); test against a fixture that
  mirrors the 0020 serializer shape.
- Existing plan UI: `components/care/CareActionCard.tsx`, `ActionRow.tsx`,
  `lib/care/display.ts`.
- Branch off umbrella `epic/stark-plan-workout` (stark-sesh), merge back into it.
