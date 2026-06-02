import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  metaCampaignInputSchema,
  metaCampaignBriefSchema,
  campaignLandingPageSchema
} from '../schemas/campaignFunnelSchemas.js'
import {
  getCampaign,
  listCampaigns,
  saveCampaign,
  updateCampaignPage
} from '../services/campaigns/campaignStore.js'
import { runPerformanceIterationAgent } from '../services/ai/campaign-funnel/iterationAgent.js'
const saveBodySchema = z.object({
  input: metaCampaignInputSchema,
  brief: metaCampaignBriefSchema,
  page: campaignLandingPageSchema,
  launch: z.boolean().optional().default(false),
  existingSlug: z.string().optional()
})

const iterateBodySchema = z.object({
  campaignMetricsText: z.string(),
  webMetricsText: z.string(),
  launch: z.boolean().optional().default(false)
})

export async function getCampaignsList(_request: FastifyRequest, reply: FastifyReply) {
  const campaigns = await listCampaigns()
  return reply.send({ success: true, data: campaigns })
}

export async function getCampaignBySlug(
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  try {
    const campaign = await getCampaign(request.params.slug)
    return reply.send({ success: true, data: campaign })
  } catch {
    return reply.status(404).send({ success: false, message: 'Campaign not found' })
  }
}

export async function postSaveCampaign(request: FastifyRequest, reply: FastifyReply) {
  const parsed = saveBodySchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() })
  }

  const record = await saveCampaign(parsed.data)
  return reply.send({ success: true, data: record })
}

export async function postIterateCampaign(
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
) {
  const parsed = iterateBodySchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() })
  }

  let existing
  try {
    existing = await getCampaign(request.params.slug)
  } catch {
    return reply.status(404).send({ success: false, message: 'Campaign not found' })
  }

  const page = await runPerformanceIterationAgent({
    brief: existing.brief,
    campaignMetricsText: parsed.data.campaignMetricsText,
    webMetricsText: parsed.data.webMetricsText,
    previousPage: existing.page,
    pageId: existing.slug
  })

  const record = await updateCampaignPage(existing.slug, page, parsed.data.launch === true)
  return reply.send({ success: true, data: { page, campaign: record } })
}
