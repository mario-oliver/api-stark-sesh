import { HumanMessage, SystemMessage } from 'langchain'
import {
  campaignLandingPageSchema,
  campaignPerformanceSnapshotSchema,
  optimizerRecommendationSchema,
  type CampaignLandingPage,
  type CampaignPerformanceSnapshot,
  type OptimizerRecommendation
} from '../../../schemas/campaignFunnelSchemas.js'
import { FALLBACK_OPTIMIZER } from './fixtures.js'
import { createCampaignFunnelModel, invokeWithTimeout } from './model.js'

const SYSTEM = `You are a Meta Performance Optimizer for HoopReads campaign landing experiments.
You receive BOTH ad-layer (Meta) metrics and web-layer (Vercel web analytics) metrics per variant.

Analyze:
- Meta: CTR, LP view rate, signup rate, cost per signup (acquisition efficiency)
- Web: bounce rate, time on page, scroll depth, CTA click rate, signup conversion, web vitals (message match & engagement)
- Flag divergence when Meta clicks are strong but web bounce is high (landing page mismatch)
- Recommend next experiment based on weakest funnel stage

In insights, cite which layer (meta vs web) supports each point.
Set metricLayersCited array entries to meta, web, or both where relevant.
winner must be a variant id (e.g. variant-a).`

export async function runMetaPerformanceOptimizerAgent(
  page: CampaignLandingPage,
  performance: CampaignPerformanceSnapshot
): Promise<OptimizerRecommendation> {
  const pageValid = campaignLandingPageSchema.safeParse(page)
  const perfValid = campaignPerformanceSnapshotSchema.safeParse(performance)
  if (!pageValid.success || !perfValid.success) {
    return FALLBACK_OPTIMIZER
  }

  try {
    const model = await createCampaignFunnelModel()
    const modelWithFormat = model.withStructuredOutput(optimizerRecommendationSchema)
    const userContent = `Landing page variants (hypotheses):\n${JSON.stringify(
      pageValid.data.variants.map(v => ({
        id: v.id,
        name: v.name,
        angle: v.angle,
        hypothesis: v.hypothesis
      })),
      null,
      2
    )}\n\nPerformance snapshot:\n${JSON.stringify(perfValid.data, null, 2)}`
    const response = await invokeWithTimeout(() =>
      modelWithFormat.invoke([new SystemMessage(SYSTEM), new HumanMessage(userContent)])
    )
    return optimizerRecommendationSchema.parse(response)
  } catch {
    return {
      ...FALLBACK_OPTIMIZER,
      summary: `${FALLBACK_OPTIMIZER.summary} (fallback — LLM unavailable)`
    }
  }
}
