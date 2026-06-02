import { HumanMessage, SystemMessage } from 'langchain'
import {
  campaignLandingPageSchema,
  type CampaignLandingPage,
  type MetaCampaignBrief
} from '../../../schemas/campaignFunnelSchemas.js'
import { buildFallbackLandingPage } from './fixtures.js'
import { createCampaignFunnelModel, invokeWithTimeout } from './model.js'

const SYSTEM = `You are a Content Experimentation Agent for paid social landing pages.
Generate exactly 3 landing page content variants inside a FIXED CMS template.
Each variant must include all 7 blocks: hero, problem, solution, howItWorks, proof, cta, faq.
Do NOT change layout or block types — only fill copy.

Variant angles:
- variant-a (Ad-Message Match): mirror the campaign brief's ad angle and creative hook (id: variant-a, angle: time_saving)
- variant-b (Pain Amplification): emphasize the brief's pain points (id: variant-b, angle: pain_amplification)
- variant-c (Outcome-Driven): emphasize objective and offer (id: variant-c, angle: player_development)

Rules:
- All copy must be specific to the campaign brief provided (audience, offer, hooks, pains).
- Do NOT reuse HoopReads or other stock demo copy unless it appears in the brief.
- campaignName and platform must match the brief.
- pageId: slugify campaignName (lowercase, hyphens).
- Each variant needs a distinct hypothesis tied to the brief.`

export async function runContentExperimentationAgent(
  brief: MetaCampaignBrief
): Promise<CampaignLandingPage> {
  const fallback = buildFallbackLandingPage(brief)

  try {
    const model = await createCampaignFunnelModel()
    const modelWithFormat = model.withStructuredOutput(campaignLandingPageSchema)
    const userContent = `Generate landing variants from this brief. Copy must reflect these specifics — no generic template text:\n${JSON.stringify(brief, null, 2)}`
    const response = await invokeWithTimeout(() =>
      modelWithFormat.invoke([new SystemMessage(SYSTEM), new HumanMessage(userContent)])
    )
    const validated = campaignLandingPageSchema.parse(response)
    if (validated.variants.length < 2) {
      console.warn('[contentAgent] Too few variants from LLM, using brief-derived fallback')
      return fallback
    }
    return validated
  } catch (err) {
    console.error('[contentAgent] LLM failed, using brief-derived fallback:', err)
    return fallback
  }
}
