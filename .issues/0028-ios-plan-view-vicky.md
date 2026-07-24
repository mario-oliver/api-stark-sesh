# Issue: iOS plan view speaks Vicky — tier grouping, dosage, reference links

## ID
`0028`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS)

## Contract (frozen)
- The 0020 CareAction contract: `tier` (`CORE|ROUTINE|ON_WALKS|AS_NEEDED`),
  `daysPerWeek`, `targetHoldSeconds`, `targetSets`, `restBetweenSetsSeconds`,
  `referenceUrl` — decoded with names verbatim, null/absent tolerated. Mocks the
  API in tests (multi-repo rule); real cross-repo path is 0027.
- Vocabulary: `context.md#Tier`, `context.md#CareAction`.

## Goal
The iOS plan surface shows Vicky's plan the way she prescribes it: four Tier
groups, per-exercise dosage, tappable reference-video links — SwiftUI-native.

## Context
[[PRD-stark-plan-fidelity-workout-video-ios]] Functional requirements 1–2.
Sibling of web issue 0023.

## Dependencies
- Blocked by: 0020 (contract)
- Blocks: 0027

## Scope
- Extend `DogModels` decoding with the six new fields (optional).
- Plan surface: tier-grouped sections ordered CORE → ROUTINE → ON_WALKS →
  AS_NEEDED; null-tier plans render exactly as today (regression case); dosage
  line per action; `referenceUrl` opens in Safari/SFSafariViewController.
- XCTests: contract decoding (extend `ContractDecodingTests` pattern incl.
  null-tier), grouping/fallback logic, dosage formatter against the PRD rows.

## Out of scope
- No Workout/Today changes (0029), no video (0030), no API changes.
- No editing of tier/dosage fields on iOS.

## Acceptance criteria
- [x] (machine) Decoding tests pass for full, partial, and null-field payloads. ✅
      `ContractDecodingTests` +4 cases: `decodesFullTierAndDosageFields` (all six,
      Ground Poles shape), `decodesPartialTierFields_referenceUrlOnly` (Stairs Hip
      Stretch), `decodesLegacyPayload_withoutNewFields` (pre-0020, all nil),
      `toleratesExplicitNullAndUnknownTier` (null + `SUPER_CORE` → nil, no throw).
      `CareActionRecord` custom decoder decodes the six keys verbatim; `tier` via
      `CareActionTier(wireValue:)`.
- [x] (machine) Grouping util: PRD fixture rows land in the right sections;
      null-tier plan renders via the existing path. ✅
      `PlanTierGrouping.sections`/`isTiered` — `testGrouping_sectionsInPrescriptionOrder`
      (out-of-order input → CORE→ROUTINE→ON_WALKS→AS_NEEDED), `emitsOnlyNonEmptyTierSections`,
      `nilTierPlan_fallsBack` (isTiered false, sections empty → ExercisesView bucket path).
- [x] (machine) Dosage formatter matches the PRD rows (e.g. Ground Poles →
      "2 sets × 6, rest 2 min, 3 d/wk"). ✅
      `CareDisplay.dosageLine` — Ground Poles → "2 sets × 6, rest 2 min, 3 d/wk";
      Step Up (reps 5, hold 3, 3 d/wk) → "5 reps, hold 3s, 3 d/wk"; ROM (reps 15, 7 d/wk)
      → "15 reps, 7 d/wk"; Stairs Hip Stretch (referenceUrl only) → nil.
- [x] (machine) iOS gate green. ✅
      `** TEST SUCCEEDED **` — locked xcodebuild (iPhone 17, OS 26.2),
      `-only-testing:StarkHealthiOSTests`, 31/31 pass (13 new this issue). No existing
      test modified or weakened.
- [ ] (trust-prior-verify) Plan page reads like Vicky's plan on a device.

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`6ed2d4c262c85089a7c464f1a45bc2cad14eae55` (epic/stark-plan-workout @ StarkHealthiOS worktree preflight, 2026-07-23)

## Notes for agent
- Keep decoded field names verbatim from the 0020 serializer shape — test
  against a fixture mirroring it ([[stark-web-api-bucket-contract-drift]] is the
  cautionary tale).
- iOS gates are slower — lower turn cap per repo CLAUDE.md.
- Branch off umbrella `epic/stark-plan-workout` (StarkHealthiOS), merge back
  into it.
