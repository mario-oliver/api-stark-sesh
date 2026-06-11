# Issue: Extract and commit ad-hoc DailyCareActions, with VoiceNote provenance

## ID
`0012`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- Vocabulary: `context.md#DailyCareAction` (now documents the `voiceNoteId` FK and
  `source: LLM_EXTRACTED`), `context.md#CareAgentSession`.
- Wire shape: adds `adHocActions[]` to the DAILY_LOG draft (paper Contract in
  [[Issues - DAILY_LOG Voice Flow]]).

## Goal
A DAILY_LOG utterance that names an activity not on today's plan ("we did a surprise
10-minute walk") becomes an ad-hoc `DailyCareAction(source: LLM_EXTRACTED)` on today's
log when confirmed, carrying `voiceNoteId` provenance.

## Context
[[PRD-daily-log-voice-flow]] FR2 (ad-hoc), FR8 (provenance), Data/schema (the one
additive migration). [[ADR-0003-daily-log-voice-flow]] decisions 2, 4.

## Dependencies
- Blocked by: 0011
- Blocks: 0013

## Scope
- **Migration:** add nullable `voiceNoteId String?` + `VoiceNote` relation to
  `DailyCareAction` (symmetric with `HealthObservation.voiceNoteId`). One additive
  migration; `prisma generate`.
- Extend the DAILY_LOG extraction to produce `adHocActions[]` (each: `changeId`,
  `name`, `bucket`, optional `actualReps`/`actualDurationSeconds`,
  `extractionConfidence`, `needsReview`).
- Commit selected ad-hoc items as `DailyCareAction(source: LLM_EXTRACTED,
  careActionId: null, voiceNoteId, bucket, nameSnapshot, actual*…)` on today's log.

## Out of scope
- Completion matching of *planned* actions / update-in-place (→ 0013).
- Clarifying questions for an un-inferable `bucket` — here, default/flag with
  `needsReview` (→ proper `AWAITING_INPUT` in 0014).
- Backfilling existing rows (they keep `voiceNoteId = null`).

## Acceptance criteria
- [ ] (machine) `prisma validate` passes; `DailyCareAction.voiceNoteId` exists in
  schema + generated client; `tsc` build passes.
- [ ] (machine) `prisma migrate diff --from-config-datasource` shows **no drift**
  between schema and the new migration.
- [ ] (machine) Extraction over an ad-hoc transcript yields `adHocActions[]` with the
  expected `name`/`bucket`.
- [ ] (machine) Confirm creates `DailyCareAction` rows with `source: LLM_EXTRACTED`,
  `careActionId: null`, and `voiceNoteId` set.
- [ ] (machine) Observation path from 0011 still commits with `voiceNoteId`.

## Feedback Loops
```bash
npx prisma validate
# Drift gate (Prisma 7.8): live datasource (Neon dev DB) vs schema datamodel.
# Exit 0 = no drift, 2 = drift. The migration must be APPLIED (prisma migrate dev),
# not just authored, or this stays red. --from-migrations needs a shadowDatabaseUrl
# that isn't configured here, so use --from-config-datasource.
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code
npm test            # tsx --test --experimental-test-module-mocks 'src/**/*.test.ts'
npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Baseline ref
`e802b0e243f1719edb7222bf7320ae335cf34f11` (cut from umbrella `epic/daily-log-voice-flow`, 2026-06-11)

## Notes for agent
- `source` enum already includes `LLM_EXTRACTED` and `AD_HOC` — ADR-0003 says voice
  ad-hoc rows use `LLM_EXTRACTED`. Don't add new enum values.
- `nameSnapshot` is required on `DailyCareAction`; set it from the extracted `name`.
- Watch the `@@unique([dailyCareLogId, careActionId])` constraint — ad-hoc rows have
  `careActionId: null` so multiple are allowed (Postgres treats NULLs as distinct).
