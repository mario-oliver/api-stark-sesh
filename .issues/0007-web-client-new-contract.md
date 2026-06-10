# Issue: Update the web client to the consolidated contract

## ID
`0007`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- Shared vocabulary: `context.md` (CareAction/Bucket/DailyCareAction/CareAgentSession/
  VoiceNote/HealthObservation) + `Engineering/Data Model.md`. This issue gates against
  the frozen Contract and **mocks the API** — it does not run the real API.

## Goal
The web app compiles and its existing screens keep working against the consolidated API
shapes — no references to removed fields/entities remain.

## Context
PRD → UX decisions (no new UI; existing screens keep working) + the multi-repo rule:
because the Contract is frozen in context.md, this runs in PARALLEL with the API work.

## Dependencies
- Blocked by: — (Contract already frozen)
- Blocks: INT1

## Scope
- Update API client types / fetchers / components that reference removed shapes:
  `category`, `CareActionStep`/steps, `DailyTask`, the old session shapes,
  `VoiceNote.extraction`. `bucket` is now always present on a CareAction.
- Keep the three-bucket views rendering; adjust to the unified `DailyCareAction` shape.
- Tests: update/extend vitest coverage for any changed data mapping; mock API
  responses in the new shape.

## Out of scope
- No new UI/features. No real cross-repo calls (that's INT1). Do not touch API repo.

## Acceptance criteria
- [ ] (machine) No references to `category` (as CareAction taxonomy), `CareActionStep`,
      `DailyTask`, `ExerciseAgentSession`, `ProgramAuditSession`, or `VoiceNote.extraction`
      remain in `stark-sesh` source.
- [ ] (machine) `npm test`, `npx tsc --noEmit`, `npm run build` exit 0; lint is **scoped to
      files this issue changed** (no NEW lint errors introduced) — see gate note below.
- [ ] (trust-prior-verify) The bucket dashboard and daily views render correctly
      against new-shape mock data. (Human eyeballs.)

## Feedback Loops
<!-- Gate scoped during inner-loop preflight (2026-06-10), per explicit decision:
     `npm run lint` is RED on baseline with 6 PRE-EXISTING errors in files OUTSIDE
     this issue's scope (HistoryClient, RepCounter, DogPhoto, use-countdown, and
     use-sprite-animation — the last ADR-0002-protected: "sprites untouched"). A
     full-repo lint gate could never reach exit 0 from this issue's work alone, so
     lint is scoped to files changed vs baseline (proves: no NEW lint errors).
     The kill-list grep is scoped to source dirs (criterion #1 says "in source")
     and excludes node_modules/.next build artifacts; tsc enforces removal of any
     `.category` / `.extraction` *access* sites once the types are deleted. -->
```bash
BASE=6d5dc91e03b0a5b4eabb0db7141cbaf2c3cfd6e0   # baseline ref (this issue)

npm test                 # vitest run
npx tsc --noEmit         # full typecheck

# Lint ONLY the files this issue changed vs baseline; empty changeset => pass.
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts' '*.tsx')
if [ -n "$CHANGED" ]; then npx eslint $CHANGED; else echo "scoped-lint: no changed TS files"; fi

npm run build            # next build

# Kill-list must be gone from SOURCE (acceptance criterion #1):
! grep -rEn "CareActionStep|DailyTask|ExerciseAgentSession|ProgramAuditSession|CareActionCategory|categorySnapshot|CATEGORY_LABELS|extraction:" app components lib hooks
```

## Baseline ref
`6d5dc91e03b0a5b4eabb0db7141cbaf2c3cfd6e0` (stark-sesh, captured 2026-06-10)

## Notes for agent
Run in `stark-sesh`. Start by grepping for the kill-list to build the worklist. Mock
the API in tests — do not stand up the real API here.

**Preflight findings (2026-06-10):**
- No generated/OpenAPI client — API types are HAND-WRITTEN in `lib/api/endpoints/`
  (`dogs.ts`, `uploads.ts`). "Regenerate from contract" = hand-edit those type/interface
  defs + their client methods to match the consolidated Data Model. `dogs.ts` is the hub.
- Worklist (119 source hits): `lib/api/endpoints/dogs.ts` (types + client methods — the
  bulk), `lib/api/endpoints/uploads.ts`, `lib/upload-care-step-media.ts`, `lib/care/labels.ts`
  (`CATEGORY_LABELS`), `lib/care/default-routine.ts`, and components: `MovementEditor`,
  `MovementRow`, `TaskRow`, `ExerciseAgentDialog`, `ProgramAuditDialog`, `CareActionCard`,
  `ActionRow`, `ExerciseCard`, `CareActionForm`; pages: `tasks/TasksPageClient`,
  `today/BucketDetailClient`, `onboarding/page`.
- **`DailyTaskSource` naming (decide while implementing):** `dogs.ts:37` exports
  `type DailyTaskSource = 'PLAN'|'AD_HOC'|'LLM_EXTRACTED'|'PLAN_VARIATION'`. Criterion #1
  forbids the `DailyTask` substring, so rename it (e.g. `DailyCareActionSource`); values
  unchanged. NOTE the Data Model "Enums Summary" still literally lists `DailyTaskSource`
  (line 137) — likely doc lag from the consolidation; if the frozen Contract truly keeps
  that name, STOP and flag the conflict to the outer loop rather than guessing.
- **Scoped-lint side effect:** editing `dogs.ts` pulls it into the scoped-lint set, which
  surfaces a PRE-EXISTING `@typescript-eslint/no-empty-object-type` at `dogs.ts:241`
  (`UpdateCareActionInput extends Partial<CreateCareActionInput> {}` — a SURVIVING type).
  Fix it inline since you now own the file: `export type UpdateCareActionInput =
  Partial<CreateCareActionInput>`. (The twin at `dogs.ts:92`, `UpdateCareActionStepInput`,
  is deleted with CareActionStep.)
