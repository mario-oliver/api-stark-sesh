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
- [ ] (machine) Decoding tests pass for full, partial, and null-field payloads.
- [ ] (machine) Grouping util: PRD fixture rows land in the right sections;
      null-tier plan renders via the existing path.
- [ ] (machine) Dosage formatter matches the PRD rows (e.g. Ground Poles →
      "2 sets × 6, rest 2 min, 3 d/wk").
- [ ] (machine) iOS gate green.
- [ ] (trust-prior-verify) Plan page reads like Vicky's plan on a device.

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`<filled by the inner loop at preflight>`

## Notes for agent
- Keep decoded field names verbatim from the 0020 serializer shape — test
  against a fixture mirroring it ([[stark-web-api-bucket-contract-drift]] is the
  cautionary tale).
- iOS gates are slower — lower turn cap per repo CLAUDE.md.
- Branch off umbrella `epic/stark-plan-workout` (StarkHealthiOS), merge back
  into it.
