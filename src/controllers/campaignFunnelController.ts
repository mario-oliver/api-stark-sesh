import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  metaCampaignInputSchema,
  type CampaignLandingPage,
  type MetaCampaignBrief
} from '../schemas/campaignFunnelSchemas.js'
import { runMetaCampaignBriefAgent } from '../services/ai/campaign-funnel/briefAgent.js'
import { runContentExperimentationAgent } from '../services/ai/campaign-funnel/contentAgent.js'
import { runMetaPerformanceOptimizerAgent } from '../services/ai/campaign-funnel/optimizerAgent.js'
import { DEFAULT_CAMPAIGN_INPUT } from '../services/ai/campaign-funnel/fixtures.js'
import { getDemoPerformanceSnapshot } from '../services/ai/campaign-funnel/performanceSnapshot.js'
export async function postBrief(request: FastifyRequest, reply: FastifyReply) {
  const body = metaCampaignInputSchema.safeParse(request.body)
  if (!body.success) {
    return reply.status(400).send({ success: false, message: 'Invalid campaign input', errors: body.error.flatten() })
  }

  const brief = await runMetaCampaignBriefAgent(body.data)
  return reply.send({ success: true, data: brief })
}

export async function postVariants(
  request: FastifyRequest<{ Body: MetaCampaignBrief }>,
  reply: FastifyReply
) {
  const brief = request.body
  if (!brief?.campaignName) {
    return reply.status(400).send({ success: false, message: 'Campaign brief required' })
  }

  const page = await runContentExperimentationAgent(brief)
  return reply.send({ success: true, data: page })
}

export async function getPerformance(
  request: FastifyRequest<{ Params: { pageId: string }; Querystring: { campaignName?: string } }>,
  reply: FastifyReply
) {
  const snapshot = getDemoPerformanceSnapshot(request.query.campaignName)
  return reply.send({ success: true, data: snapshot })
}

export async function postOptimize(
  request: FastifyRequest<{
    Body: { page: CampaignLandingPage; performance?: ReturnType<typeof getDemoPerformanceSnapshot> }
  }>,
  reply: FastifyReply
) {
  const { page } = request.body
  if (!page?.variants?.length) {
    return reply.status(400).send({ success: false, message: 'Campaign landing page required' })
  }

  const performance = request.body.performance ?? getDemoPerformanceSnapshot(page.campaignName)
  const recommendation = await runMetaPerformanceOptimizerAgent(page, performance)
  return reply.send({ success: true, data: recommendation })
}

export async function getDefaultInput(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send({ success: true, data: DEFAULT_CAMPAIGN_INPUT })
}

export async function runFullPipeline(request: FastifyRequest, reply: FastifyReply) {
  const body = metaCampaignInputSchema.safeParse(request.body ?? DEFAULT_CAMPAIGN_INPUT)
  const input = body.success ? body.data : DEFAULT_CAMPAIGN_INPUT

  const brief = await runMetaCampaignBriefAgent(input)
  const page = await runContentExperimentationAgent(brief)

  return reply.send({
    success: true,
    data: { brief, page }
  })
}
