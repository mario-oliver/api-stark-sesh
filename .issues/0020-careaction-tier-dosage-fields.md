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
- Blocks: 0021, 0023, 0025, 0028, 0029

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
- [x] (machine) Migration applies cleanly; `prisma migrate diff` empty afterward. ✅
      `20260724022930_careaction_tier_dosage` created+applied via `prisma migrate dev`
      against the dev DB (Neon reachable — no fallback needed); afterward
      `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
      --exit-code` → "No difference detected", exit 0.
- [x] (machine) POST/PATCH a care action with all six new fields round-trips them
      verbatim through the care-plan GET payload. ✅
      `src/services/carePlans/careActionTierDosage.test.ts` — zod create/update accept
      all six (and explicit nulls; rejects bad tier / daysPerWeek 8); fakePrisma
      round-trip create→`getActiveCarePlan` carries the six verbatim; partial update
      changes only the sent fields; unset fields serialize null with keys present.
- [x] (machine) Today payload rows for plan-sourced actions include `tier` +
      target fields from the linked CareAction; ad-hoc rows serialize them null. ✅
      `src/services/dailyCare/dailyRowTierDosage.test.ts` — serializer surfaces the six
      from the `careAction` join verbatim; `loadTodayPayload`'s Prisma include is
      asserted to select all six on the join (wiring proof); ad-hoc rows all-null with
      keys present. `DailyCareAction` model untouched (join only, no snapshot).
- [x] (machine) History and calendar payloads expose `tier` on rows (needed for
      the web weekly-counter computation, 0025). ✅
      `src/controllers/dogsController.history.test.ts` — history log entries gain a
      `dailyCareActions` row array with `status` + tier/dosage via the join
      (`completedCount` keeps COMPLETED-only meaning); calendar suite in
      `careActionTierDosage.test.ts` — `days[].actions` rows carry tier/dosage,
      ad-hoc rows null, no-log days `[]`.
- [x] (machine) Existing test suite stays green (no behavior change elsewhere). ✅
      `npm test` 103/103 pass (91 baseline + 12 new); no existing test modified;
      `npx tsc --noEmit` 0; `npm run lint` 0 errors (1 pre-existing baseline warning
      in `src/types/index.ts`, file untouched); `npm run build` exit 0. No
      scheduling / `resolveTodayLog` instantiation change (fields ride the existing
      join reads).

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Baseline ref
`cc2c4c0dc6d3fe99ab851d5ef677d090376ec4c1` (epic/stark-plan-workout at preflight, 2026-07-23)

## Notes for agent
- Follow the migration naming pattern in `prisma/migrations/`.
- Serializers live in `src/services/dailyCare/serializeDailyCare.ts`,
  `src/services/carePlans/` (`serializeCarePlan`), and the calendar summary in
  `carePlanService.ts` — check all payload shapes that embed actions.
- Branch off umbrella `epic/stark-plan-workout`, merge back into it — never
  straight to `master`.
