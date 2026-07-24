# Issue: Add Tier + Vicky dosage fields to CareAction, exposed end-to-end

## ID
`0020`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- This issue FREEZES the contract the web issues gate against:
  `enum CareActionTier { CORE ROUTINE ON_WALKS AS_NEEDED }` and six nullable
  `CareAction` fields — `tier`, `daysPerWeek`, `targetHoldSeconds`, `targetSets`,
  `restBetweenSetsSeconds`, `referenceUrl` — serialized under exactly those names.
- Vocabulary: `context.md#Tier`, `context.md#CareAction` (Stark-plan extensions),
  ADR-0004 §1. Tier is execution context, NOT a second taxonomy — `bucket` stays
  required and untouched.

## Goal
The API can store and serve Vicky's dosage language: every care-plan, today,
history, and calendar payload carries the new fields, and care-action
create/update accepts them — so the web can render her plan exactly.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirements 1, 6, 7;
Data/schema decisions (Migration 1). ADR-0004.

## Dependencies
- Blocked by: —
- Blocks: 0021, 0023, 0025

## Scope
- Prisma migration: `CareActionTier` enum + the six nullable columns on
  `CareAction`. No backfill (existing rows stay null).
- Zod schemas for care-action create/update accept the new fields (all optional).
- Serializers: care-plan payloads include the new fields on each action; today /
  history / calendar rows expose `tier` and the target fields of the **linked**
  `CareAction` via the relation join — `null` for ad-hoc rows. (PRD forbids
  touching `DailyCareAction` — no snapshot column, join only.)
- Tests written with the issue: round-trip create→get, serializer field presence,
  ad-hoc null case.

## Out of scope
- No scheduling / `resolveTodayLog` behavior change (`frequency` still drives
  instantiation — PRD req. 6).
- No changes to `DailyCareAction`, `DailyCareLog`, `VoiceNote`,
  `CareAgentSession` models.
- No plan content — the Plan 2 import is 0021.
- No web changes.

## Acceptance criteria
- [ ] (machine) Migration applies cleanly; `prisma migrate diff` empty afterward.
- [ ] (machine) POST/PATCH a care action with all six new fields round-trips them
      verbatim through the care-plan GET payload.
- [ ] (machine) Today payload rows for plan-sourced actions include `tier` +
      target fields from the linked CareAction; ad-hoc rows serialize them null.
- [ ] (machine) History and calendar payloads expose `tier` on rows (needed for
      the web weekly-counter computation, 0025).
- [ ] (machine) Existing test suite stays green (no behavior change elsewhere).

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Baseline ref
`<filled by the inner loop at preflight>`

## Notes for agent
- Follow the migration naming pattern in `prisma/migrations/`.
- Serializers live in `src/services/dailyCare/serializeDailyCare.ts`,
  `src/services/carePlans/` (`serializeCarePlan`), and the calendar summary in
  `carePlanService.ts` — check all payload shapes that embed actions.
- Branch off umbrella `epic/stark-plan-workout`, merge back into it — never
  straight to `master`.
