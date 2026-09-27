// Sal's deterministic half: what is done to an opportunity BEFORE a model is
// asked anything, and the words the board uses for it afterwards.
//
// Pure functions, no I/O, unit-tested from src/lib/bidFit.test.js through the
// src/lib/bidFit.js shim, so the edge function that scores and the browser
// that renders agree on one definition (the sourcedPricing pattern).
//
// The prefilter exists so the model is only asked about rows worth asking
// about: outside the service area, an excluded keyword, a set-aside the
// company does not hold, a deadline inside the margin — those are decided
// here, with the reason written down, and cost nothing. The model then
// refines a score for what survives. Nothing here, and nothing downstream,
// sets a price (SAL_SCOUT_PLAN.md §2).

export type ServiceLine = {
  label?: string
  naics?: string[]
  commodity_codes?: string[]
  keywords?: string[]
  exclusions?: string[]
}
export type Profile = {
  service_lines?: ServiceLine[]
  service_area?: { states?: string[]; home?: { lat: number; lng: number } | null; radius_km?: number | null }
  value_min?: number | null
  value_max?: number | null
  set_asides?: string[]
  thresholds?: { auto_dismiss_below?: number; notify_at?: number; due_margin_hours?: number }
  capability_statement?: string | null
}
export type OppLike = {
  title?: string | null
  buyer?: string | null
  summary?: string | null
  solicitation_number?: string | null
  naics?: string[] | null
  commodity_codes?: string[] | null
  set_aside?: string | null
  place?: { state?: string | null; city?: string | null; address?: string | null; zip?: string | null } | null
  latitude?: number | null
  longitude?: number | null
  due_at?: string | null
  estimated_value_low?: number | null
  estimated_value_high?: number | null
}

export const DEFAULT_THRESHOLDS = { auto_dismiss_below: 30, notify_at: 70, due_margin_hours: 24 }

export const DISMISS_REASONS: { key: string; label: string }[] = [
  { key: 'too_far', label: 'Too far away' },
  { key: 'too_small', label: 'Too small' },
  { key: 'too_big', label: 'Too big for us' },
  { key: 'wrong_trade', label: 'Not our trade' },
  { key: 'bond', label: 'Bonding' },
  { key: 'license', label: 'License we do not hold' },
  { key: 'no_time', label: 'No time before the deadline' },
  { key: 'other', label: 'Other' },
]

export const STATUS_LABEL: Record<string, string> = {
  new: 'New', shortlisted: 'Shortlisted', dismissed: 'Dismissed', chosen: 'Chosen', building: 'Benny is building',
  ready: 'Bid ready', submitted: 'Submitted', won: 'Won', lost: 'Lost', no_award: 'No award', expired: 'Expired',
}

// ── text ────────────────────────────────────────────────────────────────────
export function normalizeText(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

// FNV-1a 64-bit as 16 hex chars. Deterministic across Deno and Node with no
// async crypto, which is what a dedupe key needs.
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n
  const P = 0x100000001b3n
  const M = 0xffffffffffffffffn
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i) & 0xff)
    h = (h * P) & M
  }
  return h.toString(16).padStart(16, '0')
}

/**
 * The key two feeds share when they describe the same solicitation.
 * A solicitation number is the buyer's own id and wins; without one, the
 * buyer + title + due DAY. An amendment carries the same number, so it
 * updates the row rather than making a second one.
 */
export function dedupeHash(o: OppLike): string {
  const num = normalizeText(o.solicitation_number).replace(/ /g, '')
  if (num.length >= 4) return 'n:' + fnv1a64(num)
  const day = o.due_at ? String(o.due_at).slice(0, 10) : ''
  return 't:' + fnv1a64(`${normalizeText(o.buyer)}|${normalizeText(o.title)}|${day}`)
}

// ── geography ───────────────────────────────────────────────────────────────
const KM_PER_DEG = 111
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return Math.hypot((a.lat - b.lat) * KM_PER_DEG, (a.lng - b.lng) * KM_PER_DEG * Math.cos(b.lat * Math.PI / 180))
}

// ── set-asides ──────────────────────────────────────────────────────────────
// What a notice says → the certification the bidder must hold. SAM.gov codes
// and the words portals print. Small-business set-asides need 'sb'; anything
// unrecognised is treated as open.
const SET_ASIDE_RULES: { test: RegExp; need: string; label: string }[] = [
  { test: /sdvosb|service[- ]disabled/i, need: 'sdvosb', label: 'Service-disabled veteran-owned' },
  { test: /\bvosb\b|veteran[- ]owned|\bvsa\b/i, need: 'vosb', label: 'Veteran-owned' },
  { test: /edwosb|economically disadvantaged women/i, need: 'edwosb', label: 'Economically disadvantaged women-owned' },
  { test: /\bwosb\b|women[- ]owned/i, need: 'wosb', label: 'Women-owned' },
  { test: /\b8\s?\(?a\)?\b|\b8an?\b/i, need: '8a', label: '8(a)' },
  { test: /hubzone|\bhzc\b|\bhzs\b/i, need: 'hubzone', label: 'HUBZone' },
  { test: /\bdbe\b|disadvantaged business/i, need: 'dbe', label: 'DBE' },
  { test: /\bmbe\b|minority[- ]owned/i, need: 'mbe', label: 'Minority-owned' },
  { test: /total small business|small business set[- ]aside|\bsba\b|\bsb\b/i, need: 'sb', label: 'Small business' },
]
export function setAsideRequirement(text: string | null | undefined): { need: string; label: string } | null {
  const s = String(text || '')
  if (!s.trim()) return null
  for (const r of SET_ASIDE_RULES) if (r.test.test(s)) return { need: r.need, label: r.label }
  return null
}

// ── the prefilter ───────────────────────────────────────────────────────────
export type Prefilter = {
  pass: boolean
  expired: boolean
  score: number           // 0–75; the model refines from here
  reasons: string[]
  blockers: string[]
  matched_line: string | null
}

export function prefilter(o: OppLike, p: Profile | null | undefined, now: Date = new Date()): Prefilter {
  const prof = p || {}
  const th = { ...DEFAULT_THRESHOLDS, ...(prof.thresholds || {}) }
  const reasons: string[] = []
  const blockers: string[] = []
  let score = 20
  let pass = true
  let expired = false

  // Deadline first: nothing else matters once it is inside the margin.
  if (o.due_at) {
    const due = new Date(o.due_at).getTime()
    if (Number.isFinite(due) && due - now.getTime() <= (th.due_margin_hours || 0) * 3600 * 1000) {
      expired = true
      pass = false
      reasons.push(due <= now.getTime() ? 'Past due' : `Due inside the ${th.due_margin_hours}-hour margin`)
    }
  }

  // Area: a state outside the list, or a place too far from home.
  const states = (prof.service_area?.states || []).map((s) => String(s).toUpperCase())
  const st = o.place?.state ? String(o.place.state).toUpperCase() : null
  if (states.length && st && !states.includes(st)) { pass = false; reasons.push(`Outside service area (${st})`) }
  const home = prof.service_area?.home
  const radius = Number(prof.service_area?.radius_km) || 0
  if (home && radius > 0 && o.latitude != null && o.longitude != null) {
    const km = kmBetween({ lat: Number(o.latitude), lng: Number(o.longitude) }, home)
    if (km > radius) { pass = false; reasons.push(`${Math.round(km)} km from home (limit ${radius})`) }
    else { score += 10; reasons.push(`${Math.round(km)} km from home`) }
  }

  // Set-aside: a certification the company does not hold is a hard block.
  const req = setAsideRequirement(o.set_aside)
  if (req) {
    const held = (prof.set_asides || []).map((x) => String(x).toLowerCase())
    if (!held.includes(req.need)) { pass = false; blockers.push(`${req.label} set-aside — not held`) }
    else reasons.push(`${req.label} set-aside — held`)
  }

  // Trade: codes and words, per service line; an exclusion anywhere rejects.
  const text = normalizeText(`${o.title} ${o.summary} ${o.buyer}`)
  const oNaics = (o.naics || []).map(String)
  const oCodes = (o.commodity_codes || []).map(String)
  let matched: string | null = null
  let codeHit = false, wordHit = false
  for (const line of prof.service_lines || []) {
    for (const ex of line.exclusions || []) {
      const e = normalizeText(ex)
      if (e && text.includes(e)) { pass = false; reasons.push(`Excluded: "${ex}"`) }
    }
    const naicsHit = (line.naics || []).some((n) => oNaics.some((x) => x.startsWith(String(n))))
    const codeHitHere = (line.commodity_codes || []).some((c) => oCodes.some((x) => x.startsWith(String(c))))
    const words = (line.keywords || []).map(normalizeText).filter(Boolean)
    const wordHitHere = words.some((w) => text.includes(w))
    if ((naicsHit || codeHitHere || wordHitHere) && !matched) matched = line.label || null
    codeHit = codeHit || naicsHit || codeHitHere
    wordHit = wordHit || wordHitHere
  }
  if (codeHit) { score += 25; reasons.push('Code match') }
  if (wordHit) { score += 20; reasons.push(matched ? `Reads like ${matched}` : 'Keyword match') }
  if ((prof.service_lines || []).length && !codeHit && !wordHit) reasons.push('No trade match yet')

  // Size band, only when the notice says a number.
  const lo = o.estimated_value_low != null ? Number(o.estimated_value_low) : null
  const hi = o.estimated_value_high != null ? Number(o.estimated_value_high) : null
  if (prof.value_min != null && hi != null && hi < Number(prof.value_min)) { pass = false; reasons.push('Below minimum job size') }
  if (prof.value_max != null && lo != null && lo > Number(prof.value_max)) { pass = false; reasons.push('Above maximum job size') }

  if (!pass && !expired) score = Math.min(score, 15)
  return { pass, expired, score: Math.max(0, Math.min(75, score)), reasons, blockers, matched_line: matched }
}

// ── the words the board uses ────────────────────────────────────────────────
export function countdown(due_at: string | null | undefined, now: Date = new Date()): { label: string; urgency: 'past' | 'red' | 'amber' | 'ok' | 'none'; ms: number } {
  if (!due_at) return { label: 'No deadline', urgency: 'none', ms: NaN }
  const ms = new Date(due_at).getTime() - now.getTime()
  if (!Number.isFinite(ms)) return { label: 'No deadline', urgency: 'none', ms: NaN }
  if (ms <= 0) return { label: 'Past due', urgency: 'past', ms }
  const h = Math.floor(ms / 3600000)
  const d = Math.floor(h / 24)
  const label = d >= 1 ? `Due in ${d}d ${h - d * 24}h` : `Due in ${h}h ${Math.floor((ms % 3600000) / 60000)}m`
  return { label, urgency: d < 3 ? 'red' : d < 7 ? 'amber' : 'ok', ms }
}

/** Final status from a score and the profile's thresholds. */
export function statusForScore(score: number | null | undefined, p: Profile | null | undefined, pre: Prefilter): 'new' | 'dismissed' | 'expired' {
  if (pre.expired) return 'expired'
  const th = { ...DEFAULT_THRESHOLDS, ...(p?.thresholds || {}) }
  if (!pre.pass) return 'dismissed'
  if (score != null && Number(score) < Number(th.auto_dismiss_below)) return 'dismissed'
  return 'new'
}

export function shouldNotify(score: number | null | undefined, p: Profile | null | undefined): boolean {
  const th = { ...DEFAULT_THRESHOLDS, ...(p?.thresholds || {}) }
  return score != null && Number(score) >= Number(th.notify_at)
}
