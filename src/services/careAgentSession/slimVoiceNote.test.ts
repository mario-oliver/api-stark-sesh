/**
 * Issue 0004 — VoiceNote is a dumb artifact.
 *
 * Machine proof that the slimmed VoiceNote (audio + transcript + processingStatus +
 * FKs) carries NONE of the one-shot extraction fields, and that a CareAgentSession
 * can reference it (the 0003 `voiceNoteId` link). The strong checks are type-level,
 * read off the generated Prisma client and enforced by `tsc` / `npm run build`; the
 * runtime round-trip demonstrates the behaviour in `npm test`.
 *
 * Lives outside any `voice*` path on purpose: the issue's Feedback Loop greps
 * `src/**\/voice*` for forbidden VoiceNote field writes, and this file legitimately
 * names those fields to assert their ABSENCE.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type {
  VoiceNoteGroupByOutputType,
  VoiceNoteCreateManyInput
} from '../../generated/models/VoiceNote.js'
import type {
  CareAgentSessionGroupByOutputType,
  CareAgentSessionCreateManyInput
} from '../../generated/models/CareAgentSession.js'

// ── Compile-time contract (enforced by tsc / build) ───────────────────────────

// The one-shot extraction fields are GONE from the generated VoiceNote row.
type RemovedFromVoiceNote = 'extraction' | 'caregiverNote' | 'needsReview'
type LeakedVoiceNoteKeys = Extract<keyof VoiceNoteGroupByOutputType, RemovedFromVoiceNote>
const _voiceNoteHasNoRemovedFields: LeakedVoiceNoteKeys extends never ? true : false = true

// The dumb-artifact fields survive.
const _voiceNoteKeepsTranscript: 'transcript' extends keyof VoiceNoteGroupByOutputType ? true : false = true
const _voiceNoteKeepsStatus: 'processingStatus' extends keyof VoiceNoteGroupByOutputType ? true : false = true

// A CareAgentSession can reference a VoiceNote (issue 0003 link).
const _sessionReferencesVoiceNote: 'voiceNoteId' extends keyof CareAgentSessionGroupByOutputType ? true : false = true

// ── Runtime round-trip (executed by npm test) ─────────────────────────────────

describe('VoiceNote is a dumb artifact (issue 0004)', () => {
  it('round-trips transcript + processingStatus and exposes none of the removed fields', () => {
    const store = new Map<string, Record<string, unknown>>()

    const note = {
      id: 'vn-1',
      dogId: 'dog-1',
      dailyCareLogId: 'log-1',
      userId: 'user-1',
      audioUrl: null,
      transcript: 'we did his stretches today and he seems looser',
      processingStatus: 'TRANSCRIBED'
    } satisfies VoiceNoteCreateManyInput

    store.set(note.id, { ...note })
    const roundTripped = store.get(note.id)
    assert.ok(roundTripped, 'voice note persisted')
    assert.equal(roundTripped.transcript, note.transcript)
    assert.equal(roundTripped.processingStatus, 'TRANSCRIBED')

    for (const removed of ['extraction', 'caregiverNote', 'needsReview']) {
      assert.ok(!(removed in roundTripped), `VoiceNote must not carry "${removed}"`)
    }
  })

  it('can be referenced by a CareAgentSession via voiceNoteId', () => {
    const session = {
      id: 'sess-1',
      dogId: 'dog-1',
      userId: 'user-1',
      kind: 'DAILY_LOG',
      voiceNoteId: 'vn-1'
    } satisfies CareAgentSessionCreateManyInput

    assert.equal(session.voiceNoteId, 'vn-1')
  })

  it('upholds the compile-time VoiceNote contract', () => {
    assert.ok(
      _voiceNoteHasNoRemovedFields &&
        _voiceNoteKeepsTranscript &&
        _voiceNoteKeepsStatus &&
        _sessionReferencesVoiceNote
    )
  })
})
