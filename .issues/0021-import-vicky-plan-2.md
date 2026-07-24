# Issue: Import Vicky's Plan 2 as a versioned CarePlan — exact and idempotent

## ID
`0021`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- `context.md#CarePlan` versioning rules: one CarePlan per plan Vicky issues,
  prior plan flips `isActive: false`, never mutated in place; entry is a committed
  import script; **email overrides plan doc**.
- The seed content contract: the 15-row table in
  [[PRD-stark-plan-fidelity-workout-video]] §"Plan 2 seed content" — names,
  buckets, tiers, targets verbatim. Changing a row is an outer-loop decision.

## Goal
Running one committed script gives Stark an active CarePlan "Plan 2 — June 26,
2026" containing exactly Vicky's 11 exercises as 15 CareAction rows (email
guidance applied), with the prior plan deactivated and history intact — and
running it again changes nothing.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirements 2–6 and the
seed-content table; ADR-0004 §2–3. Dosage convention: ints carry the upper bound
of Vicky's range; verbatim range text stays in `instructions`.

## Dependencies
- Blocked by: 0020 (fields must exist)
- Blocks: 0027

## Scope
- Typed data file (e.g. `src/services/carePlans/vickyPlan2.ts`): the 15 rows with
  verbatim instructions from the plan doc + email; plan-level notes ("3–4
  days/week, 1 set → 2, rest 2–4 min") as a data-file constant for UI copy reuse.
- Import script + npm script (e.g. `npm run plan:import`) that targets Stark's
  dog id (env/arg), creates the CarePlan, deactivates the prior active plan,
  and is idempotent (re-run: no duplicates, no changes).
- Tests written with the issue: exactness fixture (created rows == data file ==
  15 rows; tiers/buckets/targets match the PRD table), idempotency (run twice),
  prior-plan deactivation, and instantiation behavior for the seeded plan
  (AS_NEEDED rows never auto-instantiate into today; DAILY rows do).

## Out of scope
- No schema changes (0020 owns them).
- Do NOT touch `buildSeedData` / `prisma/seed.ts` — the demo seed stays as-is.
- No `resolveTodayLog` changes; the instantiation test asserts EXISTING behavior.
- No web changes.

## Acceptance criteria
- [ ] (machine) Exactness test: script output equals the data file; the data file
      contains exactly the PRD's 15 rows (names incl. Left/Right, buckets, tiers,
      `daysPerWeek`, `targetSets`/`targetReps`/`targetHoldSeconds`/
      `restBetweenSetsSeconds`, `referenceUrl` on Stairs Hip Stretch only).
- [ ] (machine) Idempotency test: two runs → one active plan, 15 rows, prior plan
      `isActive: false`, zero duplicates.
- [ ] (machine) Instantiation test: seeded AS_NEEDED rows absent from today's
      instantiated actions; DAILY rows present.
- [ ] (machine) Full suite green.

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
- Model the script on the idempotent patterns in `src/services/seed/` but keep it
  a separate, production-safe entry point (it will run against the real DB).
- Verbatim instruction text for the 10 doc exercises is in the PRD's source plan
  extraction; the 11th (Stairs Hip Stretch) uses the email text + YouTube link
  `https://www.youtube.com/watch?v=DtUvGctKHdY`.
- Branch off umbrella `epic/stark-plan-workout`, merge back into it.
