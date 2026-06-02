import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { CampaignLandingPage, MetaCampaignBrief, MetaCampaignInput } from '../../schemas/campaignFunnelSchemas.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAMPAIGNS_ROOT = path.resolve(__dirname, '../../../data/campaigns')

export type CampaignStatus = 'draft' | 'launched'

export type VariantUrl = {
  variantId: string
  url: string
}

export type StoredCampaign = {
  slug: string
  campaignName: string
  status: CampaignStatus
  createdAt: string
  launchedAt?: string
  input: MetaCampaignInput
  brief: MetaCampaignBrief
  page: CampaignLandingPage
  variantUrls: VariantUrl[]
  experimentGeneration: number
}

export type CampaignListItem = {
  slug: string
  campaignName: string
  status: CampaignStatus
  createdAt: string
  launchedAt?: string
  variantCount: number
  experimentGeneration: number
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'campaign'
  )
}

function campaignDir(slug: string) {
  return path.join(CAMPAIGNS_ROOT, slug)
}

function campaignFile(slug: string) {
  return path.join(campaignDir(slug), 'campaign.json')
}

/** Public frontend origin for campaign variant URLs — same `DOMAIN` as Stripe checkout redirects. */
export function getPublicAppUrl(): string {
  const raw = process.env.DOMAIN
  if (!raw) {
    throw new Error(
      'DOMAIN is not set in api-film-sesh/.env (public frontend origin, e.g. https://filmsesh.com).'
    )
  }
  return raw.replace(/^['"]|['"]$/g, '').replace(/\/$/, '')
}

export function buildVariantUrls(slug: string, page: CampaignLandingPage): VariantUrl[] {
  const base = getPublicAppUrl()
  return page.variants.map(v => ({
    variantId: v.id,
    url: `${base}/campaign/${slug}?variant=${encodeURIComponent(v.id)}`
  }))
}

/**
 * LLM output (`page.variants`) is copy-only — no URLs. Launch snapshots URLs into JSON,
 * but those strings go stale (local launch, env change, deploy). Always derive live URLs
 * from current DOMAIN + stored slug/variant ids for launched campaigns.
 */
export function resolveVariantUrls(campaign: StoredCampaign): StoredCampaign {
  if (campaign.status !== 'launched') {
    return campaign
  }
  return {
    ...campaign,
    variantUrls: buildVariantUrls(campaign.slug, campaign.page)
  }
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug
  let n = 2
  while (existsSync(campaignDir(slug))) {
    slug = `${baseSlug}-${n}`
    n++
  }
  return slug
}

export async function listCampaigns(): Promise<CampaignListItem[]> {
  if (!existsSync(CAMPAIGNS_ROOT)) {
    return []
  }
  const dirs = await readdir(CAMPAIGNS_ROOT, { withFileTypes: true })
  const items: CampaignListItem[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    try {
      const c = await getCampaign(d.name)
      items.push({
        slug: c.slug,
        campaignName: c.campaignName,
        status: c.status,
        createdAt: c.createdAt,
        launchedAt: c.launchedAt,
        variantCount: c.page.variants.length,
        experimentGeneration: c.experimentGeneration
      })
    } catch {
      // skip invalid
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getCampaign(slug: string): Promise<StoredCampaign> {
  const raw = await readFile(campaignFile(slug), 'utf-8')
  return resolveVariantUrls(JSON.parse(raw) as StoredCampaign)
}

export type SaveCampaignInput = {
  input: MetaCampaignInput
  brief: MetaCampaignBrief
  page: CampaignLandingPage
  launch?: boolean
  existingSlug?: string
}

export async function saveCampaign(data: SaveCampaignInput): Promise<StoredCampaign> {
  const baseSlug = slugify(data.brief.campaignName || data.input.campaignName)
  const slug = data.existingSlug ?? (await ensureUniqueSlug(baseSlug))
  const dir = campaignDir(slug)
  await mkdir(dir, { recursive: true })

  let existing: StoredCampaign | null = null
  if (existsSync(campaignFile(slug))) {
    try {
      existing = await getCampaign(slug)
    } catch {
      existing = null
    }
  }

  const launch = data.launch === true
  const page = { ...data.page, pageId: slug }

  const record: StoredCampaign = {
    slug,
    campaignName: data.brief.campaignName,
    status: 'draft',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    launchedAt: existing?.launchedAt,
    input: data.input,
    brief: data.brief,
    page,
    variantUrls: existing?.variantUrls ?? [],
    experimentGeneration: existing?.experimentGeneration ?? 1
  }

  if (launch) {
    record.status = 'launched'
    record.launchedAt = new Date().toISOString()
    record.variantUrls = buildVariantUrls(slug, page)
  } else if (existing?.status === 'launched') {
    record.status = 'launched'
    record.variantUrls = existing.variantUrls
    record.launchedAt = existing.launchedAt
  }

  await writeFile(campaignFile(slug), JSON.stringify(record, null, 2), 'utf-8')
  return resolveVariantUrls(record)
}

export async function updateCampaignPage(
  slug: string,
  page: CampaignLandingPage,
  launch: boolean
): Promise<StoredCampaign> {
  const existing = await getCampaign(slug)
  const nextGen = existing.experimentGeneration + 1
  const updatedPage = { ...page, pageId: slug }
  const record: StoredCampaign = {
    ...existing,
    page: updatedPage,
    experimentGeneration: nextGen,
    status: launch ? 'launched' : existing.status,
    launchedAt: launch ? new Date().toISOString() : existing.launchedAt,
    variantUrls: launch ? buildVariantUrls(slug, updatedPage) : existing.variantUrls
  }
  await writeFile(campaignFile(slug), JSON.stringify(record, null, 2), 'utf-8')
  return resolveVariantUrls(record)
}
