import type { MetaMetricsRaw, VariantPerformance } from '../../../schemas/campaignFunnelSchemas.js'
import { DEMO_PERFORMANCE_SNAPSHOT } from './fixtures.js'

export function deriveMetaMetrics(raw: MetaMetricsRaw) {
  const ctr = raw.impressions > 0 ? raw.clicks / raw.impressions : 0
  const lpViewRate = raw.clicks > 0 ? raw.landingPageViews / raw.clicks : 0
  const signupRate = raw.landingPageViews > 0 ? raw.signups / raw.landingPageViews : 0
  const costPerSignup = raw.signups > 0 ? raw.spend / raw.signups : 0
  return {
    ...raw,
    ctr: Math.round(ctr * 10000) / 10000,
    lpViewRate: Math.round(lpViewRate * 10000) / 10000,
    signupRate: Math.round(signupRate * 10000) / 10000,
    costPerSignup: Math.round(costPerSignup * 100) / 100
  }
}

export function buildVariantPerformance(
  variantId: string,
  angle: string,
  metaRaw: MetaMetricsRaw,
  web: VariantPerformance['web']
): VariantPerformance {
  return {
    variantId,
    angle,
    meta: deriveMetaMetrics(metaRaw),
    web
  }
}

export function getDemoPerformanceSnapshot(campaignName?: string) {
  const snapshot = { ...DEMO_PERFORMANCE_SNAPSHOT }
  if (campaignName) snapshot.campaignName = campaignName
  return snapshot
}

export function mergeSnapshotWithWebOverrides(
  base: typeof DEMO_PERFORMANCE_SNAPSHOT,
  webByVariant: Record<string, Partial<VariantPerformance['web']>>
) {
  return {
    ...base,
    period: 'live_partial',
    variants: base.variants.map(v => ({
      ...v,
      web: { ...v.web, ...(webByVariant[v.variantId] ?? {}) }
    }))
  }
}
