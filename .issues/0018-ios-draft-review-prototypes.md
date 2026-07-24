# Issue: Prototype the iOS DAILY_LOG draft-review UI (3 throwaways)

## ID
`0018`

## Type
- Work: `Human-in-the-loop`
- Shape: `issue`

## Target repo
`StarkHealthiOS` (iOS / SwiftUI)

## Contract (frozen)
- Paper Contract only: the DAILY_LOG `draft` shape in [[Issues - DAILY_LOG Voice Flow]]
  plus the existing `/care-agent/sessions` routes. **Mock data only** — no real API; does
  not wait on 0011. iOS is the primary voice-capture surface, so this is the higher-value
  client prototype.

## Goal
Three throwaway SwiftUI prototypes of the post-voice-note "review what I heard, deselect
what's wrong, save" flow, so Mario can choose the interaction before real code. AI
explores; human taste decides.

## Context
[[PRD-daily-log-voice-flow]] §UX. [[ADR-0003-daily-log-voice-flow]] decisions 3, 5, 8.
Much of iOS is taste-sensitive — lean on visual review, not generated tests.

## Dependencies
- Blocked by: — (paper Contract)
- Blocks: 0019

## Scope
- A dev-only screen (behind a debug flag / preview) rendering three variants from one
  mock draft fixture, each expressing: the three output groups with per-item
  select/deselect (high-confidence pre-selected, `needsReview` flagged), the
  one-question `AWAITING_INPUT` state, the inert plan-change nudge, and the empty-draft
  "nothing to log" state.
- SwiftUI Previews for each variant; mock fixtures only; no networking changes.

## Out of scope
- Real session creation / committing. No API client changes (that's 0019).

## Acceptance criteria
- [x] (machine) `xcodebuild build` (or the test scheme) compiles with the prototype
      screen + previews present. ✅ BUILD SUCCEEDED on iPhone 17 / OS 26.2, no warnings
      on the prototype file (2026-06-11).
- [ ] (trust-prior-verify) Three distinct variants render from the mock draft and cover
      all four states. **Mario picks one** (record the choice here before 0019).

## Feedback Loops
```bash
xcodebuild build -project StarkHealthiOS.xcodeproj -scheme StarkHealthiOS \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2'
# Visual review via SwiftUI Previews is the gate; no unit test for throwaway UI.
```

## Baseline ref
`7b206bf` — branch `issue/0018-ios-draft-review-prototypes` off umbrella
`epic/daily-log-voice-flow` (created here; iOS's first issue in this epic).

## Variants built (2026-06-11)

One throwaway file: `StarkHealthiOS/Features/Voice/DailyLogDraftReviewPrototypes.swift`
(`#if DEBUG`, trivially deletable). Dev host `DailyLogDraftReviewHost` has a
Variant × Scenario picker; 10 SwiftUI Previews are the review surface. All three
variants render the same mock draft fixture and cover all four states: full draft
(3 groups + per-item select/deselect, high-confidence pre-selected, `needsReview`
flagged), one-question `AWAITING_INPUT`, inert plan-change nudge, and empty "nothing
to log". Real iOS vocabulary (`CareBucket` activity/mobility/recovery,
`HealthObservationType`, `DailyCareActionSource`).

- **A · Checklist** — sectioned list, tap-to-toggle rows, sticky "Save N" bar.
  Familiar (mirrors `TaskRowView`), everything visible at once, lowest friction.
- **B · Triage** — one card at a time, explicit Keep/Skip per item, running count.
  Highest correctness (every line gets a yes/no), but most taps and can't see the
  whole draft at a glance.
- **C · Receipt** — dense "here's what I heard" list, all pre-included, tap to
  strike out. Fastest glance-and-confirm, most voice-first.

## DECISION (Mario, 2026-06-11): B Triage as the spine, A + C folded in

The first three variants were superseded by a **composite** built and shipped in the
same throwaway file (`xcodebuild build` ✅ green). 0019 builds THIS:

- **Spine = Triage (B).** Step through each heard item with **Keep / Skip**; running
  "Item X of N". Default selection = high-confidence & not `needsReview` (seeds the
  shared selection; Keep/Skip adjusts it).
- **Third button on each triage card: "View all" → Checklist (A).** Opens the whole
  draft as a toggle list **sharing one selection set** with the triage walk; "Done"
  returns to triage.
- **Final "Keeping N of M" page.** For the full draft it has a **"View" → Receipt (C)**
  read-only of exactly what's kept ("just so they can see it all"). A primary
  **"Save N to today's log"** commits.
- **Plan-change nudge is save-first.** Tapping "Save log & review plan" **commits
  today's log first**, then routes to a mock plan-review (PLAN_AUDIT) screen that
  opens with a "Saved N to today's log" banner. Stays inert toward the plan itself
  (ADR-0003 dec.8) — it only navigates after the save.
- **Awaiting-input / plan-change / empty** run the same Triage spine; their summary
  exposes the **Checklist (A)** overview at the end (Receipt is the full-draft case).
  Empty short-circuits to the "nothing to log" state.

Implementing types (all `#if DEBUG`, throwaway): `DailyLogDraftReviewFlow`,
`ChecklistOverviewSheet`, `ReceiptSummarySheet`, `MockPlanAuditScreen`,
`DailyLogDraftReviewHost`. 8 Previews. 0019 rebuilds this against the real serialized
DAILY_LOG draft from 0011 (the prototype's mock model maps 1:1 to that draft shape).

**Still needs Mario's eyeball** (trust-prior-verify): open the Previews / run the host
and confirm the composite *feels* right before 0019 starts — especially the shared
selection between triage and "View all", and the save-first plan-change hop.

## Notes for agent
- Throwaway — keep variants under one dev screen, trivially deletable.
- iOS gates are slow/simulator-dependent; set a lower turn cap. Use
  `xcodebuild -showdestinations` if `iPhone 17, OS=26.2` isn't present.
- Return a short trade-off note per variant for Mario's pick.
