// Media AI metering and monthly caps — pictures (Gemini), music and
// narration (ElevenLabs), Arnie's voice (ElevenLabs).
//
// Why: every tenant's pictures drew from ONE Google prepaid balance, so when
// it hit zero pictures stopped for everyone (2026-10-06). Now each call is
// metered into ai_usage + the compute shadow ledger like Arnie and the
// drafters, so a tenant's media spend shows in their wallet, and a monthly
// cap per tenant stops one company draining the shared accounts.
//
// Units live in ai_usage.output_tokens: 1 per picture, seconds per track,
// characters per narration. est_cost_usd is OUR cost, from the estimates
// below (update them when the plans change).
//
// Caps: settings row `marketing_ai_limits` = { pictures, tracks,
// voice_chars, arnie_chars } per company; DEFAULT_CAPS otherwise; the
// platform company (companies.is_platform) is uncapped — it pays the bills.

export type MediaKind = 'picture' | 'track' | 'voice' | 'arnie_voice'

export const MEDIA_PRICES = {
  picture: 0.04,            // gemini-2.5-flash-image ≈ 1290 output tokens at $30/M
  music_per_second: 0.005,  // ElevenLabs Music on the Creator plan, about $0.30 a minute
  voice_per_char: 0.00018,  // ElevenLabs TTS on Creator: $22 for 121,000 characters
}

export const DEFAULT_CAPS: Record<MediaKind, number> = {
  picture: 60,          // pictures a month
  track: 20,            // composed tracks a month
  voice: 20000,         // narration characters a month (≈ 80 fifteen-second scripts)
  arnie_voice: 200000,  // Arnie speaking, characters a month (opted-in tenants only)
}

export const FEATURE: Record<MediaKind, string> = {
  picture: 'marketing-picture',
  track: 'marketing-music',
  voice: 'marketing-voice',
  arnie_voice: 'arnie-voice',
}
const SETTING_KEY: Record<MediaKind, string> = { picture: 'pictures', track: 'tracks', voice: 'voice_chars', arnie_voice: 'arnie_chars' }
export const UNIT: Record<MediaKind, string> = { picture: 'pictures', track: 'tracks', voice: 'characters', arnie_voice: 'characters' }

interface Env { supabaseUrl: string; serviceKey: string }
const headers = (e: Env) => ({ Authorization: `Bearer ${e.serviceKey}`, apikey: e.serviceKey, 'Content-Type': 'application/json' })

async function rest<T>(e: Env, path: string): Promise<T | null> {
  try {
    const r = await fetch(`${e.supabaseUrl}/rest/v1/${path}`, { headers: headers(e) })
    return r.ok ? await r.json() : null
  } catch { return null }
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** This month's successful usage for one kind: rows and units. */
export async function monthlyUsage(e: Env, companyId: number, kind: MediaKind): Promise<{ count: number; units: number }> {
  const rows = await rest<Array<{ output_tokens: number }>>(e,
    `ai_usage?select=output_tokens&company_id=eq.${companyId}&feature=eq.${FEATURE[kind]}&success=is.true&created_at=gte.${encodeURIComponent(monthStartIso())}&limit=5000`)
  const list = rows || []
  return { count: list.length, units: list.reduce((n, r) => n + (Number(r.output_tokens) || 0), 0) }
}

/** The cap for this company and kind; null means uncapped (platform company). */
export async function capFor(e: Env, companyId: number, kind: MediaKind): Promise<{ cap: number | null; source: 'platform' | 'setting' | 'default' }> {
  const [co, st] = await Promise.all([
    rest<Array<{ is_platform: boolean }>>(e, `companies?select=is_platform&id=eq.${companyId}&limit=1`),
    rest<Array<{ value: unknown }>>(e, `settings?select=value&company_id=eq.${companyId}&key=eq.marketing_ai_limits&limit=1`),
  ])
  if (co?.[0]?.is_platform === true) return { cap: null, source: 'platform' }
  let cfg: Record<string, unknown> = {}
  const raw = st?.[0]?.value
  if (raw && typeof raw === 'object') cfg = raw as Record<string, unknown>
  else if (typeof raw === 'string') { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
  const v = Number(cfg[SETTING_KEY[kind]])
  if (Number.isFinite(v) && v >= 0) return { cap: v, source: 'setting' }
  return { cap: DEFAULT_CAPS[kind], source: 'default' }
}

export interface CapCheck { allowed: boolean; used: number; cap: number | null; unit: string; wanted: number }

/** May this company spend `wanted` more units of `kind` this month? Pictures and tracks count rows; voices count characters. */
export async function checkCap(e: Env, companyId: number, kind: MediaKind, wanted = 1): Promise<CapCheck> {
  const [{ cap }, usage] = await Promise.all([capFor(e, companyId, kind), monthlyUsage(e, companyId, kind)])
  const used = kind === 'picture' || kind === 'track' ? usage.count : usage.units
  const allowed = cap == null || used + wanted <= cap
  return { allowed, used, cap, unit: UNIT[kind], wanted }
}

/** The sentence the marketer reads when the cap is hit. */
export function capMessage(c: CapCheck, kind: MediaKind): string {
  const what = kind === 'picture' ? 'AI pictures' : kind === 'track' ? 'composed tracks' : kind === 'voice' ? 'narration' : "Arnie's voice"
  const used = kind === 'voice' || kind === 'arnie_voice' ? `${c.used.toLocaleString()} of ${(c.cap ?? 0).toLocaleString()} characters` : `${c.used} of ${c.cap} ${c.unit}`
  return `This month's ${what} are used up (${used}). The limit resets on the 1st; the owner can raise it in settings (marketing_ai_limits).`
}

/** Meter one call into ai_usage and the compute shadow ledger. Never throws. */
export async function recordMediaUsage(e: Env, opts: { companyId: number; kind: MediaKind; model: string; units: number; costUsd: number; success?: boolean; errorKind?: string | null }): Promise<void> {
  try {
    const credits = Math.max(1, Math.ceil(opts.costUsd / 0.02))
    const post = (path: string, body: unknown) => fetch(`${e.supabaseUrl}/rest/v1/${path}`, { method: 'POST', headers: { ...headers(e), Prefer: 'return=minimal' }, body: JSON.stringify(body) })
    await Promise.all([
      post('ai_usage', { company_id: opts.companyId, feature: FEATURE[opts.kind], model: opts.model, output_tokens: Math.round(opts.units), est_cost_usd: Number(opts.costUsd.toFixed(6)), success: opts.success !== false, error_kind: opts.errorKind ?? null }),
      opts.success === false ? Promise.resolve() : post('compute_ledger', { company_id: opts.companyId, type: 'shadow', feature_slug: FEATURE[opts.kind], agent_slug: opts.kind === 'arnie_voice' ? 'arnie' : null, model: opts.model, input_tokens: 0, output_tokens: Math.round(opts.units), cache_read_tokens: 0, cost_usd: Number(opts.costUsd.toFixed(5)), credits, bucket: null }),
    ])
  } catch (err) {
    console.warn('[mediaMeter] log failed (non-fatal):', (err as Error)?.message)
  }
}
