import { HumanMessage, SystemMessage } from 'langchain'
import {
  campaignLandingPageSchema,
  type CampaignLandingPage,
  type MetaCampaignBrief
} from '../../../schemas/campaignFunnelSchemas.js'
import { buildFallbackLandingPage } from './fixtures.js'
import { createCampaignFunnelModel, invokeWithTimeout } from './model.js'

const SYSTEM = `You are a Performance Iteration Agent for paid social landing pages.
You receive the original campaign brief, raw pasted Meta/campaign performance data, and raw pasted webpage analytics.
Generate exactly 3 NEW landing page variants for the next experiment iteration.

Rules:
- Use fixed 7 blocks per variant: hero, problem, solution, howItWorks, proof, cta, faq
- Variant ids must be variant-iter-1, variant-iter-2, variant-iter-3
- Each variant needs a distinct angle and hypothesis informed by the performance data AND the brief
- Copy must stay specific to this campaign brief — no generic demo/HoopReads boilerplate
- Improve weak funnel stages identified in the metrics (e.g. high bounce → stronger message match in hero)
- template must be CampaignLandingPage
- platform from brief
- pageId will be set by the system — use a placeholder slug from campaign name`

export type IterationAgentInput = {
  brief: MetaCampaignBrief
  campaignMetricsText: string
  webMetricsText: string
  previousPage?: CampaignLandingPage
  pageId: string
}

export async function runPerformanceIterationAgent(
  input: IterationAgentInput
): Promise<CampaignLandingPage> {
  const fallback = buildFallbackLandingPage(input.brief)
  fallback.pageId = input.pageId
  fallback.variants = fallback.variants.map((v, i) => ({
    ...v,
    id: `variant-iter-${i + 1}`,
    name: `Iteration ${i + 1}: ${v.name}`
  }))

  try {
    const model = await createCampaignFunnelModel()
    const modelWithFormat = model.withStructuredOutput(campaignLandingPageSchema)
    const userContent = `Campaign brief:\n${JSON.stringify(input.brief, null, 2)}

Meta / campaign performance (raw paste):
${input.campaignMetricsText || '(none provided)'}

Webpage analytics (raw paste):
${input.webMetricsText || '(none provided)'}

${input.previousPage ? `Previous variants for context:\n${JSON.stringify(input.previousPage.variants.map(v => ({ id: v.id, angle: v.angle, hypothesis: v.hypothesis })), null, 2)}` : ''}

Set pageId to "${input.pageId}". Generate variant-iter-1, variant-iter-2, variant-iter-3.`

    const response = await invokeWithTimeout(() =>
      modelWithFormat.invoke([new SystemMessage(SYSTEM), new HumanMessage(userContent)])
    )
    const validated = campaignLandingPageSchema.parse(response)
    return { ...validated, pageId: input.pageId }
  } catch (err) {
    console.error('[iterationAgent] LLM failed, using brief-derived fallback:', err)
    return fallback
  }
}
