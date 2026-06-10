# Issue: Unify agent sessions into CareAgentSession

## ID
`0003`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: `context.md#CareAgentSession` — one conversational producer,
  `kind` discriminator, polymorphic commit, draft-as-JSON.
- Target schema: `Engineering/Data Model.md` (AI Agent Sessions section).

## Goal
A single `CareAgentSession` table replaces `ExerciseAgentSession` and
`ProgramAuditSession`, and the existing `PLAN_BUILD` and `PLAN_AUDIT` behaviors run
through it unchanged.

## Context
PRD → functional requirement 4 + the in/out boundary: migrate the TWO EXISTING
behaviors (kinds `PLAN_BUILD`, `PLAN_AUDIT`); the `DAILY_LOG` conversational flow is
out of scope (enum value only). ADR-0002 move 4.

## Dependencies
- Blocked by: —
- Blocks: 0004 (adds `voiceNoteId` on this table), 0006 (reseed)

## Scope
- Schema: add `CareAgentSession` (`kind`, `status`, `messages`, `questions`, `draft`,
  `voiceNoteId?`, polymorphic commit FKs incl. `committedCarePlanId`) + enums
  `CareAgentSessionKind` (`DAILY_LOG | PLAN_BUILD | PLAN_AUDIT`) and
  `CareAgentSessionStatus` (`ACTIVE | AWAITING_INPUT | DRAFT_READY | COMMITTED | FAILED`);
  delete `ExerciseAgentSession`, `ProgramAuditSession`, `ExerciseAgentSessionStatus`,
  `ProgramAuditSessionStatus`.
- Code: route the Exercise agent through `kind: PLAN_BUILD`, the Program Audit agent
  through `kind: PLAN_AUDIT`; map their prior JSON (`draft`/`research`/`questions` and
  `report`/`plan`/`selectedChanges`) into the unified `draft` + commit FKs.
- Tests: assert the agents' output **structure/contract** (not LLM wording), and that
  a session persists + commits via `CareAgentSession`.

## Out of scope
- Do NOT implement the `DAILY_LOG` conversation (separate PRD). Do NOT touch
  CareAction taxonomy, DailyCareAction, VoiceNote fields, observations.

## Acceptance criteria
- [x] (machine) A `CareAgentSession(kind: PLAN_BUILD)` and one `(kind: PLAN_AUDIT)`
      each persist, advance status, and record a commit FK.
      → `src/services/careAgentSession/careAgentSession.persistence.test.ts` (4 tests).
- [x] (machine) `ExerciseAgentSession`, `ProgramAuditSession`,
      `ExerciseAgentSessionStatus`, `ProgramAuditSessionStatus` absent from `src/`.
      → grep gate exit 0 (0 matches across src incl. regenerated client).
- [x] (machine) Agent-output contract tests pass (schema shape, not wording).
      → `types.test.ts`, `confirmDraft.test.ts`, draft-envelope asserts in the
      persistence test; DB-gated `programAudit.integration.test.ts` for report/plan shape.
- [ ] (trust-prior-verify) A manual PLAN_BUILD run and a PLAN_AUDIT run on a seeded
      dog still produce a sensible draft/report and commit. (Human eyeballs.)
      → NOT machine-provable (real OpenAI + DB). Surfaced for human review.
- [x] (machine) typecheck, lint, test, build exit 0.

## Feedback Loops
```bash
npm test                 # incl. CareAgentSession persistence + agent-contract tests
npx tsc --noEmit
npm run lint
npm run build
! grep -rEn "ExerciseAgentSession|ProgramAuditSession" src
```

## Baseline ref
`f9487ef37355fd2bcb1bfac447f42c4c3257b68c`

## Notes for agent
The two agents likely live in separate service modules with their own session
repos — converge them onto one repo keyed by `kind`. Keep the LLM prompt/orchestration
logic intact; only the persistence layer and status enum change. Per test-gates,
assert agent output structure, never exact wording.
