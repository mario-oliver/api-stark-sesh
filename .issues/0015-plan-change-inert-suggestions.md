# Issue: Detect plan-change intent and surface it as an inert suggestion

## ID
`0015`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- Vocabulary: `context.md#CareAgentSession` (DAILY_LOG today-only boundary;
  plan changes deferred to PLAN_AUDIT).
- Wire shape: populates `draft.planChangeSuggestions[]` (paper Contract in
  [[Issues - DAILY_LOG Voice Flow]]) — inert, never in `selectedChangeIds`.

## Goal
When a DAILY_LOG utterance implies editing the prescription ("let's add more reps going
forward"), the session captures it as a read-only suggestion the client can nudge on —
committing nothing to the `CarePlan`.

## Context
[[PRD-daily-log-voice-flow]] FR4. [[ADR-0003-daily-log-voice-flow]] decision 8.
The real DAILY_LOG → PLAN_AUDIT handoff is deferred — see task
[[DAILY_LOG to PLAN_AUDIT Handoff]].

## Dependencies
- Blocked by: 0011
- Blocks: —

## Scope
- Extend extraction to detect plan-change intent and emit
  `draft.planChangeSuggestions[]` (each: `text`, `likelyAction`).
- Ensure these are serialized in the DAILY_LOG payload and are **excluded** from
  `selectedChangeIds` handling on confirm (commit does nothing with them).

## Out of scope
- Spawning a PLAN_AUDIT session or any `CarePlan` / `CareAction` write (deferred).
- Client rendering of the nudge (web/iOS issues).

## Acceptance criteria
- [ ] (machine) A plan-change utterance yields a `planChangeSuggestions[]` entry with
  `text`/`likelyAction`.
- [ ] (machine) Confirm with all `changeId`s selected commits **no** `CarePlan` /
  `CareAction` change attributable to a suggestion.
- [ ] (machine) A suggestion's identifier cannot appear in `selectedChangeIds` (or is
  ignored if forced) — no commit path touches it.
- [ ] (machine) Pure-completion / observation transcripts produce an empty
  `planChangeSuggestions[]`.

## Feedback Loops
```bash
node --experimental-test-module-mocks --test
npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Baseline ref
`d5c64156d9c7127a3ace214a5d143d54cdf7b2aa` (epic/daily-log-voice-flow HEAD; branch `issue-0015-plan-change-inert-suggestions`)

## Notes for agent
- Keep suggestions inert data on the draft envelope — give them no `changeId` that the
  commit selector recognizes, so they're structurally un-committable.
- Don't couple to PLAN_AUDIT here; that's the deferred handoff task.
