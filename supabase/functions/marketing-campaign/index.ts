// marketing-campaign: ONE object, a campaign — who, what, and where results
// land (MARKETING_REVIEW.md §3, week one: email only).
//
// Deployed with verify_jwt=false because three callers have no JWT:
//   • the 15-minute tick from pg_cron  {tick:true} + x-internal-key (Vault)
//   • a recipient pressing Unsubscribe  GET ?u=<member token> → a page
//   • a mail client's one-click unsubscribe  POST ?u=<token> (RFC 8058)
// A person's token is therefore verified here (resolveCaller verify:true).
//
// Actions for a signed-in Manager+ (JSON POST):
//   preview_audience {audience}            → {count, sample[], skipped:{no_email, suppressed}}
//   write {campaign, index}                → {subject, body}   Claude writes that touch
//   start {campaign_id}                    → members materialised, status running
//   pause | resume {campaign_id}
//   test {campaign_id, index}              → that touch, to the caller, merged with a sample
//
// What every send carries, by law and by decency: the company's name and
// address in the footer, an unsubscribe link, List-Unsubscribe headers,
// a reply-to that lands the answer on the Lead Setter board, and a check
// against email_suppressions. Quiet hours (8–19 in the company's zone) and
// a daily cap per company are enforced in the tick, not left to callers.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller, isServiceCaller } from '../_shared/auth.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { brandKey, brandsFrom } from '../_shared/marketing.ts'
import { campaignReplyAddress } from '../_shared/replyToken.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } })

const MAX_TOUCHES = 4
const DAILY_CAP = 300          // sends per company per rolling day
const QUIET_FROM = 8           // local hour sends begin
const QUIET_TO = 19            // local hour sends stop
const TICK_BATCH = 200
const FROM_ADDRESS = 'marketing@appsannex.com'

type Touch = { day: number; kind: string; subject: string; body: string }
type Audience = { kind?: string; ids?: number[]; status?: string; months?: number }
type Person = { lead_id: number | null; customer_id: number | null; email: string; name: string; company: string }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const lower = (s: unknown) => String(s || '').trim().toLowerCase()
const validEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
const parseJsonSetting = (v: unknown) => { if (v == null) return null; if (typeof v === 'object') return v as any; try { return JSON.parse(String(v)) } catch { return null } }

function mergeText(text: string, vars: { name?: string; company?: string; our_company?: string }) {
  const first = String(vars.name || '').trim().split(/\s+/)[0] || 'there'
  return String(text || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, String(vars.name || 'there'))
    .replace(/\{\{\s*company\s*\}\}/gi, String(vars.company || 'your company'))
    .replace(/\{\{\s*our_company\s*\}\}/gi, String(vars.our_company || 'us'))
}

/** Plain text → paragraphs; the person wrote prose, not HTML. */
function textToHtml(text: string) {
  return String(text || '').split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
}

function emailHtml(opts: { body: string; signature: string; footer: string; unsubscribeUrl: string }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2c3530;font-size:15px;line-height:1.5">
  ${textToHtml(opts.body)}
  <p style="margin:18px 0 0;white-space:pre-line">${esc(opts.signature)}</p>
  <hr style="border:none;border-top:1px solid #d6cdb8;margin:28px 0 12px">
  <p style="font-size:12px;color:#7d8a7f;margin:0">${esc(opts.footer)}<br>
  <a href="${opts.unsubscribeUrl}" style="color:#7d8a7f">Unsubscribe</a> and you will not hear from us again.</p>
</div>`
}

function localHour(tz: string | null | undefined, d = new Date()) {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz || 'America/Denver' }).format(d))
  } catch {
    return d.getUTCHours() - 6
  }
}

function randomToken() {
  const b = new Uint8Array(18)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// ── Company facts a send needs ─────────────────────────────────────────
async function companyFacts(sb: any, companyId: number, brandId: string | null) {
  const [{ data: co }, { data: rows }] = await Promise.all([
    sb.from('companies').select('company_name, address, city, state, zip, phone, website, timezone').eq('id', companyId).maybeSingle(),
    sb.from('settings').select('key, value').eq('company_id', companyId).in('key', ['marketing_brand_kit', brandKey('marketing_brand_kit', brandId), 'marketing_brands']),
  ])
  const setting = (k: string) => parseJsonSetting((rows || []).find((r: any) => r.key === k)?.value)
  const kit = setting(brandKey('marketing_brand_kit', brandId)) || setting('marketing_brand_kit') || {}
  const brands = brandsFrom(setting('marketing_brands'), co || {})
  const brand = brands.find((b) => b.id === (brandId || '')) || brands[0] || null
  const name = kit.company_name || brand?.name || co?.company_name || 'Our company'
  const addressLine = [co?.address, [co?.city, co?.state].filter(Boolean).join(', '), co?.zip].filter(Boolean).join(' · ')
  const footer = `${name}${addressLine ? ' · ' + addressLine : ''}${co?.phone ? ' · ' + co.phone : ''}`
  return { co, kit, brand, name, footer, timezone: co?.timezone || 'America/Denver' }
}

// ── Audiences → people ─────────────────────────────────────────────────
async function resolveAudience(sb: any, companyId: number, a: Audience): Promise<Person[]> {
  const people: Person[] = []
  const leadRows = (rows: any[]) => rows.map((l) => ({ lead_id: l.id, customer_id: null, email: lower(l.email), name: l.customer_name || l.business_name || '', company: l.business_name || '' }))
  if (a.kind === 'leads') {
    const ids = (a.ids || []).map(Number).filter(Boolean).slice(0, 2000)
    if (!ids.length) return []
    const { data } = await sb.from('leads').select('id, email, customer_name, business_name').eq('company_id', companyId).in('id', ids)
    people.push(...leadRows(data || []))
  } else if (a.kind === 'prospects') {
    const { data } = await sb.from('leads').select('id, email, customer_name, business_name').eq('company_id', companyId)
      .eq('lead_source', 'AI Prospect Research').in('status', ['New', 'Assigned', 'Contacted', 'Callback']).limit(2000)
    people.push(...leadRows(data || []))
  } else if (a.kind === 'lead_status') {
    const { data } = await sb.from('leads').select('id, email, customer_name, business_name').eq('company_id', companyId).eq('status', String(a.status || 'New')).limit(2000)
    people.push(...leadRows(data || []))
  } else if (a.kind === 'customers') {
    const { data } = await sb.from('customers').select('id, email, name, business_name').eq('company_id', companyId).eq('marketing_opt_in', true).limit(5000)
    let rows = data || []
    if (a.months && Number(a.months) > 0) {
      const since = new Date(Date.now() - Number(a.months) * 30 * 86400000).toISOString()
      const { data: recent } = await sb.from('jobs').select('customer_id').eq('company_id', companyId).gte('created_at', since).not('customer_id', 'is', null).limit(10000)
      const busy = new Set((recent || []).map((j: any) => j.customer_id))
      rows = rows.filter((c: any) => !busy.has(c.id))
    }
    people.push(...rows.map((c: any) => ({ lead_id: null, customer_id: c.id, email: lower(c.email), name: c.name || c.business_name || '', company: c.business_name || '' })))
  }
  return people
}

async function suppressedSet(sb: any, companyId: number): Promise<Set<string>> {
  const { data } = await sb.from('email_suppressions').select('email').eq('company_id', companyId).limit(20000)
  return new Set((data || []).map((r: any) => lower(r.email)))
}

/** The audience as it would be sent to: valid email, not suppressed, one row per address. */
async function sendablePeople(sb: any, companyId: number, a: Audience) {
  const all = await resolveAudience(sb, companyId, a)
  const sup = await suppressedSet(sb, companyId)
  const seen = new Set<string>()
  const keep: Person[] = []
  let noEmail = 0, suppressed = 0
  for (const p of all) {
    if (!p.email || !validEmail(p.email)) { noEmail += 1; continue }
    if (sup.has(p.email)) { suppressed += 1; continue }
    if (seen.has(p.email)) continue
    seen.add(p.email)
    keep.push(p)
  }
  return { people: keep, skipped: { no_email: noEmail, suppressed } }
}

// ── Sending ────────────────────────────────────────────────────────────
async function sendOne(env: { url: string; key: string; resend: string; replySecret: string; inboundDomain: string }, facts: Awaited<ReturnType<typeof companyFacts>>, member: any, touch: Touch, campaignId: number) {
  const vars = { name: member.name || '', company: (member as any).company || '', our_company: facts.name }
  const subject = mergeText(touch.subject, vars).slice(0, 200)
  const body = mergeText(touch.body, vars)
  const unsubscribeUrl = `${env.url}/functions/v1/marketing-campaign?u=${encodeURIComponent(member.token)}`
  const signature = facts.kit.signature || `${facts.name}${facts.co?.phone ? '\n' + facts.co.phone : ''}${facts.co?.website ? '\n' + facts.co.website : ''}`
  const payload: Record<string, unknown> = {
    from: `${facts.name.replace(/[<>"]/g, '')} <${FROM_ADDRESS}>`,
    to: [member.email],
    subject,
    html: emailHtml({ body, signature, footer: facts.footer, unsubscribeUrl }),
    text: `${body}\n\n${signature}\n\n${facts.footer}\nUnsubscribe: ${unsubscribeUrl}`,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'campaign', value: String(campaignId) }],
  }
  // A test send has no member row (id 0): replies to it come back to the sender's own address instead.
  if (env.replySecret && Number(member.id) > 0) payload.reply_to = await campaignReplyAddress(member.id, env.replySecret, env.inboundDomain)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.resend}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false as const, status: r.status, error: String(data?.message || data?.error || r.status).slice(0, 200) }
  return { ok: true as const, id: String(data?.id || '') }
}

async function runTick(sb: any, env: { url: string; key: string; resend: string; replySecret: string; inboundDomain: string }) {
  const now = new Date()
  const { data: due } = await sb.from('campaign_members')
    .select('id, company_id, campaign_id, lead_id, customer_id, email, name, token, touch_index, state')
    .in('state', ['queued', 'sent']).lte('next_at', now.toISOString()).order('next_at', { ascending: true }).limit(TICK_BATCH)
  const out = { due: (due || []).length, sent: 0, skipped: 0, failed: 0, done: 0 }
  if (!due?.length) return out

  const campaignIds = [...new Set(due.map((m: any) => m.campaign_id))]
  const { data: camps } = await sb.from('marketing_campaigns').select('id, company_id, brand, name, touches, status, stop_on_reply').in('id', campaignIds)
  const campById = new Map((camps || []).map((c: any) => [c.id, c]))
  const factsByKey = new Map<string, Awaited<ReturnType<typeof companyFacts>>>()
  const sentToday = new Map<number, number>()
  const dayAgo = new Date(Date.now() - 86400000).toISOString()
  for (const companyId of new Set(due.map((m: any) => m.company_id))) {
    const { count } = await sb.from('campaign_events').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('kind', 'sent').gte('at', dayAgo)
    sentToday.set(companyId, Number(count) || 0)
  }
  const supByCo = new Map<number, Set<string>>()

  for (const m of due) {
    const camp = campById.get(m.campaign_id)
    if (!camp || camp.status !== 'running') { out.skipped += 1; continue }
    const touches: Touch[] = Array.isArray(camp.touches) ? camp.touches : []
    const touch = touches[m.touch_index]
    if (!touch) { await sb.from('campaign_members').update({ state: 'done', next_at: null }).eq('id', m.id); out.done += 1; continue }
    if (touch.kind !== 'email') { // week two: text and call touches
      const next = touches[m.touch_index + 1]
      await sb.from('campaign_members').update(next ? { touch_index: m.touch_index + 1, next_at: new Date(now.getTime() + Math.max(0, Number(next.day) - Number(touch.day)) * 86400000).toISOString() } : { state: 'done', next_at: null }).eq('id', m.id)
      out.skipped += 1; continue
    }
    const key = `${m.company_id}:${camp.brand || ''}`
    if (!factsByKey.has(key)) factsByKey.set(key, await companyFacts(sb, m.company_id, camp.brand || null))
    const facts = factsByKey.get(key)!
    const hour = localHour(facts.timezone, now)
    if (hour < QUIET_FROM || hour >= QUIET_TO) { out.skipped += 1; continue }           // leave for a later tick
    if ((sentToday.get(m.company_id) || 0) >= DAILY_CAP) { out.skipped += 1; continue }
    if (!supByCo.has(m.company_id)) supByCo.set(m.company_id, await suppressedSet(sb, m.company_id))
    if (supByCo.get(m.company_id)!.has(lower(m.email))) {
      await sb.from('campaign_members').update({ state: 'unsubscribed', next_at: null, last_event_at: now.toISOString() }).eq('id', m.id)
      out.skipped += 1; continue
    }
    // Their business name for {{company}}: on the lead or customer row.
    let company = ''
    if (m.lead_id) { const { data: l } = await sb.from('leads').select('business_name').eq('id', m.lead_id).maybeSingle(); company = l?.business_name || '' }
    else if (m.customer_id) { const { data: c } = await sb.from('customers').select('business_name').eq('id', m.customer_id).maybeSingle(); company = c?.business_name || '' }

    const r = await sendOne(env, facts, { ...m, company }, touch, camp.id)
    if (!r.ok) {
      await sb.from('campaign_events').insert({ company_id: m.company_id, campaign_id: camp.id, member_id: m.id, kind: 'failed', touch_index: m.touch_index, meta: { error: r.error, status: r.status } })
      // An address Resend will not take is not coming back; everything else retries next tick.
      if (r.status === 422 || /invalid|not a valid/i.test(r.error)) {
        await sb.from('campaign_members').update({ state: 'bounced', next_at: null, last_event_at: now.toISOString() }).eq('id', m.id)
        await sb.from('email_suppressions').upsert({ company_id: m.company_id, email: lower(m.email), reason: 'bounced', source: 'resend-refused' }, { onConflict: 'company_id,email', ignoreDuplicates: true })
      } else {
        await sb.from('campaign_members').update({ next_at: new Date(now.getTime() + 3600000).toISOString() }).eq('id', m.id)
      }
      out.failed += 1; continue
    }
    sentToday.set(m.company_id, (sentToday.get(m.company_id) || 0) + 1)
    await sb.from('campaign_events').insert({ company_id: m.company_id, campaign_id: camp.id, member_id: m.id, kind: 'sent', touch_index: m.touch_index, resend_id: r.id || null, meta: { subject: touch.subject } })
    const next = touches[m.touch_index + 1]
    const patch: Record<string, unknown> = { last_event_at: now.toISOString(), touch_index: m.touch_index + 1 }
    if (next) { patch.state = 'sent'; patch.next_at = new Date(now.getTime() + Math.max(1, Number(next.day) - Number(touch.day)) * 86400000).toISOString() }
    else { patch.state = 'done'; patch.next_at = null; out.done += 1 }
    await sb.from('campaign_members').update(patch).eq('id', m.id)
    if (m.lead_id) {
      const { data: l } = await sb.from('leads').select('contact_attempts').eq('id', m.lead_id).maybeSingle()
      await sb.from('leads').update({ last_contact_at: now.toISOString(), contact_attempts: (Number(l?.contact_attempts) || 0) + 1 }).eq('id', m.lead_id)
    }
    out.sent += 1
  }
  return out
}

// ── Unsubscribe ────────────────────────────────────────────────────────
async function unsubscribe(sb: any, token: string) {
  const { data: m } = await sb.from('campaign_members').select('id, company_id, campaign_id, email, state').eq('token', token).maybeSingle()
  if (!m) return false
  await sb.from('email_suppressions').upsert({ company_id: m.company_id, email: lower(m.email), reason: 'unsubscribed', source: 'campaign' }, { onConflict: 'company_id,email', ignoreDuplicates: true })
  if (m.state !== 'unsubscribed') {
    await sb.from('campaign_members').update({ state: 'unsubscribed', next_at: null, last_event_at: new Date().toISOString() }).eq('id', m.id)
    await sb.from('campaign_events').insert({ company_id: m.company_id, campaign_id: m.campaign_id, member_id: m.id, kind: 'unsubscribed' })
  }
  // Every other campaign this address sits in stops too.
  await sb.from('campaign_members').update({ state: 'unsubscribed', next_at: null }).eq('company_id', m.company_id).eq('email', m.email).in('state', ['queued', 'sent'])
  return true
}

const unsubscribePage = (ok: boolean) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Unsubscribed' : 'Link not recognised'}</title></head>
<body style="margin:0;background:#f7f5ef;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2c3530">
<div style="max-width:480px;margin:60px auto;background:#fff;border:1px solid #d6cdb8;border-radius:12px;padding:28px;text-align:center">
<h1 style="font-size:20px;margin:0 0 10px">${ok ? "You're unsubscribed." : 'That link is not one of ours.'}</h1>
<p style="margin:0;color:#4d5a52">${ok ? 'You will not get any more emails from this company. Sorry for the noise.' : 'Nothing was changed. If you want to stop emails from a company, reply to the email you received and say so.'}</p>
</div></body></html>`

// ── Writing a touch ────────────────────────────────────────────────────
async function writeTouch(sb: any, req: Request, companyId: number, campaign: any, index: number) {
  const facts = await companyFacts(sb, companyId, campaign.brand || null)
  const touches: Touch[] = Array.isArray(campaign.touches) ? campaign.touches : []
  const touch = touches[index] || { day: 0, kind: 'email', subject: '', body: '' }
  const kit = facts.kit
  const aud: Audience = campaign.audience || {}
  const who = aud.kind === 'customers' ? (aud.months ? `past customers who have not had a job in ${aud.months} months` : 'past customers who said yes to marketing')
    : aud.kind === 'prospects' ? 'business owners Prospect Scout found who have never heard from us'
    : aud.kind === 'lead_status' ? `leads currently marked "${aud.status || 'New'}"` : 'people the marketer picked by hand'
  const others = touches.map((t, i) => (i === index ? null : `Touch ${i + 1} (day ${t.day}): ${t.subject || '(no subject yet)'}\n${(t.body || '').slice(0, 400)}`)).filter(Boolean).join('\n\n')
  const system = [
    `You write short, plain, human emails for ${facts.name}, a local service business. They are read on a phone by a busy owner or homeowner.`,
    kit.tagline ? `What they do: ${kit.tagline}` : '', kit.service_area ? `Service area: ${kit.service_area}` : '', kit.voice ? `Voice: ${kit.voice}` : '',
    (kit.tone_words || []).length ? `Tone: ${kit.tone_words.join(', ')}` : '', (kit.uniques || []).length ? `What sets them apart: ${kit.uniques.join('; ')}` : '',
    kit.avoid ? `Never say: ${kit.avoid}` : '',
    `Rules: under 120 words. One idea. One clear next step (reply, or a call). No hype, no exclamation marks, no "I hope this finds you well", no emoji. Use {{first_name}} once at the start and {{company}} only if it reads naturally; {{our_company}} is our name. No subject line tricks (no RE:, no FWD:). Do not mention price unless the campaign says to. Do not invent facts about the reader.`,
    `Reply with JSON only: {"subject": "...", "body": "..."} — body is plain text with blank lines between paragraphs, no signature (one is added).`,
  ].filter(Boolean).join('\n')
  const content = [
    `Campaign: ${campaign.name || '(unnamed)'}`, `Audience: ${who}`, `This is touch ${index + 1} of ${Math.max(touches.length, index + 1)}, sent on day ${touch.day}.`,
    index > 0 ? 'It follows earlier touches; a follow-up is shorter, references that we wrote before, and does not repeat the pitch.' : 'It is the first thing they hear from us.',
    campaign.about ? `What the marketer wants said: ${campaign.about}` : '',
    touch.subject || touch.body ? `The marketer's current draft (improve it, keep its intent):\nSubject: ${touch.subject}\n${touch.body}` : '',
    others ? `The other touches, for continuity:\n${others}` : '',
  ].filter(Boolean).join('\n\n')
  const ai = await callAnthropic({ feature: 'marketing-campaign', companyId, req }, { model: 'claude-sonnet-4-6', max_tokens: 600, system, messages: [{ role: 'user', content }] })
  if (!ai.ok) return { ok: false, error: ai.friendly }
  const text = (ai.data?.content || []).map((c: any) => c.text || '').join('').trim()
  try {
    const m = text.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : null
    if (parsed?.subject && parsed?.body) return { ok: true, subject: String(parsed.subject).trim().slice(0, 150), body: String(parsed.body).trim() }
  } catch { /* fall through */ }
  return { ok: false, error: 'The writer did not come back with an email. Try once more.' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const env = {
    url: SUPABASE_URL, key: SERVICE_KEY,
    resend: Deno.env.get('RESEND_API_KEY') || '',
    replySecret: Deno.env.get('REPLY_TOKEN_SECRET') || '',
    inboundDomain: Deno.env.get('INBOUND_EMAIL_DOMAIN') || 'appsannex.com',
  }
  try {
    // ── Unsubscribe: a link in the email, or a mail client's one-click POST ──
    const u = new URL(req.url).searchParams.get('u')
    if (u) {
      const ok = await unsubscribe(sb, String(u).slice(0, 80))
      if (req.method === 'POST') return json({ ok })
      return html(unsubscribePage(ok), ok ? 200 : 404)
    }

    const body = await req.json().catch(() => ({}))

    // ── The tick ──
    if (body.tick === true) {
      const INTERNAL = Deno.env.get('MARKETING_INTERNAL_KEY') || ''
      const presented = (req.headers.get('x-internal-key') || '').trim()
      const ours = (!!INTERNAL && presented === INTERNAL) || await isServiceCaller(req, SUPABASE_URL, SERVICE_KEY)
      if (!ours) return json({ ok: false, error: 'Not for callers.' }, 403)
      if (!env.resend) return json({ ok: false, error: 'RESEND_API_KEY is not set.' }, 500)
      const out = await runTick(sb, env)
      return json({ ok: true, ...out })
    }

    // ── A person ──
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY, { verify: true })
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    if (caller.level < 2) return json({ ok: false, error: 'Only a Manager or above runs campaigns.' }, 403)
    const companyId = caller.companyId
    const action = String(body.action || '')

    const loadCampaign = async (id: unknown) => {
      const { data } = await sb.from('marketing_campaigns').select('*').eq('company_id', companyId).eq('id', Number(id)).maybeSingle()
      return data
    }

    if (action === 'preview_audience') {
      const { people, skipped } = await sendablePeople(sb, companyId, body.audience || {})
      return json({ ok: true, count: people.length, sample: people.slice(0, 5).map((p) => p.name || p.email), skipped })
    }

    if (action === 'write') {
      const campaign = body.campaign || {}
      const r = await writeTouch(sb, req, companyId, campaign, Math.max(0, Math.min(MAX_TOUCHES - 1, Number(body.index) || 0)))
      return json(r, r.ok ? 200 : 502)
    }

    if (action === 'start') {
      const c = await loadCampaign(body.campaign_id)
      if (!c) return json({ ok: false, error: 'No such campaign.' }, 404)
      const touches: Touch[] = Array.isArray(c.touches) ? c.touches : []
      if (!touches.length || touches.some((t) => !String(t.subject || '').trim() || !String(t.body || '').trim())) return json({ ok: false, error: 'Every touch needs a subject and a body before it can go out.' }, 400)
      if (!env.resend) return json({ ok: false, error: 'Email is not set up on the server (RESEND_API_KEY).' }, 500)
      const { count: have } = await sb.from('campaign_members').select('id', { count: 'exact', head: true }).eq('campaign_id', c.id)
      let added = 0, skipped = { no_email: 0, suppressed: 0 }
      if (!Number(have)) {
        const r = await sendablePeople(sb, companyId, c.audience || {})
        skipped = r.skipped
        if (!r.people.length) return json({ ok: false, error: 'Nobody in that audience has an email address we may write to.', skipped }, 400)
        const rows = r.people.map((p) => ({ company_id: companyId, campaign_id: c.id, lead_id: p.lead_id, customer_id: p.customer_id, email: p.email, name: p.name || null, token: randomToken(), touch_index: 0, next_at: new Date().toISOString(), state: 'queued' }))
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await sb.from('campaign_members').insert(rows.slice(i, i + 500))
          if (error) return json({ ok: false, error: error.message }, 500)
        }
        added = rows.length
      }
      await sb.from('marketing_campaigns').update({ status: 'running', started_at: c.started_at || new Date().toISOString() }).eq('id', c.id)
      return json({ ok: true, people: added || Number(have) || 0, skipped })
    }

    if (action === 'pause' || action === 'resume') {
      const c = await loadCampaign(body.campaign_id)
      if (!c) return json({ ok: false, error: 'No such campaign.' }, 404)
      await sb.from('marketing_campaigns').update({ status: action === 'pause' ? 'paused' : 'running' }).eq('id', c.id)
      return json({ ok: true, status: action === 'pause' ? 'paused' : 'running' })
    }

    if (action === 'test') {
      const c = body.campaign_id ? await loadCampaign(body.campaign_id) : body.campaign
      if (!c) return json({ ok: false, error: 'No such campaign.' }, 404)
      const touches: Touch[] = Array.isArray(c.touches) ? c.touches : []
      const index = Math.max(0, Math.min(touches.length - 1, Number(body.index) || 0))
      const touch = touches[index]
      if (!touch || !touch.subject || !touch.body) return json({ ok: false, error: 'That touch has nothing to send yet.' }, 400)
      if (!env.resend) return json({ ok: false, error: 'Email is not set up on the server (RESEND_API_KEY).' }, 500)
      const facts = await companyFacts(sb, companyId, c.brand || null)
      const r = await sendOne(env, facts, { id: 0, email: caller.email, name: 'Dana Sample', company: 'Sample Roofing', token: 'test' }, { ...touch, subject: `[Test] ${touch.subject}` }, Number(c.id) || 0)
      return json(r.ok ? { ok: true, to: caller.email } : { ok: false, error: r.error }, r.ok ? 200 : 502)
    }

    return json({ ok: false, error: `Unknown action "${action}"` }, 400)
  } catch (err) {
    console.error('[marketing-campaign]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Campaign failed' }, 500)
  }
})

