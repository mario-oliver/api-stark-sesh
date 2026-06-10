# Issue: Reseed dev/test data to the consolidated shape

## ID
`0006`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: all of `context.md` — the seed is the canonical example of the
  new model and must use the settled terms verbatim.
- Target schema: `Engineering/Data Model.md`.

## Goal
`npm run db:seed` produces a valid dataset in the consolidated shape that exercises
every surviving entity, so dev/test and the integration issue have realistic data.

## Context
PRD → functional requirement 8 + clean-break posture (reseed, no backfill). This is the
slice that proves the whole new schema hangs together end to end at the data layer.

## Dependencies
- Blocked by: 0001, 0002, 0003, 0004, 0005 (needs the final schema)
- Blocks: INT1

## Scope
- Rewrite `prisma/seed.ts` to create: a User + Dog + DogMember; a `CarePlan` with flat
  `CareAction`s across all three buckets — including a RECOVERY medication action and
  the left/right pair as **distinct** CareActions; a `DailyCareLog` with
  `DailyCareAction`s showing `source` + actual-vs-target; a `HealthObservation`; and a
  sample `CareAgentSession` per surviving `kind` (`PLAN_BUILD`, `PLAN_AUDIT`).
- Tests: seed runs clean against a fresh DB and the resulting rows validate.

## Out of scope
- Schema changes (done in 0001–0005). No `DAILY_LOG` session content beyond an empty/
  illustrative stub.

## Acceptance criteria
- [ ] (machine) `npm run db:seed` exits 0 against a freshly migrated DB.
- [ ] (machine) Seed creates ≥1 CareAction in each of ACTIVITY/MOBILITY/RECOVERY, a
      medication RECOVERY action, distinct left/right actions, ≥1 DailyCareAction with
      a non-PLAN `source`, ≥1 HealthObservation, and ≥1 CareAgentSession.
- [ ] (machine) typecheck, lint, build exit 0.

## Feedback Loops
```bash
npm run build            # prisma generate && tsc
npx prisma migrate reset --force --skip-seed && npm run db:seed
npm test                 # seed-shape assertions
npx tsc --noEmit
npm run lint
```

## Baseline ref
`<filled by inner loop at preflight>`

## Notes for agent
This is the integration canary at the data layer — if the seed can't express the model
cleanly, the model has a gap; flag it rather than forcing it. Needs DB env vars for
`migrate reset`/`generate`.
