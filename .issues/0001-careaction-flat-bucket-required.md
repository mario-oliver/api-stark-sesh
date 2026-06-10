# Issue: Make CareAction flat and bucket-required

## ID
`0001`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: `context.md#CareAction`, `context.md#Bucket` — `bucket` is
  required; there is no `category`; CareAction has no child steps.
- Target schema: `Engineering/Data Model.md` (CareAction / CareBucket sections).

## Goal
`CareAction` is one flat table grouped by a **required** `bucket`, with the second
taxonomy and the step hierarchy fully removed from schema and code.

## Context
PRD `Care Data Model Consolidation` → Data/schema decisions. ADR-0002 moves 1 & 2
(bucket-only taxonomy; kill the Exercise→Movement hierarchy). Pre-launch clean break:
destructive migration, no backfill.

## Dependencies
- Blocked by: —
- Blocks: 0002 (DailyCareAction edits serialize on the same model), 0006 (reseed)

## Scope
- Schema: `CareAction.bucket` `CareBucket?` → **required**; delete `category` field +
  `CareActionCategory` enum; delete `categorySnapshot` from `DailyCareAction`; delete
  models `CareActionStep` and `DailyCareActionStep` (+ their relations).
- Code: update services/handlers/agent code that read/write `category`, `*Step`, or
  `categorySnapshot`; CareAction create/update requires `bucket`.
- Tests: written with the issue (handler-level, not schema-only).
- `prisma generate` + regenerate client at `src/generated`.

## Out of scope
- Do NOT touch `DailyTask`, sessions, `VoiceNote`, or `HealthObservation` (other
  issues). Do NOT add any replacement for steps — distinct movements are distinct
  CareActions (a data/seed concern handled in 0006).

## Acceptance criteria
- [ ] (machine) Creating a `CareAction` without a `bucket` is rejected; with a valid
      bucket it persists and round-trips through the service.
- [ ] (machine) `CareActionCategory`, `categorySnapshot`, `CareActionStep`,
      `DailyCareActionStep` do not appear anywhere in `src/`.
- [ ] (machine) `npx prisma validate` passes and the generated client has no
      `careActionStep` / `category` members.
- [ ] (machine) typecheck, lint, test, build all exit 0.

## Feedback Loops
```bash
npm test                 # incl. new CareAction bucket-required + no-steps tests
npx tsc --noEmit
npm run lint
npm run build            # runs prisma generate && tsc
! grep -rEn "CareActionCategory|categorySnapshot|CareActionStep|DailyCareActionStep" src
```

## Baseline ref
`95cebe9e95e4db6857d17620b3c1698e9f01a52d`  (post-0000; native gates green, grep red = the job)

## Notes for agent
Likely files: `prisma/schema.prisma`, CareAction service/routes, the Exercise agent's
draft-commit path (it may still write steps/category). Start with the schema, run
`prisma generate`, then chase the TypeScript errors — they are your worklist.
