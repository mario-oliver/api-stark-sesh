# Issue: Green the baseline (pre-consolidation gate cleanup)

## ID
`0000`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- None. This issue changes no domain shape and no public contract. It only makes the
  repo's native `npm run lint` and `npm test` gates pass on an otherwise-untouched
  tree, so the consolidation issues (0001+) run against a green baseline.

## Goal
`npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build` all exit 0 on the
current tree, with **no domain/behavior change** — purely the mechanical cleanups
needed to stop pre-existing, out-of-scope breakage from blocking every downstream
inner-loop run.

## Context
Preflight for issue 0001 found the baseline RED on two whole-repo gates for reasons
unrelated to the consolidation:
- `npm test` crashed because `src/services/spriteGen/engine/index.test.ts` calls
  `node:test`'s `mock.module` at import time, which throws on Node 24 unless the
  runner is started with `--experimental-test-module-mocks`.
- `npm run lint` reported 11 unused-var / `prefer-const` errors scattered across
  spriteGen, exerciseAgent, and `serializeDailyTask` — all out of scope for 0001+.

The inner loop requires a green baseline (Stage 0); these failures would thrash the
self-heal loop against breakage no consolidation issue is allowed to touch. This is
that allowed cleanup, isolated into one pre-issue.

## Dependencies
- Blocked by: —
- Blocks: 0001 (and every later inner-loop run — they all gate on whole-repo lint/test)

## Scope
- Test runner: enable Node test module-mocking so the existing spriteGen engine test
  runs (add `--experimental-test-module-mocks` to the `test` script). No test logic
  changes.
- Lint: remove unused imports/vars and one `prefer-const` across the flagged files;
  prefix a genuinely-unused function arg with `_` per the repo's eslint convention.

## Out of scope
- No schema change, no `prisma` change, no behavior change.
- Do NOT start the CareAction consolidation (that is 0001+). Do NOT delete files that
  later issues delete — only the minimal line-level cleanup to clear each lint error.
- The pre-existing `no-explicit-any` **warning** in `src/types/index.ts` stays (it is a
  warning, not an error; `eslint src --ext .ts` does not fail on warnings).

## Acceptance criteria
- [ ] (machine) `npm test` exits 0 with 0 failing tests (spriteGen engine test now runs
      and passes).
- [ ] (machine) `npm run lint` exits 0 (0 errors).
- [ ] (machine) `npx tsc --noEmit` exits 0.
- [ ] (machine) `npm run build` exits 0.
- [ ] (machine) `git diff` touches only the test script + the flagged lint sites — no
      schema, no domain logic.

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Baseline ref
`0cf9f8d00b030f31559b92d399ebd07a370a8254`

## Notes for agent
Flagged sites (from baseline preflight, commit 0cf9f8d):
- `package.json` `test` script → add `--experimental-test-module-mocks`.
- `src/services/carePlans/careActionStepService.ts:2` — unused `categoryToBucket` import.
- `src/services/dailyCare/serializeDailyTask.ts:1` — unused `prisma` import.
- `src/services/exerciseAgent/graph.ts:114` — unused `state` arg → `_state`.
- `src/services/spriteGen/engine/index.test.ts:1,42` — unused `before` import, unused
  `DEFAULT_ANIMATION_SPECS` import.
- `src/services/spriteGen/engine/postProcess.ts:11` — `let img` → `const img`.
- `src/services/spriteGen/orchestrator.ts:162,173` — unused `framesComplete`.
- `src/services/spriteGen/sessionService.ts:4,5,6` — unused `isS3Ready`,
  `getPresignedSpriteFrameViewUrl`, `buildSpriteFrameKey`, `SpriteAnimation`.
