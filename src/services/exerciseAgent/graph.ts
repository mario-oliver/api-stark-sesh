import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  buildDogContextBlock,
  CLARIFY_SYSTEM,
  DRAFT_SYSTEM,
  EXERCISE_AGENT_SYSTEM
} from './prompts.js'
import { runTavilyResearch } from './tools/tavily.js'
import {
  clarifyOutputSchema,
  proposedExerciseSchema,
  type DogAgentContext,
  type ExerciseAgentGraphState,
  type ProposedExercise,
  type ResearchSnippet,
  type StoredMessage
} from './types.js'

function getModel() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  const model = process.env.AI_EXERCISE_MODEL || process.env.AI_CARE_MODEL || 'gpt-4o-mini'
  return new ChatOpenAI({ apiKey, model, temperature: 0.3 })
}

function conversationText(messages: StoredMessage[]): string {
  return messages.map(m => `${m.role === 'user' ? 'Caregiver' : 'Assistant'}: ${m.content}`).join('\n\n')
}

async function callClarify(
  dogContext: DogAgentContext,
  messages: StoredMessage[]
): Promise<{ needsClarification: boolean; questions: string[]; researchQueries: string[] }> {
  const model = getModel().withStructuredOutput(clarifyOutputSchema, { name: 'clarify' })
  const result = await model.invoke([
    new SystemMessage(CLARIFY_SYSTEM),
    new HumanMessage(
      [
        buildDogContextBlock(dogContext),
        'Conversation:',
        conversationText(messages)
      ].join('\n\n')
    )
  ])

  return {
    needsClarification: result.needsClarification,
    questions: result.questions,
    researchQueries: result.researchQueries
  }
}

async function callDraft(
  dogContext: DogAgentContext,
  messages: StoredMessage[],
  research: ResearchSnippet[]
): Promise<ProposedExercise> {
  const model = getModel().withStructuredOutput(proposedExerciseSchema, { name: 'proposed_exercise' })
  const researchBlock =
    research.length === 0
      ? 'No web research was performed.'
      : research.map(r => `Query: ${r.query}\n${r.summary}`).join('\n\n---\n\n')

  return model.invoke([
    new SystemMessage(DRAFT_SYSTEM),
    new HumanMessage(
      [
        buildDogContextBlock(dogContext),
        'Research summaries:',
        researchBlock,
        'Conversation:',
        conversationText(messages)
      ].join('\n\n')
    )
  ])
}

const GraphAnnotation = Annotation.Root({
  messages: Annotation<StoredMessage[]>({
    reducer: (left, right) => [...(left ?? []), ...(right ?? [])],
    default: () => []
  }),
  dogContext: Annotation<DogAgentContext>(),
  questions: Annotation<string[]>({
    reducer: (_, right) => right ?? [],
    default: () => []
  }),
  research: Annotation<ResearchSnippet[]>({
    reducer: (_, right) => right ?? [],
    default: () => []
  }),
  draft: Annotation<ProposedExercise | null>({
    reducer: (_, right) => right ?? null,
    default: () => null
  }),
  skipResearch: Annotation<boolean>({
    reducer: (_, right) => right ?? false,
    default: () => false
  }),
  researchQueries: Annotation<string[]>({
    reducer: (_, right) => right ?? [],
    default: () => []
  }),
  phase: Annotation<ExerciseAgentGraphState['phase']>({
    reducer: (_, right) => right ?? 'intake',
    default: () => 'intake' as const
  })
})

async function intakeNode(_state: typeof GraphAnnotation.State) {
  return { phase: 'clarify' as const }
}

async function clarifyNode(state: typeof GraphAnnotation.State) {
  const { needsClarification, questions, researchQueries } = await callClarify(
    state.dogContext,
    state.messages
  )

  if (needsClarification && questions.length > 0) {
    const assistantContent = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
    return {
      phase: 'done' as const,
      questions,
      messages: [{ role: 'assistant' as const, content: assistantContent }]
    }
  }

  return {
    phase: 'research' as const,
    questions: [],
    researchQueries
  }
}

async function researchNode(state: typeof GraphAnnotation.State) {
  if (state.skipResearch && state.research.length > 0) {
    return { phase: 'draft' as const }
  }

  const queries =
    state.researchQueries.length > 0
      ? state.researchQueries
      : [`${state.dogContext.dogName} mobility home exercises`]

  const research = await runTavilyResearch(queries)
  return { phase: 'draft' as const, research }
}

async function draftNode(state: typeof GraphAnnotation.State) {
  const draft = await callDraft(state.dogContext, state.messages, state.research)
  const summary = `I've drafted "${draft.name}". Review the plan below and add it to the routine when ready.`

  return {
    phase: 'done' as const,
    draft,
    questions: [],
    messages: [{ role: 'assistant' as const, content: summary }]
  }
}

function routeAfterClarify(state: typeof GraphAnnotation.State) {
  if (state.phase === 'done') {
    return END
  }
  return 'webResearch'
}

function routeAfterWebResearch() {
  return 'buildDraft'
}

function routeAfterBuildDraft() {
  return END
}

let compiledGraph: ReturnType<typeof buildGraph> | null = null

function buildGraph() {
  const graph = new StateGraph(GraphAnnotation)
    .addNode('intake', intakeNode)
    .addNode('clarify', clarifyNode)
    .addNode('webResearch', researchNode)
    .addNode('buildDraft', draftNode)
    .addEdge(START, 'intake')
    .addEdge('intake', 'clarify')
    .addConditionalEdges('clarify', routeAfterClarify, ['webResearch', END])
    .addConditionalEdges('webResearch', routeAfterWebResearch, ['buildDraft'])
    .addConditionalEdges('buildDraft', routeAfterBuildDraft, [END])

  return graph.compile()
}

export function getExerciseAgentGraph() {
  if (!compiledGraph) {
    compiledGraph = buildGraph()
  }
  return compiledGraph
}

export async function runExerciseAgentGraph(input: {
  dogContext: DogAgentContext
  messages: StoredMessage[]
  skipResearch?: boolean
  cachedResearch?: ResearchSnippet[]
}): Promise<ExerciseAgentGraphState> {
  const graph = getExerciseAgentGraph()

  const result = await graph.invoke({
    messages: input.messages,
    dogContext: input.dogContext,
    skipResearch: input.skipResearch ?? false,
    research: input.cachedResearch ?? [],
    researchQueries: [],
    questions: [],
    draft: null,
    phase: 'intake'
  })

  return {
    messages: result.messages,
    dogContext: result.dogContext,
    questions: result.questions,
    research: result.research,
    draft: result.draft,
    skipResearch: input.skipResearch ?? false,
    phase: result.phase
  }
}

export { EXERCISE_AGENT_SYSTEM }
