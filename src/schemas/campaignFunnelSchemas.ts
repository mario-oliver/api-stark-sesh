import { z } from 'zod'

export const metaCampaignInputSchema = z.object({
  campaignName: z.string().min(1),
  platform: z.enum(['Instagram', 'Facebook', 'Meta']).default('Instagram'),
  adFormat: z.string().min(1),
  targetAudience: z.string().min(1),
  trafficObjective: z.string().min(1),
  offer: z.string().min(1),
  adAngle: z.string().min(1),
  primaryMetric: z.string().min(1),
  secondaryMetrics: z.array(z.string()).optional().default([]),
  creativeHook: z.string().min(1),
  brandTone: z.string().min(1)
})

export const metaCampaignBriefSchema = z.object({
  campaignName: z.string(),
  platform: z.string(),
  adFormat: z.string(),
  audience: z.string(),
  objective: z.string(),
  primaryMetric: z.string(),
  adAngle: z.string(),
  creativeHook: z.string(),
  painPoints: z.array(z.string()).min(1).max(6),
  landingPagePromise: z.string(),
  messageHypothesis: z.string(),
  primaryCTA: z.string(),
  recommendedLandingPageEmphasis: z.string().optional()
})

const heroBlockSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string()
})

const problemBlockSchema = z.object({
  title: z.string(),
  items: z.array(z.string()).min(1).max(6)
})

const solutionBlockSchema = z.object({
  title: z.string(),
  body: z.string()
})

const howItWorksBlockSchema = z.object({
  steps: z.array(z.string()).min(2).max(5)
})

const proofBlockSchema = z.object({
  title: z.string(),
  body: z.string()
})

const ctaBlockSchema = z.object({
  headline: z.string(),
  buttonText: z.string()
})

const faqBlockSchema = z.object({
  items: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string()
      })
    )
    .min(1)
    .max(6)
})

export const campaignVariantBlocksSchema = z.object({
  hero: heroBlockSchema,
  problem: problemBlockSchema,
  solution: solutionBlockSchema,
  howItWorks: howItWorksBlockSchema,
  proof: proofBlockSchema,
  cta: ctaBlockSchema,
  faq: faqBlockSchema
})

export const campaignVariantSchema = z.object({
  id: z.string(),
  name: z.string(),
  angle: z.string(),
  hypothesis: z.string(),
  blocks: campaignVariantBlocksSchema
})

export const campaignLandingPageSchema = z.object({
  pageId: z.string(),
  campaignName: z.string(),
  platform: z.enum(['Instagram', 'Facebook', 'Meta']),
  template: z.literal('CampaignLandingPage'),
  variants: z.array(campaignVariantSchema).min(2).max(3)
})

const metaMetricsRawSchema = z.object({
  impressions: z.number(),
  clicks: z.number(),
  landingPageViews: z.number(),
  signups: z.number(),
  spend: z.number()
})

const metaMetricsDerivedSchema = z.object({
  impressions: z.number(),
  clicks: z.number(),
  landingPageViews: z.number(),
  signups: z.number(),
  spend: z.number(),
  ctr: z.number(),
  lpViewRate: z.number(),
  signupRate: z.number(),
  costPerSignup: z.number()
})

const webMetricsSchema = z.object({
  pageViews: z.number(),
  uniqueVisitors: z.number(),
  bounceRate: z.number(),
  avgTimeOnPageSec: z.number(),
  scrollDepthP50: z.number(),
  ctaClickRate: z.number(),
  signupConversionRate: z.number(),
  webVitals: z
    .object({
      lcpMs: z.number().optional(),
      cls: z.number().optional(),
      inpMs: z.number().optional()
    })
    .optional()
})

export const variantPerformanceSchema = z.object({
  variantId: z.string(),
  angle: z.string(),
  meta: metaMetricsDerivedSchema,
  web: webMetricsSchema
})

export const campaignPerformanceSnapshotSchema = z.object({
  campaignName: z.string(),
  platform: z.string(),
  period: z.string(),
  variants: z.array(variantPerformanceSchema).min(1)
})

export const optimizerRecommendationSchema = z.object({
  winner: z.string(),
  winningAngle: z.string(),
  summary: z.string(),
  insights: z.array(z.string()).min(1).max(8),
  metricLayersCited: z.array(z.enum(['meta', 'web', 'both'])).optional(),
  nextExperiment: z.object({
    type: z.string(),
    reason: z.string(),
    variants: z.array(
      z.object({
        name: z.string(),
        cta: z.string().optional(),
        headline: z.string().optional()
      })
    )
  }),
  recommendedAction: z.string(),
  confidenceNote: z.string().optional()
})

export type MetaCampaignInput = z.infer<typeof metaCampaignInputSchema>
export type MetaCampaignBrief = z.infer<typeof metaCampaignBriefSchema>
export type CampaignVariantBlocks = z.infer<typeof campaignVariantBlocksSchema>
export type CampaignVariant = z.infer<typeof campaignVariantSchema>
export type CampaignLandingPage = z.infer<typeof campaignLandingPageSchema>
export type MetaMetricsRaw = z.infer<typeof metaMetricsRawSchema>
export type VariantPerformance = z.infer<typeof variantPerformanceSchema>
export type CampaignPerformanceSnapshot = z.infer<typeof campaignPerformanceSnapshotSchema>
export type OptimizerRecommendation = z.infer<typeof optimizerRecommendationSchema>

export { metaMetricsRawSchema }
