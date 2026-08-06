// Shared Anthropic API wrapper for all edge functions.
//
// Why this exists: 16 functions made raw fetches to api.anthropic.com with
// copy-pasted error handling. When the shared account ran out of credits
// (June 9-10) every AI feature broke at once, raw `Anthropic 400: {...}`
// JSON surfaced to field techs, nothing was logged, and nobody was alerted
// until users filed tickets. This wrapper gives every call:
//   1. usage metering   -> ai_usage row per call (tokens + est cost, per
//                          company/feature) for cost control & future billing
//   2. error taxonomy   -> billing / auth / rate_limit / overloaded /
//                          invalid_request / other, with user-friendly text
//   3. admin alerting   -> billing/auth failures insert a feedback ticket +
//                          email Bryce, throttled via ai_alerts (6h window)
//
// Usage in a function:
//   import { callAnthropic } from '../_shared/anthropic.ts'
//   const ai = await callAnthropic({ feature: 'victor-verify', companyId }, requestBody)
//   if (!ai.ok) return json({ success: false, error: ai.friendly, ai_unavailable: ai.unavailable })
//   const data = ai.data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { recordComputeUsage } from './compute.ts'
import { agentFor } from './computeConfig.ts'
import { resolveCompanyId } from './auth.ts'

export interface AiMeta {
  feature: string
  companyId?: number | null
  // Pass the inbound Request when the call site has no company context — the
  // wrapper resolves company_id from the caller's JWT (see _shared/auth.ts),
  // attributing both ai_usage and the compute shadow ledger.
  req?: Request
}

export interface AiResult {
  ok: boolean
  status: number
  data?: any
  errorKind?: 'billing' | 'auth' | 'rate_limit' | 'overloaded' | 'invalid_request' | 'other'
  friendly?: string
  // true when the failure is OUR account/config problem (billing, bad key) —
  // callers should degrade gracefully (e.g. let a job complete without
  // verification) instead of blocking the user on something they can't fix.
  unavailable?: boolean
  raw?: string
}

// $ per million tokens — keep in sync with platform.claude.com/docs pricing.
// (cached 2026-06: Opus 4.x $5/$25, Sonnet 4.x $3/$15, Haiku 4.5 $1/$5)
const PRICES: Array<{ match: RegExp; inPerM: number; outPerM: number }> = [
  { match: /opus/i, inPerM: 5, outPerM: 25 },
  { match: /haiku/i, inPerM: 1, outPerM: 5 },
  { match: /sonnet/i, inPerM: 3, outPerM: 15 },
]
const DEFAULT_PRICE = { inPerM: 3, outPerM: 15 }

function estimateCost(model: string, usage: any): number {
  const p = PRICES.find((x) => x.match.test(model || '')) || DEFAULT_PRICE
  const input = Number(usage?.input_tokens) || 0
  const output = Number(usage?.output_tokens) || 0
  const cacheWrite = Number(usage?.cache_creation_input_tokens) || 0
  const cacheRead = Number(usage?.cache_read_input_tokens) || 0
  const cost =
    (input / 1e6) * p.inPerM +
    (output / 1e6) * p.outPerM +
    (cacheWrite / 1e6) * p.inPerM * 1.25 +
    (cacheRead / 1e6) * p.inPerM * 0.1
  return Math.round(cost * 1e6) / 1e6
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function classify(status: number, errType: string, message: string): AiResult['errorKind'] {
  const msg = (message || '').toLowerCase()
  if (errType === 'billing_error' || msg.includes('credit balance')) return 'billing'
  if (status === 401 || errType === 'authentication_error') return 'auth'
  if (status === 429 || errType === 'rate_limit_error') return 'rate_limit'
  if (status === 529 || errType === 'overloaded_error') return 'overloaded'
  if (status === 400 || errType === 'invalid_request_error') return 'invalid_request'
  return 'other'
}

const FRIENDLY: Record<NonNullable<AiResult['errorKind']>, string> = {
  billing:
    'The AI service is temporarily unavailable (account issue on our side — the admin has been notified). You can keep working; this feature will be back shortly.',
  auth:
    'The AI service is temporarily unavailable (configuration issue on our side — the admin has been notified). You can keep working; this feature will be back shortly.',
  rate_limit: 'The AI service is busy right now — wait a minute and try again.',
  overloaded: 'The AI service is busy right now — wait a minute and try again.',
  invalid_request: 'AI analysis failed. Try again, and report it via Feedback if it keeps happening.',
  other: 'AI analysis failed. Try again, and report it via Feedback if it keeps happening.',
}

const ALERT_THROTTLE_HOURS = 6
const ADMIN_EMAIL = 'bryce@hhh.services'

// Insert a feedback ticket + email the admin — at most once per kind per
// throttle window. Never throws (alerting must not break the caller).
async function alertAdmin(sb: any, kind: string, meta: AiMeta, message: string) {
  try {
    const since = new Date(Date.now() - ALERT_THROTTLE_HOURS * 3600_000).toISOString()
    const { data: recent } = await sb
      .from('ai_alerts')
      .select('id')
      .eq('kind', kind)
      .gte('created_at', since)
      .limit(1)
    if (recent && recent.length > 0) return
    await sb.from('ai_alerts').insert({ kind, detail: `${meta.feature}: ${message}`.slice(0, 500) })

    const subject = kind === 'billing' ? 'AI credits exhausted — features degraded' : 'AI API key problem — features degraded'
    const body =
      `Automatic alert from the AI wrapper.\n\n` +
      `The Anthropic API returned a ${kind} error from feature "${meta.feature}".\n` +
      `Error: ${message}\n\n` +
      (kind === 'billing'
        ? `Fix: add credits at console.anthropic.com -> Plans & Billing (and consider enabling auto-reload).\n`
        : `Fix: check ANTHROPIC_API_KEY in Supabase edge function secrets.\n`) +
      `All AI features degrade gracefully until then (Victor verification will not block job completion). ` +
      `This alert is throttled to once per ${ALERT_THROTTLE_HOURS}h.`

    await sb.from('feedback').insert({
      user_email: 'system@jobscout',
      page_url: '/admin/data-console',
      feedback_type: 'bug',
      subject,
      message: body,
      status: 'new',
    })

    // Best-effort email through the existing feedback-reply mailer.
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-feedback-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
      body: JSON.stringify({
        recipient_email: ADMIN_EMAIL,
        subject,
        original_message: `${meta.feature} -> ${kind}`,
        reply_message: body,
        feedback_type: 'bug',
      }),
    }).catch(() => {})
  } catch (e) {
    console.error('[anthropic] alertAdmin failed:', e)
  }
}

// Fire-and-forget usage logging — never throws.
async function logUsage(sb: any, meta: AiMeta, row: Record<string, unknown>) {
  try {
    await sb.from('ai_usage').insert({
      company_id: meta.companyId ?? null,
      feature: meta.feature,
      ...row,
    })
  } catch (e) {
    console.error('[anthropic] logUsage failed:', e)
  }
}

// Compute wallet Phase 0 shadow row (see COMPUTE_WALLET_PLAN.md) — what this
// call WOULD cost in credits. No-op when company is unknown; never throws.
async function logCompute(meta: AiMeta, model: string, usage: any) {
  await recordComputeUsage({
    supabaseUrl: Deno.env.get('SUPABASE_URL'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    companyId: meta.companyId,
    feature: meta.feature,
    agentSlug: agentFor(meta.feature),
    model,
    usage,
  })
}

// JWT-based company fallback for call sites that pass req instead of companyId.
async function withResolvedCompany(meta: AiMeta): Promise<AiMeta> {
  if (meta.companyId != null || !meta.req) return meta
  const companyId = await resolveCompanyId(
    meta.req,
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  )
  return { ...meta, companyId }
}

// For call sites that must keep their own fetch (e.g. SSE streaming in
// arnie-chat): classify + log + alert on a failed response without owning
// the request. Success-path usage logging is the caller's job (or skipped
// for streams). Returns the same error fields as callAnthropic.
export async function reportAnthropicFailure(
  meta: AiMeta,
  status: number,
  rawBody: string,
): Promise<Pick<AiResult, 'errorKind' | 'friendly' | 'unavailable'>> {
  const sb = adminClient()
  let errType = ''
  let errMsg = rawBody?.slice(0, 300) ?? 'unknown error'
  try {
    const parsed = JSON.parse(rawBody)
    errType = parsed?.error?.type ?? ''
    errMsg = parsed?.error?.message ?? errMsg
  } catch { /* keep raw */ }
  const kind = classify(status, errType, errMsg)
  const unavailable = kind === 'billing' || kind === 'auth'
  console.error(`[anthropic] ${meta.feature} -> ${kind} (${status}): ${errMsg}`)
  await logUsage(sb, meta, { success: false, error_kind: kind, status })
  if (unavailable) await alertAdmin(sb, kind!, meta, errMsg)
  return { errorKind: kind, friendly: FRIENDLY[kind!], unavailable }
}

// Log a successful call made outside callAnthropic (e.g. assembled from
// stream events). Fire-and-forget.
export async function logAnthropicSuccess(meta: AiMeta, model: string, usage: any) {
  const sb = adminClient()
  meta = await withResolvedCompany(meta)
  await logUsage(sb, meta, {
    model,
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    est_cost_usd: estimateCost(model, usage),
    success: true,
    status: 200,
  })
  await logCompute(meta, model, usage)
}

export async function callAnthropic(meta: AiMeta, body: Record<string, unknown>): Promise<AiResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const sb = adminClient()
  meta = await withResolvedCompany(meta)

  if (!apiKey) {
    await logUsage(sb, meta, { model: String(body?.model ?? ''), success: false, error_kind: 'auth', status: 0 })
    await alertAdmin(sb, 'auth', meta, 'ANTHROPIC_API_KEY is not set in edge function secrets')
    return { ok: false, status: 0, errorKind: 'auth', friendly: FRIENDLY.auth, unavailable: true }
  }

  let resp: Response
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })
  } catch (netErr) {
    await logUsage(sb, meta, { model: String(body?.model ?? ''), success: false, error_kind: 'other', status: 0 })
    return {
      ok: false,
      status: 0,
      errorKind: 'other',
      friendly: FRIENDLY.other,
      unavailable: false,
      raw: String((netErr as Error)?.message ?? netErr),
    }
  }

  let data: any = null
  let rawText = ''
  try {
    rawText = await resp.text()
    data = JSON.parse(rawText)
  } catch {
    /* non-JSON body — keep rawText */
  }

  if (resp.ok && data && !data.error) {
    const model = data.model ?? String(body?.model ?? '')
    await logUsage(sb, meta, {
      model,
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: data.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: data.usage?.cache_read_input_tokens ?? 0,
      est_cost_usd: estimateCost(model, data.usage),
      success: true,
      status: resp.status,
    })
    await logCompute(meta, model, data.usage)
    return { ok: true, status: resp.status, data }
  }

  const errType = data?.error?.type ?? ''
  const errMsg = data?.error?.message ?? rawText.slice(0, 300) ?? 'unknown error'
  const kind = classify(resp.status, errType, errMsg)
  const unavailable = kind === 'billing' || kind === 'auth'

  console.error(`[anthropic] ${meta.feature} -> ${kind} (${resp.status}): ${errMsg}`)
  await logUsage(sb, meta, {
    model: String(body?.model ?? ''),
    success: false,
    error_kind: kind,
    status: resp.status,
  })
  if (unavailable) await alertAdmin(sb, kind!, meta, errMsg)

  return { ok: false, status: resp.status, errorKind: kind, friendly: FRIENDLY[kind!], unavailable, raw: errMsg }
}
