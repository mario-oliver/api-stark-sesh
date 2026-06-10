import { mock } from 'node:test'
import { randomUUID } from 'node:crypto'
import type { AuditGraphState, AuditReport, StoredMessage } from '../../services/programAudit/types.js'

// Injected after fixture seeding — UPDATE and DEACTIVATE changes reference real action IDs.
let _actionIds: string[] = []

export function setMockActionIds(ids: string[]): void {
  _actionIds = ids
}

// ── Deterministic mock implementation ────────────────────────────────────────

function makeFixtureReport(actionIds: string[]): AuditReport {
  return {
    summary: 'Fixture audit summary',
    strengths: ['Good exercise frequency'],
    gaps: ['Missing cool-down routine'],
    observations: actionIds.length > 0
      ? [{ actionId: actionIds[0], actionName: 'Test action 0', finding: 'Looks good', severity: 'LOW', recommendation: 'Keep it up' }]
      : [],
    overallRating: 'FAIR'
  }
}

async function mockRunAuditGraph(input: {
  dogContext: unknown
  messages?: StoredMessage[]
  existingReport?: AuditReport | null
}): Promise<AuditGraphState> {
  const messages: StoredMessage[] = input.messages ?? []
  const existingReport = input.existingReport ?? null

  // First call (create session) — no existingReport → return REPORT_READY state
  if (!existingReport) {
    const report = makeFixtureReport(_actionIds)
    return {
      dogContext: input.dogContext as AuditGraphState['dogContext'],
      report,
      plan: null,
      messages: [{ role: 'assistant', content: 'Fixture audit complete.' }],
      phase: 'done'
    }
  }

  // Follow-up — check if latest user message requests changes
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
  const requestsChanges = lastUserMsg?.content.toLowerCase().includes('propose changes') ?? false

  if (requestsChanges) {
    const changes = [
      {
        id: randomUUID(),
        type: 'UPDATE' as const,
        actionId: _actionIds[0],
        actionName: 'Test action 0',
        updates: { name: 'Updated Action Name' },
        reason: 'Needs rename for clarity'
      },
      {
        id: randomUUID(),
        type: 'DEACTIVATE' as const,
        actionId: _actionIds[1],
        actionName: 'Test action 1',
        reason: 'No longer appropriate for this dog'
      },
      {
        id: randomUUID(),
        type: 'CREATE' as const,
        newAction: {
          name: 'New Fixture Exercise',
          description: null,
          bucket: 'MOBILITY' as const,
          frequency: 'DAILY' as const,
          timeOfDay: null,
          targetReps: null,
          targetDurationSeconds: 30,
          instructions: null,
          rationale: 'Fixture rationale for new exercise',
          safetyNotes: 'Fixture safety notes',
          researchSummary: 'Fixture research summary'
        },
        reason: 'Add missing cool-down exercise'
      }
    ]
    return {
      dogContext: input.dogContext as AuditGraphState['dogContext'],
      report: existingReport,
      plan: { summary: 'Fixture plan summary', changes },
      messages: [...messages, { role: 'assistant', content: 'Here are my proposed changes.' }],
      phase: 'done'
    }
  }

  // Reply path — question, no plan
  return {
    dogContext: input.dogContext as AuditGraphState['dogContext'],
    report: existingReport,
    plan: null,
    messages: [...messages, { role: 'assistant', content: 'Fixture reply message.' }],
    phase: 'done'
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Must be called before any dynamic import of production code.
 * Uses the file URL of graphRunner.ts (the stable mock target) so that when
 * sessionService imports it, Node's loader returns the mock.
 */
export async function registerMockAuditGraph(): Promise<void> {
  const graphRunnerUrl = new URL(
    '../../services/programAudit/graphRunner.ts',
    import.meta.url
  ).href

  await mock.module(graphRunnerUrl, {
    namedExports: { runAuditGraph: mockRunAuditGraph }
  })
}
