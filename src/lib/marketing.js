// Marketing: the rules shared by the Marketing page, Field Scout's "Share to
// Marketing" button, and the marketing-draft / marketing-publish functions.
//
// Everything in here is pure so it can be unit-tested. The page and the
// functions call these; they do not each hold their own copy of "what a
// brand kit looks like" or "which platforms need a photo".

export const BRAND_KIT_KEY = 'marketing_brand_kit'
export const PUBLISHER_KEY = 'marketing_publisher'
export const MEDIA_BUCKET = 'marketing-media'

// Upload-Post platform ids and what each one needs. `needsMedia` platforms
// refuse a text-only post; `videoOnly` refuses a photo.
export const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',        maxChars: 63206, needsMedia: false },
  { id: 'instagram', label: 'Instagram',       maxChars: 2200,  needsMedia: true },
  { id: 'google_business', label: 'Google Business', maxChars: 1500,  needsMedia: false },
  { id: 'linkedin',  label: 'LinkedIn',        maxChars: 3000,  needsMedia: false },
  { id: 'x',         label: 'X (Twitter)',     maxChars: 280,   needsMedia: false },
  { id: 'threads',   label: 'Threads',         maxChars: 500,   needsMedia: false },
  { id: 'tiktok',    label: 'TikTok',          maxChars: 2200,  needsMedia: true, videoOnly: true },
  { id: 'youtube',   label: 'YouTube',         maxChars: 5000,  needsMedia: true, videoOnly: true },
  { id: 'pinterest', label: 'Pinterest',       maxChars: 500,   needsMedia: true },
  { id: 'bluesky',   label: 'Bluesky',         maxChars: 300,   needsMedia: false },
]
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]))

export const POST_STATUSES = ['draft', 'approved', 'scheduled', 'posted', 'failed', 'archived']

export function emptyBrandKit() {
  return {
    company_name: '',
    tagline: '',
    audience: '',
    voice: '',            // one paragraph: how we sound
    tone_words: [],       // ["friendly", "expert", "plain-spoken"]
    values: [],           // from EOS core values
    uniques: [],          // from EOS three uniques
    guarantee: '',
    services: [],         // what we post about
    service_area: '',
    do_say: [],
    dont_say: [],
    hashtags: [],
    cta: '',              // default call to action
    website: '',
    phone: '',
    logo_url: '',
    primary_color: '',
    derived_from_eos_at: null,
    updated_at: null,
  }
}

const clean = (s) => (typeof s === 'string' ? s.trim() : '')
const cleanList = (xs) => (Array.isArray(xs) ? xs.map(clean).filter(Boolean) : [])

// Turn the company's EOS answers into a first-draft brand kit. Anything the
// user already typed into the kit wins; EOS only fills blanks. That way the
// "Re-derive from EOS" button never stomps on an edit.
export function deriveBrandKitFromEos({ eos = {}, company = {}, existing = null } = {}) {
  const kit = { ...emptyBrandKit(), ...(existing || {}) }
  const values = (eos.core_values || []).map((v) => (typeof v === 'string' ? v : clean(v?.value))).filter(Boolean)
  const focus = eos.core_focus || {}
  const mk = eos.marketing || {}
  const uniques = cleanList(mk.three_uniques)

  const fill = (key, val) => {
    const cur = kit[key]
    const empty = Array.isArray(cur) ? cur.length === 0 : !clean(cur)
    const has = Array.isArray(val) ? val.length > 0 : !!clean(val)
    if (empty && has) kit[key] = val
  }

  fill('company_name', clean(company.company_name))
  fill('website', clean(company.website))
  fill('phone', clean(company.phone))
  fill('logo_url', clean(company.logo_url))
  fill('primary_color', clean(company.primary_color))
  fill('service_area', [clean(company.city), clean(company.state)].filter(Boolean).join(', '))
  fill('values', values)
  fill('uniques', uniques)
  fill('guarantee', clean(mk.guarantee))
  fill('audience', clean(mk.target_market))
  fill('tagline', clean(focus.niche))
  if (!clean(kit.voice)) {
    const bits = []
    if (clean(focus.purpose)) bits.push(`We exist to ${clean(focus.purpose).replace(/^to\s+/i, '')}.`)
    if (values.length) bits.push(`We sound ${values.slice(0, 4).map((v) => v.toLowerCase()).join(', ')}.`)
    if (uniques.length) bits.push(`What sets us apart: ${uniques.join('; ')}.`)
    if (bits.length) kit.voice = bits.join(' ')
  }
  if (kit.tone_words.length === 0 && values.length) {
    kit.tone_words = values.slice(0, 4).map((v) => v.toLowerCase())
  }
  kit.derived_from_eos_at = new Date().toISOString()
  return kit
}

// The three things the walkthrough on the Marketing page asks for, in order.
// Nothing here is hidden in Settings: the page itself shows what is missing.
export function setupProgress({ brandKit, publisher, posts = [] } = {}) {
  const ayrshare = publisher
  const kit = brandKit || {}
  const brandDone = !!(clean(kit.voice) && (clean(kit.audience) || (kit.services || []).length))
  // The company is connected once it has its own publisher profile (Upload-Post
  // user profile, made on first Connect) AND at least one network linked.
  const keyDone = !!clean(ayrshare?.profile_username)
  const accounts = Array.isArray(ayrshare?.accounts) ? ayrshare.accounts : []
  const channelsDone = keyDone && accounts.length > 0
  const firstPostDone = posts.some((p) => p.status === 'posted' || p.status === 'scheduled')
  const steps = [
    { id: 'brand', label: 'Brand & messaging', done: brandDone },
    { id: 'channels', label: 'Connect social accounts', done: channelsDone },
    { id: 'first_post', label: 'Publish your first post', done: firstPostDone },
  ]
  return { steps, done: steps.filter((s) => s.done).length, total: steps.length, complete: steps.every((s) => s.done) }
}

// What the drafter learns from. Approved captions show the voice; edit pairs
// (the AI's draft beside what the human changed it to) show the corrections.
// Newest first, capped, and a post whose caption equals its draft is not an
// "edit" — it is an approval.
export function styleExamples(posts = [], { maxApproved = 20, maxEdits = 10 } = {}) {
  const usable = posts
    .filter((p) => p && ['approved', 'scheduled', 'posted'].includes(p.status) && clean(p.caption))
    .sort((a, b) => new Date(b.approved_at || b.created_at || 0) - new Date(a.approved_at || a.created_at || 0))
  const approved = usable.slice(0, maxApproved).map((p) => p.caption.trim())
  const edits = usable
    .filter((p) => clean(p.ai_draft) && p.ai_draft.trim() !== p.caption.trim())
    .slice(0, maxEdits)
    .map((p) => ({ before: p.ai_draft.trim(), after: p.caption.trim() }))
  return { approved, edits }
}

// Which selected platforms this post cannot go to, and why.
export function platformProblems({ platforms = [], caption = '', mediaUrls = [], mediaType = 'image' } = {}) {
  const out = []
  const text = caption || ''
  for (const id of platforms) {
    const p = PLATFORM_BY_ID[id]
    if (!p) { out.push({ platform: id, reason: 'Unknown platform' }); continue }
    if (p.needsMedia && mediaUrls.length === 0) out.push({ platform: id, reason: `${p.label} needs a photo or video` })
    else if (p.videoOnly && mediaType !== 'video') out.push({ platform: id, reason: `${p.label} takes video only` })
    if (text.length > p.maxChars) out.push({ platform: id, reason: `${p.label} allows ${p.maxChars} characters, this is ${text.length}` })
  }
  return out
}

// Caption + hashtags as one string. Hashtags are stored separately so an
// edit to the words never loses the tags and vice versa.
export function composeCaption(caption = '', hashtags = []) {
  const tags = cleanList(hashtags).map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`))
  const body = (caption || '').trim()
  if (!tags.length) return body
  return body ? `${body}\n\n${tags.join(' ')}` : tags.join(' ')
}

// The fields marketing-publish sends to Upload-Post (upload_photos / upload_text).
// One caption for every network; photos go by public URL; scheduled_date is
// UTC ISO and only set when the time is still in the future.
export function buildPublishPayload(post) {
  const body = {
    title: composeCaption(post.caption, post.hashtags),
    platforms: [...(post.platforms || [])],
  }
  const media = (post.media_urls || []).filter(Boolean)
  if (media.length) body.photos = media
  if (post.scheduled_for) {
    const d = new Date(post.scheduled_for)
    if (!isNaN(d.getTime()) && d.getTime() > Date.now()) body.scheduled_date = d.toISOString()
  }
  return body
}

// Storage path for a capture: <company>/<yyyy-mm>/<ts>_<name>. The first
// folder is the company id because the bucket policy checks it.
export function capturePath(companyId, fileName, now = new Date()) {
  const safe = (fileName || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return `${companyId}/${ym}/${now.getTime()}_${safe}`
}

// ── Brands ────────────────────────────────────────────────────────────
// One company can market several things with different voices and
// accounts (HHH: cleaning, lighting, and JobScout itself). A brand is its
// own list entry, not a business unit; it MAY name the unit whose finished
// jobs feed it. The default brand (id '') is what a single-brand company
// uses without ever seeing the word "brand".

export const BRANDS_KEY = 'marketing_brands'
export const DEFAULT_BRAND = { id: '', name: '', unit: null, logo_url: '' }

export function slugify(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

// A brand-scoped settings key. '' (default brand) keeps the bare key, so
// everything a single-brand company already saved keeps working.
export function brandKey(base, brandId) {
  return brandId ? `${base}:${brandId}` : base
}

// The publisher profile a brand owns at the vendor. The default brand keeps
// the historical name; others append their id.
export function brandProfileUsername(companyId, brandId) {
  return brandId ? `jobscout-${companyId}-${brandId}` : `jobscout-${companyId}`
}

// Normalise the setting into a list. No list, or an empty one, means the
// company has one brand: the default, shown under the company's name.
export function brandsFrom(setting, company = {}) {
  const raw = Array.isArray(setting) ? setting : []
  const list = raw
    .filter((b) => b && (b.name || b.id))
    .map((b) => ({ id: b.id || slugify(b.name), name: b.name || b.id, unit: b.unit || null, logo_url: b.logo_url || '' }))
    .filter((b) => b.id)
  if (list.length) return list
  return [{ ...DEFAULT_BRAND, name: company.company_name || 'Company', logo_url: company.logo_url || '' }]
}

// Which brand a job's business unit feeds. One brand: always that one.
// Several: the one that names the unit, else null (a human decides).
export function brandForUnit(brands, unit) {
  if (!brands?.length) return null
  if (brands.length === 1) return brands[0].id
  const u = String(unit || '').trim().toLowerCase()
  if (!u) return null
  const hit = brands.find((b) => String(b.unit || '').trim().toLowerCase() === u)
  return hit ? hit.id : null
}

// ── Calendar & cadence ────────────────────────────────────────────────
// The calendar is the month as a grid of days; a post lands on the day it
// went out (posted_at), is due to (scheduled_for), or was written
// (created_at) while it is still a draft. Cadence is a per-brand target of
// posts per week; the calendar and the queue say how this week is going.

const dayKey = (d) => {
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function postDay(post) {
  if (!post) return null
  if (post.status === 'posted' && post.posted_at) return dayKey(post.posted_at)
  if (post.scheduled_for) return dayKey(post.scheduled_for)
  return dayKey(post.created_at)
}

export function postsByDay(posts = []) {
  const out = {}
  for (const p of posts) {
    const k = postDay(p)
    if (!k) continue
    ;(out[k] ||= []).push(p)
  }
  return out
}

// Monday-start week containing `date`, as local day keys.
export function weekOf(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // Mon = 0
  d.setDate(d.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return dayKey(x) })
}

// How this week is going against the target. "Counted" = posted or
// scheduled; drafts do not count until someone approves them.
export function weekProgress(posts = [], target = 0, date = new Date()) {
  const days = new Set(weekOf(date))
  const counted = posts.filter((p) => ['posted', 'scheduled'].includes(p.status) && days.has(postDay(p))).length
  const drafts = posts.filter((p) => ['draft', 'approved'].includes(p.status) && days.has(postDay(p))).length
  const t = Math.max(0, Number(target) || 0)
  return { counted, drafts, target: t, remaining: t ? Math.max(0, t - counted) : 0, met: t ? counted >= t : true }
}

// Grid cells for a month view: leading blanks so the 1st sits under its
// weekday (Monday first), then every day, as { key, day } or null.
export function monthGrid(year, month /* 0-11 */) {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  const cells = Array.from({ length: lead }, () => null)
  for (let d = 1; d <= days; d++) cells.push({ key: dayKey(new Date(year, month, d)), day: d })
  while (cells.length % 7) cells.push(null)
  return cells
}
