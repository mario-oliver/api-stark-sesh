# Issue: Prototype the web DAILY_LOG draft-review UI (3 throwaways)

## ID
`0016`

## Type
- Work: `Human-in-the-loop`
- Shape: `issue`

## Target repo
`stark-sesh` (web)

## Contract (frozen)
- Paper Contract only: the DAILY_LOG `draft` shape in [[Issues - DAILY_LOG Voice Flow]]
  (`completions[] / adHocActions[] / observations[] / planChangeSuggestions[]`, each
  item with `changeId`, `extractionConfidence`, `needsReview`) plus the existing
  `/care-agent/sessions` create/confirm/sendMessage routes. **Mock data only** — does
  not call the real API, so it does not wait on 0011.

## Goal
Three throwaway, side-by-side prototypes of "here's what I heard from your voice note —
deselect anything wrong, then save," so Mario can choose the interaction before any real
code is written. AI explores; human taste decides.

## Context
[[PRD-daily-log-voice-flow]] §UX (no net-new screen decided in the PRD; prototypes are
issue-level explorations). [[ADR-0003-daily-log-voice-flow]] decisions 3 (confirm with
selection), 5 (one clarifying question), 8 (inert plan-change nudge).

## Dependencies
- Blocked by: — (paper Contract)
- Blocks: 0017

## Scope
- An **isolated route** (e.g. `/dev/daily-log-proto`) with three variants rendered from
  the same mock draft fixture. Each variant must express:
  - the three output groups (completions / ad-hoc / observations) with per-item
    select/deselect, high-confidence items pre-selected, `needsReview` items flagged;
  - the one-question `AWAITING_INPUT` state (a mock ambiguous-completion prompt);
  - the inert plan-change nudge ("Sounds like a plan change — open a plan review?");
  - the empty-draft "nothing to log" state.
- Mock fixtures only; no API client changes; throwaway code under the dev route.

## Out of scope
- Real API calls, real session creation, committing anything.
- Production wiring (that's 0017). Do not touch `lib/api/`.

## Acceptance criteria
- [x] (machine) `npm run build` compiles with the dev route present. ✅ `npx tsc --noEmit`
      exit 0 + `next build` compiles, route `/dev/daily-log-proto` in the route table.
- [x] (trust-prior-verify) Three meaningfully distinct variants render from the mock
      draft and cover all four states above. **Mario eyeballs and picks one** (record the
      choice in this issue before 0017 starts). ✅ Mario reviewed A/B/C 2026-06-11 and chose
      a **hybrid** (Variant D) — spec below.

## Chosen design — Variant D (hybrid), recorded 2026-06-11

Mario synthesized one design from the three prototypes. **0017 builds this.** A
buildable reference prototype lives at `app/dev/daily-log-proto/VariantD.tsx`.

**DRAFT_READY (top → bottom):**
- **From C:** the voice transcript (italic) at top + an assistant chat bubble framing
  the draft ("Here's what I caught from that. Tap any to leave it out, then save.").
- **From A:** the three category sections — **Completed from plan / Also did (not on
  plan) / Observations** — kept as the primary grouping (easier to digest than B's
  confidence-first re-ordering).
- **From B:** each item is its **own container** with the **confidence score top-right**.
  Because A's section header already names the kind, the per-item kind label
  ("Completed"/"Observation") is **dropped** — the container shows only: confidence
  (top-right) · bucket · reps/duration · tolerance. Containers are tinted **blue vs the
  background** (selected: `bg-primary/10 border-primary/25`; deselected/flagged: dashed,
  muted, strikethrough).
- **From C:** the inert plan-change / progressive-overload nudge as an **assistant chat
  bubble** with a Sparkles icon + "Open a plan review?" link (never commits, ADR-0003 §8).
- Pre-selection per ADR-0003 §3: confident items pre-checked, `needsReview` items shown
  in their category but **opt-in** (unchecked, amber "check this").

**AWAITING_INPUT:** Variant **B**'s triage prompt (amber "I heard …" box + question),
with the candidate option cards rendered **white** (`bg-white dark:bg-zinc-900 shadow-sm`)
so they stand out. One round only (§5).

**EMPTY:** Variant **A**'s centered empty layout ("I didn't catch any care to log" +
Record again), with a **Stark Sprite** (`<StarkSprite animation="idle" size="small" />`)
in place of the check icon.

> Open visual confirm for 0017: final blue tint depth on the cards, and dark-mode
> treatment of the white AWAITING_INPUT cards (prototype uses `dark:bg-zinc-900`).

## Feedback Loops
```bash
npm run build            # next build compiles the prototype route
npx tsc --noEmit
# (no unit test gate — prototypes are visual; human review is the gate)
```

## Baseline ref
`806fdcaf9b4a9ac991bb0d25836baf3dd1b02b44` (stark-sesh, branch `0016-web-draft-review-prototypes` off umbrella `epic/daily-log-voice-flow`)

## Notes for agent
- Throwaway code — optimize for showing options, not for reuse. Keep it under one dev
  route so it's trivially deletable after the choice.
- Reuse existing care components for visual consistency where cheap, but don't refactor
  them.
- Hand back a short note per variant (what's different, trade-offs) to speed Mario's pick.
