# Issue: iOS video capture & playback — system camera, standalone, day panel

## ID
`0030`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS)

## Contract (frozen)
- The 0022 VideoClip contract: presign → PUT upload → register
  `{ dailyCareLogId, dailyCareActionId?, s3Key, durationSeconds? }` → clips in
  day payloads → presigned GET url → delete. Names/routes verbatim. Mocks the
  API in tests; real path is 0027.
- Vocabulary: `context.md#VideoClip` — dumb artifact; no AI; capture is the
  **system camera sheet** (v1 decision — no custom AVFoundation viewfinder).

## Goal
Mid-workout, one tap opens the system camera to film the current exercise and
the clip registers against that step; standalone clips (Stark walking) record
from Today; the day panel plays clips, saves to Photos, and share-sheets them —
the manual email-to-Vicky loop, sourced from the phone.

## Context
[[PRD-stark-plan-fidelity-workout-video-ios]] Functional requirements 6–8.
Sibling of web issue 0026.

## Dependencies
- Blocked by: 0022 (contract), 0029 (stepper hosts the button)
- Blocks: 0027

## Scope
- `APIClient`: videoClips endpoints (presign, register, url, delete) + clip
  decoding in day payloads.
- Capture: system camera sheet (movie mode) presented from the 0029 placeholder
  slot (registers with that step's `dailyCareActionId`) and from Today
  (standalone, day-level); upload with progress; failed upload retryable, no
  orphan state.
- Day panel/history: clip list with playback (presigned GET → AVPlayer),
  save-to-Photos, share sheet, delete with confirm.
- XCTests: client round-trip against mocked contract; capture/upload view-model
  state machine (permission denied, PUT failure retry, success); linked vs
  standalone register payloads; decoding clips in day payloads.

## Out of scope
- No custom viewfinder, no thumbnails/transcoding, no clip AI, no share links.
- No API changes (0022 owns the surface); no voice changes.

## Acceptance criteria
- [x] (machine) Register payload carries `dailyCareActionId` from a workout step
      and omits it for standalone; round-trip against the mocked contract.
      Evidence: `VideoClipClientTests.testRegisterLinked_encodesActionId_andDecodesClip`
      (asserts the encoded JSON contains `dailyCareActionId`) +
      `testRegisterStandalone_omitsActionId` (asserts the key is absent);
      `VideoCaptureStateMachineTests.testLinkedUpload_success_registersWithActionId` /
      `testStandaloneUpload_success_registersWithoutActionId`.
- [x] (machine) Upload state machine: denied permission, failed PUT (retry),
      success → registered; no orphan states.
      Evidence: `VideoCaptureStateMachineTests` — `testPermissionDenied_isTerminal_andMakesNoNetworkCall`,
      `testFailedPUT_thenRetry_reachesRegistered_noOrphan` (re-presigns on retry,
      registers exactly once), `testPresignFailure_isRetryable_andRegistersNothing`,
      `testOversizeFile_failsBeforePresign`.
- [x] (machine) Day payload clip decoding; delete calls the contract route.
      Evidence: `VideoClipDecodingTests` (today `dailyLog.videoClips` present/absent,
      history `videoClips` + `videoClipCount` present/absent, `VideoClip` shape) +
      `VideoClipClientTests.testDelete_callsContractRoute` (DELETE
      `/v1/dogs/:id/video-clips/:clipId`).
- [x] (machine) iOS gate green. Evidence: `xcodebuild test` → **TEST SUCCEEDED**,
      67 passed / 0 failed (baseline 50 + 17 new video tests); no existing tests weakened.
- [ ] (trust-prior-verify) Filming an exercise mid-workout is one-handed doable;
      playback, save-to-Photos, and share sheet work on a device.

## Feedback Loops
```bash
xcodebuild test -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' \
  -only-testing:StarkHealthiOSTests
```

## Baseline ref
`b6df7edd379e81a17b0524b8f608fc2134fff3c6`

## Notes for agent
- Add `NSCameraUsageDescription` / `NSMicrophoneUsageDescription` /
  Photos-add usage strings to Info.plist as needed.
- Upload the recorded movie container as-is (no transcode) via the presigned
  PUT; respect the 0022 content-type allowlist.
- Simulator has no camera — keep capture behind a protocol so the state machine
  is testable; camera ergonomics are trust-prior-verify on a device.
- Branch off umbrella `epic/stark-plan-workout` (StarkHealthiOS), merge back
  into it.
