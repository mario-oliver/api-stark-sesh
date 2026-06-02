import { HumanMessage, SystemMessage } from 'langchain'
import {
  metaCampaignBriefSchema,
  metaCampaignInputSchema,
  type MetaCampaignBrief,
  type MetaCampaignInput
} from '../../../schemas/campaignFunnelSchemas.js'
import { buildBriefFromInput } from './fixtures.js'
import { createCampaignFunnelModel, invokeWithTimeout } from './model.js'

const SYSTEM = `You are a Meta/Instagram campaign strategist.
You are a Meta/Instagram campaign strategist for HoopReads, a voice-first AI coaching platform for basketball coaches.
Be specific to basketball coaching. Match brand tone from input.
Convert the user's campaign input JSON into a structured campaign brief.

Rules:
- Use ONLY facts and phrasing grounded in the provided input (campaign name, audience, offer, hooks, metrics, tone).
- Do NOT reuse generic template copy from prior examples or default HoopReads demo text.
- painPoints must be 3 specific pains for THIS audience and offer (not generic coaching platitudes).
- messageHypothesis must reference this campaign's creativeHook, adAngle, and primaryMetric.
- landingPagePromise should reflect the offer field.
- Output must match the schema exactly.`

export async function runMetaCampaignBriefAgent(input: MetaCampaignInput): Promise<MetaCampaignBrief> {
  const parsed = metaCampaignInputSchema.safeParse(input)
  if (!parsed.success) {
    return buildBriefFromInput(input)
  }

  try {
    const model = await createCampaignFunnelModel()
    const modelWithFormat = model.withStructuredOutput(metaCampaignBriefSchema)
    const userContent = `Create a unique brief from this campaign input. Every field must reflect these values — do not substitute demo/example copy:\n${JSON.stringify(parsed.data, null, 2)}`
    const response = await invokeWithTimeout(() =>
      modelWithFormat.invoke([new SystemMessage(SYSTEM), new HumanMessage(userContent)])
    )
    return metaCampaignBriefSchema.parse(response)
  } catch (err) {
    console.error('[briefAgent] LLM failed, using input-derived fallback:', err)
    return buildBriefFromInput(parsed.data)
  }
}
