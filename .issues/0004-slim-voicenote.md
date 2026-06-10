# Issue: Slim VoiceNote to a dumb artifact

## ID
`0004`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- Shared vocabulary: `context.md#VoiceNote` — audio + Whisper transcript +
  transcription status + FKs only; an input to a `CareAgentSession`, not a session.
- Target schema: `Engineering/Data Model.md` (Voice & Observations section).

## Goal
`VoiceNote` holds only `audioUrl`, `transcript`, `processingStatus`, and FKs; the
one-shot extraction fields are gone and extraction is owned by `CareAgentSession`.

## Context
PRD → functional requirement 5; ADR-0002 move 5. `processingStatus` now means
transcription state only.

## Dependencies
- Blocked by: 0003 (the `voiceNoteId` link lives on `CareAgentSession`)
- Blocks: 0006 (reseed)

## Scope
- Schema: delete `VoiceNote.extraction`, `VoiceNote.caregiverNote`,
  `VoiceNote.needsReview`; confirm the `voiceNoteId` FK / relation to
  `CareAgentSession` from issue 0003.
- Code: delete the one-shot extraction writer path that populated
  `VoiceNote.extraction`; `VoiceNoteProcessingJob` handles transcription only.
- Tests: a VoiceNote persists with transcript + status and exposes none of the removed
  fields; it can be referenced by a `CareAgentSession`.

## Out of scope
- Do NOT build the conversational follow-up flow (DAILY_LOG, separate PRD). Do NOT
  touch `DailyCareAction.needsReview` (that one stays).

## Acceptance criteria
- [ ] (machine) A `VoiceNote` round-trips with `transcript` + `processingStatus`; the
      generated client has no `extraction` / `caregiverNote` / `needsReview` on it.
- [ ] (machine) On `VoiceNote`, `extraction`, `caregiverNote`, `needsReview` absent
      from `src/` (scope to VoiceNote — `needsReview` survives on `DailyCareAction`).
- [ ] (machine) typecheck, lint, test, build exit 0.

## Feedback Loops
```bash
npm test                 # incl. slimmed-VoiceNote test
npx tsc --noEmit
npm run lint
npm run build
! grep -rEn "voiceNote\.(extraction|caregiverNote|needsReview)|extraction:|caregiverNote" src/**/voice*
! grep -rEn "extraction|caregiverNote" src   # then manually confirm no VoiceNote hits
```

## Baseline ref
`ba39261076a91ef5fd87f0577935538600e5be78` (captured 2026-06-10; 4 real gates green at preflight)

## Notes for agent
The bare-`needsReview` grep is intentionally noisy because the field name is shared —
verify each hit is on `DailyCareAction`, not `VoiceNote`, before calling green. Likely
files: voice service/routes, the processing-job worker.
