import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  auditReportSchema,
  normalizeStructuredRefineOutput,
  refineOutputStructuredSchema,
  type AuditDogContext,
  type AuditGraphState,
  type AuditReport,
  type ProposedProgramChanges,
  type StoredMessage
} from './types.js'
import {
  AUDIT_SYSTEM,
  REFINE_SYSTEM,
  buildAuditContextBlock,
  conversationText
} from './prompts.js'

function getModel() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const model = process.env.AI_EXERCISE_MODEL || process.env.AI_CARE_MODEL || 'gpt-4o-mini'
  return new ChatOpenAI({ apiKey, model, temperature: 0.3 })
}

async function callAnalyze(dogContext: AuditDogContext): Promise<AuditReport> {
  const model = getModel().withStructuredOutput(auditReportSchema, { name: 'audit_report' })
  return model.invoke([
    new SystemMessage(AUDIT_SYSTEM),
    new HumanMessage(buildAuditContextBlock(dogContext))
  ])
}

async function callRefineOrPropose(
  dogContext: AuditDogContext,
  messages: StoredMessage[],
  report: AuditReport
): Promise<{ reply?: string; plan?: ProposedProgramChanges }> {
  const model = getModel().withStructuredOutput(refineOutputStructuredSchema, {
    name: 'refine_or_propose'
  })

  const result = await model.invoke([
    new SystemMessage(REFINE_SYSTEM),
    new HumanMessage(
      [
        buildAuditContextBlock(dogContext),
        'Existing audit report:',
        JSON.stringify(report, null, 2),
        'Conversation:',
        conversationText(messages)
      ].join('\n\n')
    )
  ])

  return normalizeStructuredRefineOutput(result)
}

// ── LangGraph state machine ───────────────────────────────────────────────────

const GraphAnnotation = Annotation.Root({
  dogContext: Annotation<AuditDogContext>(),
  messages: Annotation<StoredMessage[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => []
  }),
  report: Annotation<AuditReport | null>({
    reducer: (_, right) => right ?? null,
    default: () => null
  }),
  plan: Annotation<ProposedProgramChanges | null>({
    reducer: (_, right) => right ?? null,
    default: () => null
  }),
  phase: Annotation<AuditGraphState['phase']>({
    reducer: (_, right) => right ?? 'analyze',
    default: () => 'analyze' as const
  })
})

async function analyzeNode(state: typeof GraphAnnotation.State) {
  const report = await callAnalyze(state.dogContext)
  const summary = `I've reviewed ${state.dogContext.dogName}'s routine (${state.dogContext.actions.length} exercise${state.dogContext.actions.length === 1 ? '' : 's'}). Here's what I found.`
  return {
    report,
    phase: 'done' as const,
    messages: [{ role: 'assistant' as const, content: summary }]
  }
}

async function refineOrProposeNode(state: typeof GraphAnnotation.State) {
  if (!state.report) {
    return { phase: 'done' as const }
  }

  const { reply, plan } = await callRefineOrPropose(
    state.dogContext,
    state.messages,
    state.report
  )

  if (plan) {
    const summary = `I've put together ${plan.changes.length} proposed change${plan.changes.length === 1 ? '' : 's'}. Review them below and apply the ones that make sense.`
    return {
      plan,
      phase: 'done' as const,
      messages: [{ role: 'assistant' as const, content: summary }]
    }
  }

  return {
    phase: 'done' as const,
    messages: [{ role: 'assistant' as const, content: reply ?? '' }]
  }
}

let compiledAnalyzeGraph: ReturnType<typeof buildAnalyzeGraph> | null = null
let compiledRefineGraph: ReturnType<typeof buildRefineGraph> | null = null

function buildAnalyzeGraph() {
  return new StateGraph(GraphAnnotation)
    .addNode('analyze', analyzeNode)
    .addEdge(START, 'analyze')
    .addEdge('analyze', END)
    .compile()
}

function buildRefineGraph() {
  return new StateGraph(GraphAnnotation)
    .addNode('refineOrPropose', refineOrProposeNode)
    .addEdge(START, 'refineOrPropose')
    .addEdge('refineOrPropose', END)
    .compile()
}

export async function runAuditGraph(input: {
  dogContext: AuditDogContext
  messages?: StoredMessage[]
  existingReport?: AuditReport | null
}): Promise<AuditGraphState> {
  // First run: no messages → analyze
  if (!input.existingReport) {
    if (!compiledAnalyzeGraph) compiledAnalyzeGraph = buildAnalyzeGraph()
    const result = await compiledAnalyzeGraph.invoke({
      dogContext: input.dogContext,
      messages: input.messages ?? [],
      report: null,
      plan: null,
      phase: 'analyze'
    })
    return {
      dogContext: result.dogContext,
      messages: result.messages,
      report: result.report,
      plan: result.plan,
      phase: result.phase
    }
  }

  // Follow-up run: existing report + user message → refine or propose
  if (!compiledRefineGraph) compiledRefineGraph = buildRefineGraph()
  const result = await compiledRefineGraph.invoke({
    dogContext: input.dogContext,
    messages: input.messages ?? [],
    report: input.existingReport,
    plan: null,
    phase: 'refine'
  })
  return {
    dogContext: result.dogContext,
    messages: result.messages,
    report: result.report ?? input.existingReport,
    plan: result.plan,
    phase: result.phase
  }
}
