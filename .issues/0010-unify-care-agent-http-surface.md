# Issue: Unify the agent HTTP surface under /care-agent/sessions

## ID
`0010`

## Type
- Work: `AFK`
- Shape: `issue`

## Target repo
`api-stark-sesh` (API)

## Contract (frozen)
- The web consolidated client (issue 0007) calls a single unified route family:
  `stark-sesh/lib/api/endpoints/dogs.ts` — `createCareAgentSession(dogId, kind, message?)`,
  `getCareAgentSession`, `sendCareAgentMessage`, `confirmCareAgentSession({ selectedChangeIds? })`,
  `cancelCareAgentSession`.
- Response shape the web expects: `CareAgentSessionPayload`
  (`id, dogId, kind, status, messages[], questions[], draft, voiceNoteId, createdAt, updatedAt`)
  and confirm returns `CareAgentCommitResult`.
- `kind` discriminator + polymorphic commit per `context.md#CareAgentSession` / ADR-0002.

## Goal
The API exposes one unified route family `/v1/dogs/:id/care-agent/sessions[...]` that the
web client already calls, dispatching by `kind` (`PLAN_BUILD`, `PLAN_AUDIT`) onto the
existing agent orchestration, and serializing to `CareAgentSessionPayload`. The legacy
`/exercise-agent/sessions` and `/program-audit/sessions` route families are removed.

## Context
Issue 0003 unified the persistence layer (`CareAgentSession` table + `sessionRepository`)
but deliberately scoped out the HTTP surface ("only the persistence layer and status enum
change") — the two legacy controllers/routes survived. Issue 0007 then migrated the web
client to POST `/care-agent/sessions`, a route that was never built → live 404 when a user
clicks "Start" on the Create-exercise-with-AI overlay
(`POST /v1/dogs/:id/care-agent/sessions` → 404). This issue builds the missing HTTP slice.
It unblocks the cross-repo QA in issue 0009.

## Dependencies
- Blocked by: 0003 (unified table/repo), 0007 (defines the client contract)
- Blocks: 0009 (cross-repo QA round-trips PLAN_BUILD / PLAN_AUDIT over the wire)

## Scope
- Add a unified `CareAgentController` + `careAgentSchemas` and register one route family in
  `src/routes/dogRoutes.ts`:
  - `POST   /:id/care-agent/sessions`                  body `{ kind, message? }`
  - `GET    /:id/care-agent/sessions/:sessionId`
  - `POST   /:id/care-agent/sessions/:sessionId/messages`  body `{ message }`
  - `POST   /:id/care-agent/sessions/:sessionId/confirm`   body `{ selectedChangeIds? }`
  - `DELETE /:id/care-agent/sessions/:sessionId`
- Dispatch:
  - create → by `kind` in body: `PLAN_BUILD` → existing exercise-agent create (requires
    `message`); `PLAN_AUDIT` → existing program-audit create (ignores `message`);
    `DAILY_LOG` → out of scope, reject with 400 (enum value only, per 0003).
  - get / messages / confirm / cancel → look up the `CareAgentSession` by id, read its stored
    `kind`, dispatch to the matching existing service (exercise vs program-audit).
- Serialize every session response to the `CareAgentSessionPayload` shape the web type
  declares (single serializer, not the two legacy per-agent ones).
- Confirm returns the commit result the web `CareAgentCommitResult` type expects (PLAN_BUILD
  commits an action; PLAN_AUDIT applies selected changes).
- Preserve the existing per-route rate limits (create PLAN_BUILD 10/h, PLAN_AUDIT 5/h,
  messages 30/h) and `assertDogMemberAccess` checks.
- Remove the legacy `/exercise-agent/sessions` and `/program-audit/sessions` route
  registrations, controllers, and now-dead schemas once the unified surface covers them.

## Out of scope
- Do NOT implement the `DAILY_LOG` conversation (separate PRD; reject it at the route).
- Do NOT change agent prompts/orchestration, the `CareAgentSession` table, or the
  persistence repo — only the HTTP/controller/serialization layer.
- Do NOT touch the web or iOS clients.

## Acceptance criteria
- [x] (machine) Create dispatch by `kind` → 201 with a `CareAgentSessionPayload`
      (`kind`, `status`, `messages`, `questions`, `draft`) for PLAN_BUILD and
      PLAN_AUDIT; a `{ kind: 'DAILY_LOG' }` create → 400.
      → `careAgentController.test.ts` (create routes PLAN_BUILD→exercise / PLAN_AUDIT→audit,
      201 + payload.kind; DAILY_LOG→400) and `careAgentSchemas.test.ts` (DAILY_LOG rejected,
      PLAN_BUILD requires message). DB-free, both green.
- [~] (machine / integration-gated) Round-trip over the unified routes: create → GET →
      messages → confirm → DELETE, asserting structure/contract + commit shape + DELETE→GET
      404. → `programAudit.integration.test.ts` rewritten onto `/care-agent/sessions` with
      `kind: PLAN_AUDIT`, asserting the unified `data.draft.{report,plan}` envelope. **DB-gated**
      (`skip: !DATABASE_URL_TEST`) — runs under the integration issue 0009, skipped in the
      default gate. The PLAN_BUILD live round-trip is also deferred to 0009 (no exercise
      integration fixture exists yet).
- [x] (machine) Legacy routes gone: `! grep …exercise-agent/sessions|program-audit/sessions src`
      exit 0; `! grep …ExerciseAgentController|ProgramAuditController src` exit 0; the four
      legacy files deleted in the diff.
- [x] (machine) Field-exact serializer: `serializeCareAgentSession.test.ts` asserts the exact
      key set `id, dogId, kind, status, messages, questions, draft, voiceNoteId, createdAt,
      updatedAt` and the per-kind `draft` mapping. Green.
- [x] (machine) typecheck, lint, test, build exit 0 (51 tests pass).
- [ ] (trust-prior-verify) Manual: clicking "Start" on Create-exercise-with-AI and on the
      program-audit dialog against a seeded dog returns 201 and renders a draft. (Human.)

## Feedback Loops
```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
! grep -rEn "exercise-agent/sessions|program-audit/sessions" src
! grep -rEn "ExerciseAgentController|ProgramAuditController" src
```

## Baseline ref
`c7c3c9d`

## Notes for agent
The two agents already persist to the unified `CareAgentSession` table (issue 0003) via
`services/exerciseAgent/sessionService.ts` and `services/programAudit/sessionService.ts`;
only the HTTP surface diverges. The cleanest shape is one controller that reads `kind`
(from the request body on create, from the stored session otherwise) and delegates to the
existing service functions, then runs every result through one `serializeCareAgentSession`.
Confirm contracts differ today (exercise takes `{ edits }`, audit takes `{ selectedChangeIds }`)
— the web now sends only `{ selectedChangeIds? }`, so PLAN_BUILD confirm ignores edits.
Per test-gates, assert agent output structure, never exact wording; DB/OpenAI-gated paths
follow the same pattern as `programAudit.integration.test.ts`.
