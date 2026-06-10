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
# Prisma 7.8 has no --skip-seed; reset does not auto-seed. Prisma's AI guard blocks
# the agent from running `migrate reset`, so a human runs the reset; the agent runs seed.
npx prisma migrate reset --force && npm run db:seed   # fresh DB → seed exits 0
npm test                 # seed-shape assertions (buildSeedData unit test, DB-free)
npx tsc --noEmit
npm run lint
```

## Baseline ref
`edcab3bc65588a3699fe10847f536bf78aa153bd` (post-rebase incl. 0001–0005; final schema)

## Notes for agent
This is the integration canary at the data layer — if the seed can't express the model
cleanly, the model has a gap; flag it rather than forcing it. Needs DB env vars for
`migrate reset`/`generate`.

## Status — DONE (2026-06-10, inner-loop). Unblocked by an authored reconciliation migration.
Seed + tests green at unit level (`buildSeedData` builder + 7 seed-shape tests) AND against the
live dev DB (`db:seed` exit 0; `migrate diff` reports no drift; 10/10 live row checks pass).
Was briefly blocked on a **dependency defect, not a seed bug** (kept here for the record):

- Issues **0001 (flat CareAction + required bucket)** and **0002 (collapse DailyTask into
  DailyCareAction)** edited `prisma/schema.prisma` but committed **no migration files**.
- `prisma migrate reset` replays only committed SQL, so the live DB is two issues behind the
  schema the generated client expects. `prisma generate` reads `schema.prisma`, so
  client/tsc/tests stayed green and hid the drift until the seed hit the real DB.
- `db:seed` fails `P2011` on `CareAction.category` (a NOT-NULL column 0001 was supposed to drop).
- `prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/schema.prisma
  --script` emits the full reconciliation (DROP category, bucket SET NOT NULL, add DailyCareAction
  columns, drop DailyTask/*Step tables + CareActionCategory/DailyTask* enums, add DailyCareActionSource).

**Unblocked by:** `prisma/migrations/20260610210000_reconcile_flat_careaction_and_dailycareaction`
(authored from `migrate diff`; reconciles 0001/0002 — DROP CareAction.category, bucket NOT NULL,
DailyCareAction columns, drop DailyTask/*Step + dead enums). This is 0001/0002's missing deliverable,
authored under 0006 only to unblock; a human applied it via `migrate reset`. **Recommend back-porting
proper 0001/0002 migrations** so the history reads cleanly per issue.
