# Issue: Drop MEDICATION from HealthObservationType

## ID
`0005`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: `context.md#HealthObservation` — observations are separate and
  bucket-orthogonal; medication is a `CareAction(bucket: RECOVERY)`, not an
  observation type.
- Target schema: `Engineering/Data Model.md` (Voice & Observations section).

## Goal
`HealthObservationType` no longer contains `MEDICATION`; nothing in code emits it.

## Context
PRD → functional requirement 6; ADR-0002 (medication is a recovery CareAction). Small,
independent slice.

## Dependencies
- Blocked by: —
- Blocks: 0006 (reseed)

## Scope
- Schema: remove `MEDICATION` from enum `HealthObservationType`.
- Code: remove any branch that classified an observation as `MEDICATION`; if a
  voice/agent path produced medication observations, it now produces a
  `CareAction(bucket: RECOVERY)` instead (or simply stops — confirm no caller depends
  on the medication-observation path).
- Tests: an observation cannot be created with type `MEDICATION`; the recovery-action
  path for meds is exercised if one exists.

## Out of scope
- CareAction taxonomy, daily execution, sessions, VoiceNote (other issues). Do NOT
  build a new medication feature — meds are just an ordinary RECOVERY CareAction.

## Acceptance criteria
- [ ] (machine) The generated `HealthObservationType` has no `MEDICATION` member.
- [ ] (machine) `HealthObservationType.MEDICATION` (and any string `"MEDICATION"` used
      as an observation type) absent from `src/`.
- [ ] (machine) typecheck, lint, test, build exit 0.

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
! grep -rEn "HealthObservationType\.MEDICATION|MEDICATION" src/**/observation*
```

## Baseline ref
`<filled by inner loop at preflight>`

## Notes for agent
Smallest slice in the epic. The only subtlety: a voice/extraction path may have mapped
"gave him his meds" to a MEDICATION observation — confirm where that signal should now
land (a RECOVERY CareAction completion) or whether it is simply out of scope here.
