// Shared marketing rules for the edge functions.
//
//   draftFromCaptures  photos + a note in, a caption out. Used by
//                      marketing-draft (a person pressed Draft with AI) and
//                      marketing-suggest (the cron drafting unasked).
//   imageBlockFor      a capture as a Claude image block: public bucket by
//                      URL, private bucket by bytes (nothing private ever
//                      gets a public URL before a human publishes it).
//   notifyManagers     one row per Manager+ in employee_notifications (waits
//                      until read, shows in Field Scout) plus one
//                      company_notifications toast for whoever is looking.
//   managerIds         who counts as a manager for that.
//
// Mirrors src/lib/marketing.js styleExamples(): the last 20 approved captions
// and the last 10 ai_draft≠caption edit pairs are the style examples.

import { callAnthropic } from './anthropic.ts'

export const MEDIA_BUCKET = 'marketing-media'

// ── Brands (mirrors src/lib/marketing.js) ─────────────────────────────
// A company can market several things with different voices and accounts.
// Brand-scoped settings are the base key suffixed with the brand id; the
// default brand ('') keeps the bare key. A brand may name the business unit
// whose finished jobs feed it.
export interface Brand { id: string; name: string; unit: string | null; logo_url: string }
export const brandKey = (base: string, brandId?: string | null) => (brandId ? `${base}:${brandId}` : base)
export const brandProfileUsername = (companyId: number, brandId?: string | null) => (brandId ? `jobscout-${companyId}-${brandId}` : `jobscout-${companyId}`)
export const slugify = (name: string) => String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
export function brandsFrom(setting: unknown, company: { company_name?: string; logo_url?: string } = {}): Brand[] {
  let raw: any[] = []
  try { raw = Array.isArray(setting) ? setting : JSON.parse(String(setting || '[]')) } catch { raw = [] }
  const list: Brand[] = (Array.isArray(raw) ? raw : [])
    .filter((b) => b && (b.name || b.id))
    .map((b) => ({ id: b.id || slugify(b.name), name: b.name || b.id, unit: b.unit || null, logo_url: b.logo_url || '' }))
    .filter((b) => b.id)
  if (list.length) return list
  return [{ id: '', name: company.company_name || 'Company', unit: null, logo_url: company.logo_url || '' }]
}
export function brandForUnit(brands: Brand[], unit: unknown): string | null {
  if (!brands?.length) return null
  if (brands.length === 1) return brands[0].id
  const u = String(unit || '').trim().toLowerCase()
  if (!u) return null
  const hit = brands.find((b) => String(b.unit || '').trim().toLowerCase() === u)
  return hit ? hit.id : null
}
export async function loadBrands(sb: any, companyId: number): Promise<Brand[]> {
  const [{ data: s }, { data: co }] = await Promise.all([
    sb.from('settings').select('value').eq('company_id', companyId).eq('key', 'marketing_brands').limit(1),
    sb.from('companies').select('company_name, logo_url').eq('id', companyId).maybeSingle(),
  ])
  return brandsFrom(s?.[0]?.value, co || {})
}

const PLATFORM_HINTS: Record<string, string> = {
  facebook: 'Facebook: conversational, 1-3 short paragraphs, a question or invitation at the end works.',
  instagram: 'Instagram: lead with the visual, short lines, 5-10 hashtags at the end.',
  google_business: 'Google Business Profile: plain, local, service-focused, no hashtags, under 1500 characters, name the city.',
  linkedin: 'LinkedIn: professional but human, one insight about the work, 3-5 hashtags max.',
  x: 'X: 280 characters total including hashtags.',
  threads: 'Threads: 500 characters, casual.',
  bluesky: 'Bluesky: 300 characters, casual.',
  pinterest: 'Pinterest: descriptive, keyword-rich, 500 characters.',
  tiktok: 'TikTok: hook first, casual, hashtags.',
  youtube: 'YouTube: a title-like first line then a description.',
}

function parseJsonSetting(v: unknown): any {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(String(v)) } catch { return null }
}

// City only, never the street: the address goes to the model so it can say
// "in Ogden", not so it can print where the customer lives.
export function cityOf(addr: unknown): string {
  const parts = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2].replace(/\s+\d{5}(-\d{4})?$/, '') : ''
}

export async function imageBlockFor(sb: any, capture: { bucket?: string; path?: string; url?: string; media_type?: string }) {
  if (capture.media_type === 'video') return null
  if (capture.bucket && capture.bucket !== MEDIA_BUCKET && capture.path) {
    try {
      const { data, error } = await sb.storage.from(capture.bucket).download(capture.path)
      if (error || !data) return null
      const buf = new Uint8Array(await data.arrayBuffer())
      if (buf.byteLength > 4_500_000) return null // stay under the request cap
      let bin = ''
      for (let i = 0; i < buf.byteLength; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + 0x8000)))
      const type = (data.type && data.type.startsWith('image/')) ? data.type : 'image/jpeg'
      return { type: 'image', source: { type: 'base64', media_type: type, data: btoa(bin) } }
    } catch { return null }
  }
  if (capture.url) return { type: 'image', source: { type: 'url', url: capture.url } }
  return null
}

export interface DraftInput {
  sb: any
  companyId: number
  captureIds?: number[]
  note?: string
  platforms?: string[]
  jobId?: number | null
  brand?: string | null   // brand id; '' or null = the company default brand
  tone?: string
  feature?: string
  req?: Request
}
export interface DraftResult {
  ok: boolean
  caption?: string
  hashtags?: string[]
  alt_text?: string
  error?: string
  unavailable?: boolean
}

export async function draftFromCaptures(input: DraftInput): Promise<DraftResult> {
  const { sb, companyId } = input
  const captureIds = (input.captureIds || []).map(Number).filter(Boolean).slice(0, 5)
  const note = String(input.note || '').slice(0, 2000)
  const platforms = (input.platforms || []).map(String)
  const tone = String(input.tone || '').slice(0, 200)
  if (!captureIds.length && !note.trim()) return { ok: false, error: 'Give the AI something to go on: a photo or a note about what happened.' }
  const brandId = input.brand || ''

  // Style examples are per brand: a cleaning caption is not an example for
  // the lighting voice.
  let historyQ = sb.from('marketing_posts').select('caption, ai_draft, status, approved_at, created_at')
    .eq('company_id', companyId).in('status', ['approved', 'scheduled', 'posted'])
  historyQ = brandId ? historyQ.eq('brand', brandId) : historyQ.is('brand', null)

  const [{ data: settingRows }, { data: company }, { data: captures }, { data: history }, job] = await Promise.all([
    sb.from('settings').select('key, value').eq('company_id', companyId)
      .in('key', ['marketing_brand_kit', brandKey('marketing_brand_kit', brandId), 'marketing_brands', 'eos_core_values', 'eos_core_focus', 'eos_marketing_strategy']),
    sb.from('companies').select('company_name, logo_url, city, state, website, phone').eq('id', companyId).maybeSingle(),
    captureIds.length
      ? sb.from('marketing_captures').select('id, url, bucket, path, note, media_type, job_id, frames, poster_url, duration_s').eq('company_id', companyId).in('id', captureIds)
      : Promise.resolve({ data: [] as any[] }),
    historyQ.order('created_at', { ascending: false }).limit(40),
    input.jobId
      ? sb.from('jobs').select('job_title, service_type, job_address, details, notes').eq('company_id', companyId).eq('id', input.jobId).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ])

  const setting = (k: string) => parseJsonSetting((settingRows || []).find((r: any) => r.key === k)?.value)
  // A brand with no kit of its own borrows the company's; EOS stays company-wide.
  const kit = setting(brandKey('marketing_brand_kit', brandId)) || setting('marketing_brand_kit') || {}
  const brands = brandsFrom(setting('marketing_brands'), company || {})
  const brand = brands.find((b) => b.id === brandId) || brands[0]
  const values = (setting('eos_core_values') || []).map((v: any) => (typeof v === 'string' ? v : v?.value)).filter(Boolean)
  const focus = setting('eos_core_focus') || {}
  const mk = setting('eos_marketing_strategy') || {}

  const hist = (history || []).filter((p: any) => (p.caption || '').trim())
  const approved = hist.slice(0, 20).map((p: any) => p.caption.trim())
  const edits = hist.filter((p: any) => (p.ai_draft || '').trim() && p.ai_draft.trim() !== p.caption.trim())
    .slice(0, 10).map((p: any) => ({ before: p.ai_draft.trim(), after: p.caption.trim() }))

  const brandLines = [
    `Company: ${kit.company_name || brand?.name || company?.company_name || 'our company'}`,
    brand?.id && brand.name !== company?.company_name ? `This brand is "${brand.name}", run by ${company?.company_name}. Post as ${brand.name}; only mention ${company?.company_name} if the brand kit says to.` : '',
    kit.tagline ? `Tagline / what we do: ${kit.tagline}` : (focus.niche ? `What we do: ${focus.niche}` : ''),
    kit.service_area || company?.city ? `Service area: ${kit.service_area || [company?.city, company?.state].filter(Boolean).join(', ')}` : '',
    kit.audience || mk.target_market ? `Audience: ${kit.audience || mk.target_market}` : '',
    kit.voice ? `Voice: ${kit.voice}` : (focus.purpose ? `Purpose: ${focus.purpose}` : ''),
    (kit.tone_words || []).length ? `Tone: ${kit.tone_words.join(', ')}` : '',
    (kit.values || values).length ? `Core values: ${(kit.values?.length ? kit.values : values).join(', ')}` : '',
    (kit.uniques || []).length ? `What sets us apart: ${kit.uniques.join('; ')}` : ((mk.three_uniques || []).filter(Boolean).length ? `What sets us apart: ${mk.three_uniques.filter(Boolean).join('; ')}` : ''),
    kit.guarantee || mk.guarantee ? `Guarantee: ${kit.guarantee || mk.guarantee}` : '',
    (kit.services || []).length ? `Services we post about: ${kit.services.join(', ')}` : '',
    (kit.do_say || []).length ? `Say things like: ${kit.do_say.join(' | ')}` : '',
    (kit.dont_say || []).length ? `NEVER say: ${kit.dont_say.join(' | ')}` : '',
    (kit.hashtags || []).length ? `House hashtags (use some, not all): ${kit.hashtags.join(' ')}` : '',
    kit.cta ? `Default call to action: ${kit.cta}` : '',
    kit.website || company?.website ? `Website: ${kit.website || company?.website}` : '',
    kit.phone || company?.phone ? `Phone: ${kit.phone || company?.phone}` : '',
  ].filter(Boolean).join('\n')

  const platformText = platforms.length
    ? platforms.map((p) => PLATFORM_HINTS[p] || p).join('\n')
    : 'One caption that works on Facebook, Instagram and Google Business Profile: under 1500 characters, hashtags only at the end.'

  const system = `You write social media posts for a small field-services company. You write in the company's own voice, described below, and you learn from the examples of what they approved and how they edited earlier drafts.

BRAND
${brandLines}

RULES
- Write ONE caption in the company's voice. Plain words. No emojis unless the approved examples use them.
- Talk about the actual work in the photos and the note. Never invent facts, prices, customer names, or results that are not in the note.
- Do not name the customer or the exact street address unless the note says to.
- Do not describe the photo literally ("here is a photo of"); talk to the reader.
- Return strict JSON: {"caption": string, "hashtags": string[], "alt_text": string}. hashtags are bare words without #, 0-10 of them, none for Google Business. alt_text is one sentence describing the image for accessibility.
${tone ? `- Tone for this post: ${tone}` : ''}

PLATFORMS
${platformText}
${approved.length ? `\nAPPROVED CAPTIONS (this is how they sound; match it)\n${approved.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}
${edits.length ? `\nEDITS THEY MADE TO EARLIER DRAFTS (learn from the corrections)\n${edits.map((e) => `- Draft: ${e.before}\n  Changed to: ${e.after}`).join('\n')}` : ''}`

  const content: any[] = []
  let hasVideo = false
  let blindVideo = false
  for (const c of captures || []) {
    if (c.media_type === 'video') {
      hasVideo = true
      // Stills pulled out in the browser at upload time; a texted video has none.
      const frames: string[] = Array.isArray(c.frames) ? c.frames.filter(Boolean) : []
      if (frames.length) {
        content.push({ type: 'text', text: `The next ${frames.length} image${frames.length === 1 ? '' : 's'} are stills from one video${c.duration_s ? ` (${Math.round(Number(c.duration_s))}s)` : ''}, in order.` })
        for (const u of frames.slice(0, 4)) content.push({ type: 'image', source: { type: 'url', url: u } })
      } else blindVideo = true
      if (c.note) content.push({ type: 'text', text: `Note on that video: ${c.note}` })
      continue
    }
    const block = await imageBlockFor(sb, c)
    if (block) content.push(block)
    if (c.note) content.push({ type: 'text', text: `Note on that photo: ${c.note}` })
  }
  const jobBits = job?.data
    ? [
        `Job: ${[job.data.job_title, job.data.service_type].filter(Boolean).join(' / ')}`,
        cityOf(job.data.job_address) ? `City: ${cityOf(job.data.job_address)}` : '',
        job.data.details ? `Job details: ${String(job.data.details).slice(0, 600)}` : '',
        job.data.notes ? `Job notes: ${String(job.data.notes).slice(0, 400)}` : '',
      ].filter(Boolean).join('\n')
    : ''
  content.push({
    type: 'text',
    text: [
      note ? `What the crew said: ${note}` : 'No note from the crew; go by the photos and the job.',
      jobBits,
      blindVideo ? 'One of the attachments is a video with no stills available; go by the note.' : hasVideo ? 'This is a video post; write for a video.' : '',
      'Write the post now. JSON only.',
    ].filter(Boolean).join('\n\n'),
  })

  const ai = await callAnthropic(
    { feature: input.feature || 'marketing-draft', companyId, req: input.req },
    { model: 'claude-sonnet-4-6', max_tokens: 1024, system, messages: [{ role: 'user', content }] },
  )
  if (!ai.ok) return { ok: false, error: ai.friendly, unavailable: ai.unavailable === true }

  const text = (ai.data?.content || []).map((c: any) => c.text || '').join('').trim()
  let parsed: any = null
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : null
  } catch { parsed = null }
  if (!parsed || typeof parsed.caption !== 'string') {
    return { ok: true, caption: text.replace(/^```(?:json)?|```$/g, '').trim(), hashtags: [], alt_text: '' }
  }
  const hashtags = Array.isArray(parsed.hashtags)
    ? parsed.hashtags.map((h: unknown) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 10)
    : []
  return { ok: true, caption: parsed.caption.trim(), hashtags, alt_text: String(parsed.alt_text || '') }
}

export async function managerIds(sb: any, companyId: number): Promise<number[]> {
  const { data } = await sb.from('employees').select('id, user_role, role, is_admin, is_developer')
    .eq('company_id', companyId).eq('active', true)
  const senior = new Set(['Manager', 'Admin', 'Super Admin', 'Owner', 'Developer'])
  return (data || [])
    .filter((e: any) => senior.has(e.user_role) || e.is_admin === true || (senior.has(e.role) && e.role !== 'Manager'))
    .map((e: any) => e.id)
}

export async function notifyManagers(sb: any, companyId: number, n: {
  type: string; title: string; message?: string; route?: string; dedupe_key?: string; metadata?: Record<string, unknown>
}) {
  let ids = await managerIds(sb, companyId)
  // The dedupe index is partial (dedupe_key IS NOT NULL), which ON CONFLICT
  // cannot infer through PostgREST, so dedupe by hand.
  if (ids.length && n.dedupe_key) {
    const { data: had } = await sb.from('employee_notifications').select('employee_id')
      .eq('company_id', companyId).eq('dedupe_key', n.dedupe_key).in('employee_id', ids)
    const seen = new Set((had || []).map((r: any) => r.employee_id))
    ids = ids.filter((id) => !seen.has(id))
  }
  if (ids.length) {
    await sb.from('employee_notifications').insert(
      ids.map((employee_id) => ({
        company_id: companyId, employee_id, type: n.type, title: n.title, message: n.message || null,
        route: n.route || '/marketing', metadata: n.metadata || {}, dedupe_key: n.dedupe_key || null,
      })),
    )
  }
  await sb.from('company_notifications').insert({
    company_id: companyId, type: n.type, title: n.title, message: n.message || null, metadata: { route: n.route || '/marketing', ...(n.metadata || {}) },
  })
}
