# Issue: Web video capture & playback — in-workout, standalone, day panel

## ID
`0026`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- The 0022 VideoClip contract: presign → PUT to S3 → register
  `{ dailyCareLogId, dailyCareActionId?, s3Key, durationSeconds? }` → clips in
  day payloads → presigned GET url → delete. Field/route names verbatim. Mocks
  the API in tests; real cross-repo path is 0027.
- Vocabulary: `context.md#VideoClip` — dumb artifact, video just stores the
  exercise; no AI, no processing UI states beyond upload progress.

## Goal
During a Workout, one tap records a clip on the current exercise; outside a
Workout, a caregiver can record/upload a standalone clip (e.g. Stark walking) on
Today; the day panel plays clips back and offers download — the manual
email-to-Vicky loop gets its source material.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirements 14–16; UX
decisions; Non-goals (no share link — download only).

## Dependencies
- Blocked by: 0022 (contract), 0025 (stepper hosts the button)
- Blocks: 0027

## Scope
- `lib/api/endpoints/`: videoClips client (presign, register, list-from-day
  payloads, url, delete).
- Capture component: `MediaRecorder` video (camera+mic), record/stop/preview/
  retake, upload via presigned PUT with progress, then register. Falls back to a
  file-input upload where `MediaRecorder` video is unavailable.
- Workout stepper: the 0025 placeholder slot becomes the real per-exercise
  record button (clip registers with that step's `dailyCareActionId`).
- Today: standalone day-level record/upload entry point.
- Day panel / history: clip list with playback (presigned GET) and a download
  affordance; delete with confirm.
- vitest: client round-trip against mocked contract, capture-state machine
  (record→preview→upload→registered, error/retry), exercise-linked vs standalone
  registration payloads.

## Out of scope
- No share links, no server-side thumbnails/transcoding, no clip AI.
- No API changes (0022 owns the surface).
- No changes to voice capture.

## Acceptance criteria
- [ ] (machine) Client round-trip: presign → PUT (mocked) → register payload
      carries `dailyCareActionId` inside a workout step and omits it standalone.
- [ ] (machine) Capture state machine handles denied permissions, failed PUT
      (retry), and successful register; no orphan UI state.
- [ ] (machine) Day panel renders clips from a mocked day payload; delete calls
      the contract route.
- [ ] (machine) `npm test`, `npx tsc --noEmit`, scoped lint, `npm run build` pass.
- [ ] (trust-prior-verify) Recording mid-workout is one-handed doable; playback
      and download work on a phone (Mario tries it).

## Feedback Loops
```bash
BASE=<baseline ref filled at preflight>
npm test
npx tsc --noEmit
CHANGED=$(git diff --name-only --diff-filter=ACMR "$BASE" -- '*.ts' '*.tsx')
if [ -n "$CHANGED" ]; then npx eslint $CHANGED; else echo "scoped-lint: no changed TS files"; fi
npm run build
```

## Baseline ref
`<filled by the inner loop at preflight>`

## Notes for agent
- Audio capture precedent: `components/voice/VoiceRecordBar.tsx` +
  `lib/audio-to-wav.ts` (permissions handling worth mirroring; video needs no
  transcode — upload the recorded container as-is).
- iOS Safari `MediaRecorder` video support is version-sensitive — that's what the
  file-input fallback is for.
- Branch off umbrella `epic/stark-plan-workout` (stark-sesh), merge back into it.
