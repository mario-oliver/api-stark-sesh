# Issue: Build the web DAILY_LOG draft-review + confirm flow (chosen design)

## ID
`0017`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- Real serialized Contract: `CareAgentSessionPayload` with the DAILY_LOG `draft` shape
  as realized by issue 0011 (`serializeCareAgentSession`), plus the
  `/v1/dogs/:id/care-agent/sessions` create / `:sessionId/messages` /
  `:sessionId/confirm` routes. Gates against this Contract and **mocks the API** in
  tests (per the multi-repo rule); the real cross-repo path is 0020.
- Vocabulary: `context.md#CareAgentSession` (DAILY_LOG), `context.md#DailyCareAction`,
  `context.md#HealthObservation`.

## Goal
After a voice note transcribes, the web app creates a `DAILY_LOG` session, renders the
returned draft (the design chosen in 0016), lets the user answer one clarifying question
if asked, and confirms with `selectedChangeIds` — turning a spoken note into today's
logged care.

## Context
[[PRD-daily-log-voice-flow]] FR1, FR3, FR5, FR6; §UX. Implements the prototype Mario
selected in 0016.

## Dependencies
- Blocked by: 0011 (real draft contract), 0013 (completions in the draft), 0016 (design choice)
- Blocks: 0020

## Scope
- API client: add DAILY_LOG session create (with `voiceNoteId`), `sendMessage`, and
  `confirm` (with `selectedChangeIds`) to the hand-written client in `lib/api/`.
- Wire the post-transcription flow to open the session and render the draft using the
  chosen design: per-item select/deselect, high-confidence pre-selected, `needsReview`
  flagged, the `AWAITING_INPUT` one-question state, the empty-draft message, and the
  inert plan-change nudge (links toward a PLAN_AUDIT session; commits nothing).
- vitest coverage for the data mapping and the select→confirm payload (mock API).

## Out of scope
- Real API integration / e2e (→ 0020). Do not touch the API repo.
- Building the PLAN_AUDIT handoff target (deferred — [[DAILY_LOG to PLAN_AUDIT Handoff]]);
  the nudge only navigates/stubs.
- Redesigning existing care screens beyond what the chosen draft-review needs.

## Acceptance criteria
- [x] (machine) Client can create a DAILY_LOG session, send a message, and confirm with
      `selectedChangeIds` against mocked new-shape responses; the confirm payload contains
      exactly the user-selected `changeId`s and never a `planChangeSuggestion`. ✅
      `lib/api/careAgentDailyLog.test.ts` (create carries `voiceNoteId`, no `message` key;
      messages route; confirm body = `{ selectedChangeIds }`) + `lib/care/dailyLogReview.test.ts`
      (`sanitizeSelectedChangeIds` drops anything without a real `changeId`, de-dupes).
- [x] (machine) Draft mapping renders completions/ad-hoc/observations from a mock
      `CareAgentSessionPayload`; high-confidence pre-selected, `needsReview` surfaced. ✅
      `lib/care/dailyLogReview.test.ts` — `selectableItems` spans all three groups;
      `defaultSelectedChangeIds` pre-selects confident, leaves `needsReview` opt-in.
- [x] (machine) `npm test`, `npx tsc --noEmit`, `npm run build` exit 0; lint scoped to
      changed files (no NEW lint errors). ✅ 14 tests pass; tsc 0; scoped eslint 0/0;
      build compiles. (Full-repo lint still red on baseline per 0007 — scoped clean.)
- [ ] (trust-prior-verify) The flow matches the 0016-selected design. (Mario eyeballs.)
      ⏳ Pending Mario. Two adaptations to confirm: (a) `AWAITING_INPUT` uses the Contract's
      free-text `questions[]` + a reply box (the prototype's fixed candidate cards aren't on
      the wire — the user answers by message, ADR-0003 §5); (b) the 0016 dev route was KEPT
      in-repo at Mario's request (this issue's "delete throwaway" step deferred).

## Baseline ref
`7bea4e75f24b54eadb3026a1b03ac454d16f7231` (stark-sesh, branch
`0017-web-build-draft-review-confirm` off umbrella `epic/daily-log-voice-flow`)

## Feedback Loops
```bash
BASE=<baseline ref filled at preflight>
npm test
npx tsc --noEmit
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts' '*.tsx')
if [ -n "$CHANGED" ]; then npx eslint $CHANGED; else echo "scoped-lint: no changed TS files"; fi
npm run build
```

## Notes for agent
- API types are hand-written in `lib/api/endpoints/` (no generated client) — extend
  `dogs.ts` / the care-agent client methods to match the 0011 serialized shape.
- Keep the draft field names verbatim from the Contract to avoid the web/api drift that
  bit the bucket field before ([[stark-web-api-bucket-contract-drift]]) — test both sides
  against the same fixture shape.
- Delete the 0016 dev-route throwaway as part of this issue.
