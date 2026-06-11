# Issue: Stand up the DAILY_LOG session shell and commit observations from a transcript

## ID
`0011`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh`

## Contract (frozen)
- Vocabulary: `context.md#CareAgentSession` (DAILY_LOG flow), `context.md#HealthObservation`.
- Wire shape: extends `CareAgentSessionPayload.draft` for DAILY_LOG — see the paper
  Contract in [[Issues - DAILY_LOG Voice Flow]] (`observations[]`,
  `planChangeSuggestions[]` keys present; `completions[]`/`adHocActions[]` may be empty
  arrays until 0012/0013). This issue **freezes** that serialized shape.
- Routes: existing `/v1/dogs/:id/care-agent/sessions` family (no new routes).

## Goal
A caregiver's transcribed `VoiceNote` can drive a `CareAgentSession(kind: DAILY_LOG)`
that extracts `HealthObservation`s, presents a reviewable draft, and on confirm commits
the selected observations into today's `DailyCareLog` — the tracer bullet through the
whole DAILY_LOG path (endpoint → agent extraction → draft → confirm → durable rows).

## Context
[[PRD-daily-log-voice-flow]] FR1, FR5, FR6 (observations only here), FR9, FR10.
[[ADR-0003-daily-log-voice-flow]] decisions 1, 3, 9, 10. Observations are the simplest
output: `HealthObservation.voiceNoteId` already exists (no migration), and they need no
matching against today's actions.

## Dependencies
- Blocked by: —
- Blocks: 0012, 0015, 0017, 0019

## Scope
- Accept `kind: DAILY_LOG` (+ required `voiceNoteId`) in `createCareAgentSessionSchema`
  (currently rejected with 400).
- New `services/dailyLog/sessionService.ts` (model the existing `exerciseAgent`
  pattern: prompts + a single extraction tool). On create: load the `VoiceNote`
  transcript, run one extraction pass producing a `draft` with `observations[]` (each:
  `changeId`, `type`, `severity?`, `bodyArea?`, `note`, `extractionConfidence`,
  `needsReview`) and an (empty for now) `planChangeSuggestions[]`. Status →
  `DRAFT_READY`, or `DRAFT_READY` with empty draft + an agent message on no-care
  transcript; `FAILED` on extraction error (leave `VoiceNote.processingStatus`
  untouched).
- Dispatch DAILY_LOG through `CareAgentController.{createSession,confirmSession,
  cancelSession}` alongside PLAN_BUILD/PLAN_AUDIT.
- `confirmSession` for DAILY_LOG: commit the `selectedChangeIds` observations as
  `HealthObservation` rows on today's `DailyCareLog` (`voiceNoteId` set, `userId`,
  `dogId`); status → `COMMITTED`.
- Extend `serializeCareAgentSession.extractDraft` to surface the DAILY_LOG draft
  (today it returns `null`).

## Out of scope
- Ad-hoc `DailyCareAction`s and the `DailyCareAction.voiceNoteId` migration (→ 0012).
- Completion matching / update-in-place (→ 0013).
- `AWAITING_INPUT` clarifying questions (→ 0014) — here, un-inferable observation
  fields ride the draft with `needsReview: true`; do not ask.
- Populating `planChangeSuggestions` (→ 0015) — emit the empty array only.
- Any client UI.

## Acceptance criteria
- [ ] (machine) `POST /v1/dogs/:id/care-agent/sessions { kind: DAILY_LOG, voiceNoteId }`
  returns 201 (no longer 400); missing `voiceNoteId` → 400.
- [ ] (machine) Create over a seeded observation transcript yields `status: DRAFT_READY`
  and a draft with the expected `observations[]` (correct `type`, `needsReview` flags).
- [ ] (machine) Confirm with `selectedChangeIds` creates exactly those `HealthObservation`
  rows on today's `DailyCareLog`, each with `voiceNoteId` set; status → `COMMITTED`.
- [ ] (machine) No-care transcript → `DRAFT_READY`, empty draft, non-empty agent
  message; **not** `FAILED`.
- [ ] (machine) Forced extraction error → `FAILED`; the `VoiceNote.processingStatus` is
  unchanged.
- [ ] (machine) Serialized DAILY_LOG payload exposes the `draft` (not `null`).
- [ ] (machine) `PLAN_BUILD` / `PLAN_AUDIT` create + confirm still pass.

## Feedback Loops
```bash
node --experimental-test-module-mocks --test         # new dailyLog + careAgentController tests
npx tsc -p tsconfig.json --noEmit
npm run lint
npm run build
```

## Baseline ref
`522d57cb92b0171d0c7e95b319ad7bd4fac5a99d` (current `master`, post-#13 0010 merge).
Preflight + audit ran against `af2b4f1` (the pre-merge 0010 tip); master then
fast-forwarded as PR #13 landed, and `git diff af2b4f1 522d57c` is empty (identical
tree), so the gate evidence is unchanged. Umbrella `epic/daily-log-voice-flow`
re-rooted onto `522d57c`.

## Notes for agent
- Template: `src/services/exerciseAgent/{sessionService,prompts,graph,tools}.ts` +
  `careAgentSession/serializeCareAgentSession.ts`. DAILY_LOG is simpler — one extraction
  pass, no multi-turn graph needed yet.
- Reuse `resolveTodayLog(dogId, date)` to get today's `DailyCareLog` for the commit.
- `HealthObservationType` no longer includes `MEDICATION` (ADR-0002) — don't reintroduce.
- Keep the draft envelope JSON in `CareAgentSession.draft`; commit reads `selectedChangeIds`
  against the stored `changeId`s.
- Mock the LLM extraction in tests (module mocks) — assert on routing/commit, not model output.
