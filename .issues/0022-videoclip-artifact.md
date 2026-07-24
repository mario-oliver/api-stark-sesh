# Issue: VideoClip dumb artifact — presign, register, list, download, delete

## ID
`0022`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- This issue FREEZES the VideoClip contract the web gates against:
  `VideoClip { id, dogId, dailyCareLogId, dailyCareActionId?, userId, s3Key,
  durationSeconds?, createdAt }` and routes:
  - `POST /v1/dogs/:id/video-clips/presign` → presigned PUT (video content types)
  - `POST /v1/dogs/:id/video-clips` → register row after upload
  - `GET  /v1/dogs/:id/video-clips/:clipId/url` → presigned GET (playback/download)
  - `DELETE /v1/dogs/:id/video-clips/:clipId`
  - Clips embedded in today / history day payloads.
- Vocabulary: `context.md#VideoClip`. Dumb artifact: NO processing status, NO
  pipeline, NO AI — video just stores the exercise (ADR-0004 §5).

## Goal
A caregiver's client can upload a video straight to S3, register it against a day
(optionally against one exercise execution), see it in day payloads, fetch a
playback/download URL, and delete it — all membership-guarded.

## Context
[[PRD-stark-plan-fidelity-workout-video]] Functional requirements 13–15;
Data/schema decisions (Migration 2). Upload must bypass the Fastify 25 MB
multipart path — presigned PUT only.

## Dependencies
- Blocked by: —
- Blocks: 0026

## Scope
- Prisma migration: `VideoClip` model + relations (`Dog`, `DailyCareLog`,
  `DailyCareAction?`, `User`).
- S3 service following `src/services/s3/` patterns (key prefix per dog; presign
  policy restricts content-type to video types and enforces a size cap — pick a
  sensible cap and note it in the route schema description).
- The four routes above + clip arrays in today/day-history serializers, all
  behind `requireAuth` + `assertDogMemberAccess`.
- Register validates: the `dailyCareLogId` belongs to the dog (resolve today's
  log when a date isn't given), and `dailyCareActionId`, when present, belongs to
  that log.
- Tests written with the issue: membership guard (non-member 403), register/list/
  url/delete round-trip, exercise-linked vs standalone clips, invalid
  `dailyCareActionId` rejected.

## Out of scope
- No transcription/AI/processing job — no `VideoNoteProcessingJob` analog.
- No share/public links (out of scope per PRD).
- No changes to `VoiceNote` or its worker.
- No web changes.

## Acceptance criteria
- [x] (machine) Presign endpoint returns a PUT URL only for allowed video
      content types; non-members get 403 on every route.
      → `videoClipsController.test.ts` (presign 200 for video/mp4 with per-dog
      s3Key + Content-Type header; 400 for image/png, audio/mpeg,
      video/x-msvideo; 400 above the 500 MB cap; all four routes 403 for a
      non-member with no row created) and `services/s3/videoClips.test.ts`
      (content-type normalization/rejection, per-dog key build/ownership,
      policy gate fires before any S3 call). DB-free, green.
- [x] (machine) Register→today-payload→url→delete round-trip passes; standalone
      (no `dailyCareActionId`) and exercise-linked clips both serialize
      correctly; cross-log `dailyCareActionId` is rejected.
      → `videoClipsController.test.ts`: round-trip test registers a standalone
      and an ACTION-linked clip, sees both in `loadTodayPayload().dailyLog
      .videoClips` (frozen shape, exact key set asserted on register:
      `id, dogId, dailyCareLogId, dailyCareActionId, userId, s3Key,
      durationSeconds, createdAt`), fetches the presigned GET url, deletes
      (S3 DeleteObjectCommand attempted), then url → 404. Cross-log
      `dailyCareActionId` → 400; foreign dog's `dailyCareLogId` → 404; foreign
      dog's `s3Key` → 400; omitted `dailyCareLogId`/`date` resolves (creates)
      today's log. Green.
- [x] (machine) Day/history payloads include the day's clips.
      → `loadTodayPayload` embeds `dailyLog.videoClips` (newest first);
      `getHistory` log entries carry `videoClips` + `videoClipCount` —
      asserted in `videoClipsController.test.ts` (history suite). Green.
- [x] (machine) Full suite green.
      → `npm test` 112/112 pass (21 added by this issue), `npx tsc --noEmit`
      exit 0, `npm run lint` 0 errors (1 pre-existing warning in
      `src/types/index.ts`, untouched), `npm run build` exit 0
      (prisma generate + tsc; regenerated `src/generated` committed).
- [~] (deferred) Migration applied to a database.
      → `prisma/migrations/20260723120000_videoclip/migration.sql` was
      hand-written (the worktree's `.env` symlinks to the shared dev DB, whose
      apply rights another agent owns — `migrate dev --create-only` would have
      connected to it) and verified byte-identical to
      `npx prisma migrate diff --from-schema <baseline cc2c4c0 schema>
      --to-schema prisma/schema.prisma --script` (offline, no DB touched).
      Apply-to-DB verification DEFERRED to integration (0027).

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Baseline ref
`cc2c4c0dc6d3fe99ab851d5ef677d090376ec4c1`

## Notes for agent
- Mirror the dog-photo presign flow (`src/services/s3/dogPhotos.ts`,
  `uploadsController.ts`, `uploadSchemas.ts`) — same config guards (`isS3Ready`).
- Keep route registration in the protected group (`src/plugins/routeGroups.ts`).
- Branch off umbrella `epic/stark-plan-workout`, merge back into it.
