import type {
  CampaignLandingPage,
  CampaignPerformanceSnapshot,
  MetaCampaignBrief,
  MetaCampaignInput,
  OptimizerRecommendation
} from '../../../schemas/campaignFunnelSchemas.js'

export const DEFAULT_CAMPAIGN_INPUT: MetaCampaignInput = {
  campaignName: 'HoopReads Coach Growth Campaign',
  platform: 'Instagram',
  adFormat: 'Reels',
  targetAudience: 'High school basketball coaches',
  trafficObjective: 'Drive free trial signups',
  offer: 'AI-powered coaching insights from voice notes',
  adAngle: 'Save time after practice',
  primaryMetric: 'free_trial_signup_rate',
  secondaryMetrics: ['landing_page_view_rate', 'cta_click_rate', 'cost_per_signup'],
  creativeHook: 'Your best coaching notes are probably sitting unused in your phone.',
  brandTone: 'practical, coach-first, credible'
}

/** Demo defaults for the funnel form only — not used as agent output. */
export const FALLBACK_BRIEF: MetaCampaignBrief = buildBriefFromInput(DEFAULT_CAMPAIGN_INPUT)

/** Derive a brief from user input when the LLM is unavailable (no static HoopReads copy). */
export function buildBriefFromInput(input: MetaCampaignInput): MetaCampaignBrief {
  const pains = [
    `${input.targetAudience}: friction around "${input.adAngle}"`,
    `Hard to achieve "${input.trafficObjective}" with current workflow`,
    `Gap between what you offer ("${input.offer}") and what prospects experience today`
  ]

  return {
    campaignName: input.campaignName,
    platform: input.platform,
    adFormat: input.adFormat,
    audience: input.targetAudience,
    objective: input.trafficObjective,
    primaryMetric: input.primaryMetric,
    adAngle: input.adAngle,
    creativeHook: input.creativeHook,
    painPoints: pains,
    landingPagePromise: input.offer,
    messageHypothesis: `If we lead with "${input.creativeHook}" for ${input.targetAudience}, we expect lift on ${input.primaryMetric} (${input.adAngle}).`,
    primaryCTA: 'Get started',
    recommendedLandingPageEmphasis: `${input.adAngle} · ${input.brandTone}`
  }
}

function painItems(brief: MetaCampaignBrief): string[] {
  const items = brief.painPoints.filter(Boolean)
  while (items.length < 3) {
    items.push(`Additional barrier to ${brief.objective}`)
  }
  return items.slice(0, 3)
}

function blocksFromBrief(
  brief: MetaCampaignBrief,
  angle: 'time_saving' | 'pain_amplification' | 'player_development'
) {
  const pains = painItems(brief)
  const cta = brief.primaryCTA

  if (angle === 'time_saving') {
    return {
      hero: {
        headline: brief.creativeHook,
        subheadline: brief.landingPagePromise,
        ctaText: cta
      },
      problem: {
        title: `What ${brief.audience} is up against`,
        items: pains
      },
      solution: {
        title: brief.adAngle,
        body: brief.landingPagePromise
      },
      howItWorks: {
        steps: [
          `Reach ${brief.audience} with ${brief.adFormat} on ${brief.platform}`,
          `Lead with: ${brief.creativeHook}`,
          `Optimize for ${brief.primaryMetric}`
        ]
      },
      proof: {
        title: brief.recommendedLandingPageEmphasis ?? brief.adAngle,
        body: brief.messageHypothesis
      },
      cta: {
        headline: brief.objective,
        buttonText: cta
      },
      faq: {
        items: [
          {
            question: `Who is this campaign for?`,
            answer: brief.audience
          },
          {
            question: `What are we measuring?`,
            answer: brief.primaryMetric
          }
        ]
      }
    }
  }

  if (angle === 'pain_amplification') {
    return {
      hero: {
        headline: `The cost of ignoring ${brief.adAngle}`,
        subheadline: pains[0],
        ctaText: cta
      },
      problem: {
        title: `Pain points for ${brief.audience}`,
        items: pains
      },
      solution: {
        title: brief.landingPagePromise,
        body: brief.messageHypothesis
      },
      howItWorks: {
        steps: [
          'Surface the problem clearly above the fold',
          `Connect pain to ${brief.landingPagePromise}`,
          `Drive ${brief.primaryMetric}`
        ]
      },
      proof: {
        title: brief.objective,
        body: brief.adAngle
      },
      cta: {
        headline: brief.creativeHook,
        buttonText: cta
      },
      faq: {
        items: [
          {
            question: `Why now?`,
            answer: pains[1]
          },
          {
            question: `What changes after signup?`,
            answer: brief.landingPagePromise
          }
        ]
      }
    }
  }

  return {
    hero: {
      headline: `Outcome-focused: ${brief.objective}`,
      subheadline: brief.landingPagePromise,
      ctaText: cta
    },
    problem: {
      title: `Without the right message, ${brief.primaryMetric} stalls`,
      items: pains
    },
    solution: {
      title: brief.adAngle,
      body: brief.landingPagePromise
    },
    howItWorks: {
      steps: [
        `Promise: ${brief.creativeHook}`,
        `Proof angle: ${brief.recommendedLandingPageEmphasis ?? brief.adAngle}`,
        `CTA: ${cta}`
      ]
    },
    proof: {
      title: `Built for ${brief.audience}`,
      body: brief.messageHypothesis
    },
    cta: {
      headline: brief.adAngle,
      buttonText: cta
    },
    faq: {
      items: [
        {
          question: `What is the main offer?`,
          answer: brief.landingPagePromise
        },
        {
          question: `What is the hypothesis?`,
          answer: brief.messageHypothesis
        }
      ]
    }
  }
}

export function buildFallbackLandingPage(brief: MetaCampaignBrief): CampaignLandingPage {
  const platform =
    brief.platform === 'Facebook' || brief.platform === 'Meta' || brief.platform === 'Instagram'
      ? brief.platform
      : 'Instagram'

  return {
    pageId: brief.campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'campaign',
    campaignName: brief.campaignName,
    platform,
    template: 'CampaignLandingPage',
    variants: [
      {
        id: 'variant-a',
        name: 'Ad-Message Match',
        angle: 'time_saving',
        hypothesis: brief.messageHypothesis,
        blocks: blocksFromBrief(brief, 'time_saving')
      },
      {
        id: 'variant-b',
        name: 'Pain Amplification',
        angle: 'pain_amplification',
        hypothesis: `Pain-led page for ${brief.audience}: ${brief.painPoints[0] ?? brief.adAngle}`,
        blocks: blocksFromBrief(brief, 'pain_amplification')
      },
      {
        id: 'variant-c',
        name: 'Outcome-Driven',
        angle: 'player_development',
        hypothesis: `Outcome page optimizing for ${brief.primaryMetric}: ${brief.objective}`,
        blocks: blocksFromBrief(brief, 'player_development')
      }
    ]
  }
}

export const DEMO_PERFORMANCE_SNAPSHOT: CampaignPerformanceSnapshot = {
  campaignName: 'HoopReads Coach Growth Campaign',
  platform: 'Instagram',
  period: 'demo_fixture',
  variants: [
    {
      variantId: 'variant-a',
      angle: 'time_saving',
      meta: {
        impressions: 24000,
        clicks: 960,
        landingPageViews: 720,
        signups: 36,
        spend: 840,
        ctr: 0.04,
        lpViewRate: 0.75,
        signupRate: 0.05,
        costPerSignup: 23.33
      },
      web: {
        pageViews: 710,
        uniqueVisitors: 680,
        bounceRate: 0.38,
        avgTimeOnPageSec: 94,
        scrollDepthP50: 72,
        ctaClickRate: 0.18,
        signupConversionRate: 0.051,
        webVitals: { lcpMs: 2100, cls: 0.04, inpMs: 95 }
      }
    },
    {
      variantId: 'variant-b',
      angle: 'pain_amplification',
      meta: {
        impressions: 23000,
        clicks: 874,
        landingPageViews: 640,
        signups: 24,
        spend: 805,
        ctr: 0.038,
        lpViewRate: 0.732,
        signupRate: 0.0375,
        costPerSignup: 33.54
      },
      web: {
        pageViews: 630,
        uniqueVisitors: 605,
        bounceRate: 0.44,
        avgTimeOnPageSec: 81,
        scrollDepthP50: 65,
        ctaClickRate: 0.14,
        signupConversionRate: 0.038,
        webVitals: { lcpMs: 2300, cls: 0.06, inpMs: 110 }
      }
    },
    {
      variantId: 'variant-c',
      angle: 'player_development',
      meta: {
        impressions: 25000,
        clicks: 925,
        landingPageViews: 690,
        signups: 27,
        spend: 875,
        ctr: 0.037,
        lpViewRate: 0.746,
        signupRate: 0.039,
        costPerSignup: 32.41
      },
      web: {
        pageViews: 675,
        uniqueVisitors: 650,
        bounceRate: 0.41,
        avgTimeOnPageSec: 88,
        scrollDepthP50: 68,
        ctaClickRate: 0.15,
        signupConversionRate: 0.04,
        webVitals: { lcpMs: 2200, cls: 0.05, inpMs: 102 }
      }
    }
  ]
}

export const FALLBACK_OPTIMIZER: OptimizerRecommendation = {
  winner: 'variant-a',
  winningAngle: 'time_saving',
  summary:
    'The time-saving variant produced the strongest signup rate and lowest cost per signup, with the best web engagement (lowest bounce, highest scroll depth).',
  insights: [
    'Meta layer: Variant A had the highest conversion from landing page view to signup and lowest cost per signup.',
    'Web layer: Variant A also led on CTA click rate (18%) and scroll depth P50 (72%), indicating strong message match.',
    'Divergence: Variant B drove comparable Meta clicks but higher web bounce (44%) — pain messaging attracted clicks but weakened on-page engagement.',
    'Player development (Variant C) may work better for retargeting or longer-form content than cold Instagram traffic.'
  ],
  metricLayersCited: ['both', 'meta', 'web', 'both'],
  nextExperiment: {
    type: 'CTA test',
    reason:
      'The time-saving message is working on both ad and web layers. The next highest-leverage test is CTA wording while holding the hero constant.',
    variants: [
      { name: 'Direct CTA', cta: 'Start free' },
      { name: 'Outcome CTA', cta: 'Turn notes into insights' },
      { name: 'Pain-relief CTA', cta: 'Save time after practice' }
    ]
  },
  recommendedAction: 'Promote Variant A as the control and generate a new CTA-focused experiment.',
  confidenceNote: 'Based on demo fixture data; paste live Vercel analytics summaries for production confidence.'
}
