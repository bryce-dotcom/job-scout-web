// A personal follow-up on a quote that has gone quiet.
//
// The brief says "four quotes sitting cold for over a week, $107K". The
// automatic follow-up (estimate-followup) will not touch most of them on
// purpose: it only chases estimates sent after a per-company cutoff and
// only where it recorded a recipient, so the backlog is never spam-chased.
// What the backlog needs is a rep saying, in their own words, "wanted to
// check in on the 40-fixture retrofit." This is that, behind a card.
//
// The rail does not write prose. The model drafts the note as the rep
// would say it, from what the rep told Arnie; the server finds the quote,
// the recipient and the rep, shows all of it on the card, and sends
// nothing until the rep taps Send. Sending is the one thing on this rail
// that cannot be undone, and rollback says so instead of pretending.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import type { Prepared } from './arnieCreate.ts'

const H = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const usd = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const OPEN = ['Sent', 'Draft', 'Pending']

/** Find the quote the user means: a number, an estimate name, or the customer/lead it is for. */
export async function findQuote(r: Rest, companyId: number, said: string, filter?: string) {
  const term = String(said || '').replace(/[*,()]/g, ' ').trim()
  if (term.length < 3) return { error: 'Tell me which quote — a number, the estimate name, or who it is for.' }
  const sel = 'id,quote_id,estimate_name,quote_amount,status,sent_date,last_sent_at,sent_to_email,salesperson_id,lead_id,customer_id,portal_token,followup_count,service_type,job_title'
  const open = filter || `status=in.(${OPEN.join(',')})&approved_date=is.null&rejected_date=is.null`
  // One pass per distinctive word, on the quote itself and on who it is for,
  // ranked by how many words hit. Whole-phrase matching failed the first
  // live run: the model said "Halifax Flooring LED retrofit estimate" and
  // the estimate was named "Halifax Flooring — LED retrofit". A person says
  // extra words; the search has to survive them. Noise words are dropped.
  const NOISE = new Set(['quote', 'quotes', 'estimate', 'estimates', 'that', 'this', 'their', 'them', 'follow', 'chase', 'about', 'with', 'from', 'lead', 'customer', 'proposal', 'bid'])
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !NOISE.has(w)))]
  if (!words.length) return { error: 'Tell me which quote — a number, the estimate name, or who it is for.' }
  const hits = new Map<number, { row: any; n: number }>()
  const bump = (rs: any[]) => { for (const q of rs) { const h = hits.get(q.id) || { row: q, n: 0 }; h.n += 1; hits.set(q.id, h) } }
  for (const w of words) {
    bump(await readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&${open}&or=(quote_id.ilike.*${w}*,estimate_name.ilike.*${w}*,job_title.ilike.*${w}*)&limit=30`))
    const leads = await readRecordList(r, `leads?select=id&company_id=eq.${companyId}&or=(customer_name.ilike.*${w}*,business_name.ilike.*${w}*)&limit=40`)
    const custs = await readRecordList(r, `customers?select=id&company_id=eq.${companyId}&or=(name.ilike.*${w}*,business_name.ilike.*${w}*)&limit=40`)
    const ors = [leads.length ? `lead_id.in.(${leads.map((l: any) => l.id).join(',')})` : '', custs.length ? `customer_id.in.(${custs.map((c: any) => c.id).join(',')})` : ''].filter(Boolean)
    if (ors.length) bump(await readRecordList(r, `quotes?select=${sel}&company_id=eq.${companyId}&${open}&or=(${ors.join(',')})&limit=30`))
  }
  const ranked = [...hits.values()].sort((a, b) => b.n - a.n || new Date(b.row.sent_date || 0).getTime() - new Date(a.row.sent_date || 0).getTime())
  const best = ranked[0]?.n ?? 0
  const rows = ranked.filter((h) => h.n === best).map((h) => h.row)
  return { rows }
}

export async function forWhom(r: Rest, companyId: number, q: any) {
  const lead = q.lead_id ? (await readRecordList(r, `leads?select=id,customer_name,business_name,email,phone&company_id=eq.${companyId}&id=eq.${q.lead_id}&limit=1`))[0] : null
  const cust = q.customer_id ? (await readRecordList(r, `customers?select=id,name,business_name,email,phone&company_id=eq.${companyId}&id=eq.${q.customer_id}&limit=1`))[0] : null
  const name = lead?.business_name || lead?.customer_name || cust?.business_name || cust?.name || 'the customer'
  const email = [q.sent_to_email, lead?.email, cust?.email].map((e) => String(e || '').trim()).find((e) => EMAIL.test(e)) || null
  const phone = [lead?.phone, cust?.phone].map((p) => String(p || '').trim()).find((p) => digits(p).length >= 10) || null
  return { name, email, phone, customerId: cust?.id ?? null, contact: lead?.customer_name || cust?.name || null }
}

export const quoteLabel = (q: any, who: string) => `${q.quote_id || q.estimate_name || '#' + q.id} — ${who}${q.quote_amount ? ' — ' + usd(Number(q.quote_amount)) : ''}`
const daysAgo = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null

export async function prepareFollowup(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const found = await findQuote(r, companyId, f.quote)
  if ('error' in found) return { ok: false, error: found.error as string }
  const rows = (found as any).rows as any[]
  if (!rows.length) return { ok: false, error: `No open quote matches "${f.quote}". Approved, rejected and won quotes are not followed up.` }
  if (rows.length > 1) {
    const labelled = await Promise.all(rows.slice(0, 6).map(async (q) => ({ id: q.id, label: quoteLabel(q, (await forWhom(r, companyId, q)).name) + (q.sent_date ? `, sent ${daysAgo(q.sent_date)}d ago` : '') })))
    return { needs_choice: labelled, message: 'More than one open quote matches. Ask which, then call again with the quote number as listed.' }
  }
  const q = rows[0]

  // Whose quote is it? A rep chases their own; anyone else's needs a manager.
  if (q.salesperson_id && String(q.salesperson_id) !== String(caller.employeeId) && caller.level < 2) {
    const [rep] = await readRecordList(r, `employees?select=name&company_id=eq.${companyId}&id=eq.${q.salesperson_id}&limit=1`)
    return { ok: false, error: `That quote is ${rep?.name || 'another rep'}'s. Following up on someone else's quote needs a manager.` }
  }
  const repId = q.salesperson_id || caller.employeeId
  const [rep] = repId ? await readRecordList(r, `employees?select=id,name,email&company_id=eq.${companyId}&id=eq.${repId}&limit=1`) : [null]

  const who = await forWhom(r, companyId, q)
  const channel = f.channel === 'sms' ? 'sms' : 'email'
  const to = channel === 'sms' ? who.phone : who.email
  if (!to) return { ok: false, error: `There is no ${channel === 'sms' ? 'mobile number' : 'email address'} on file for ${who.name} — nothing to send to. Add one on the lead or customer first.` }

  const message = String(f.message || '').trim()
  if (message.length < 20) return { ok: false, error: 'The note is too short to send — what do you want to say to them?' }
  if (channel === 'sms' && message.length > 480) return { ok: false, error: `That is ${message.length} characters — too long for a text. Keep it under 480, or send it as an email.` }
  const subject = (f.subject || `Following up on your estimate ${q.quote_id || ''}`).trim().slice(0, 140)

  const [co] = await readRecordList(r, `companies?select=company_name&id=eq.${companyId}&limit=1`)
  const portal = q.portal_token ? `/portal/${q.portal_token}` : null
  const sent = q.sent_date || q.last_sent_at
  return {
    ok: true,
    columns: {
      quote_id: q.id, quote_number: q.quote_id, channel, to, subject, message,
      rep_id: rep?.id ?? null, rep_name: rep?.name ?? null, rep_email: rep?.email ?? null,
      company_name: co?.company_name ?? null, customer_id: who.customerId, customer_name: who.name, contact: who.contact,
      portal_path: portal, followup_count: Number(q.followup_count) || 0,
    },
    display: [
      { label: 'Quote', value: quoteLabel(q, who.name) + (sent ? ` · sent ${daysAgo(sent)} days ago` : ' · never sent') + (q.followup_count ? ` · ${q.followup_count} follow-up${q.followup_count > 1 ? 's' : ''} already` : '') },
      { label: 'To', value: `${who.contact ? who.contact + ' · ' : ''}${to}${channel === 'sms' ? ' (text)' : ''}` },
      { label: 'From', value: rep ? `${rep.name}${rep.email ? ' — replies go to ' + rep.email : ''}` : '(no rep on the quote)' },
      ...(channel === 'email' ? [{ label: 'Subject', value: subject }] : []),
      { label: 'Message', value: message },
      ...(portal ? [{ label: 'Link', value: 'The estimate link is added under the message.' }] : []),
    ],
  }
}

/** Send it, book it on the quote, log it. */
export async function applyFollowup(r: Rest, companyId: number, prop: any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }> {
  const c = prop.payload?.columns || {}
  if (!c.quote_id || !c.to || !c.message) return { ok: false, error: 'That draft is missing the quote, the recipient or the message.' }

  // Still worth sending? An approval or a rejection since the draft means no.
  const [q] = await readRecordList(r, `quotes?select=id,status,approved_date,rejected_date,followup_count&company_id=eq.${companyId}&id=eq.${c.quote_id}&limit=1`)
  if (!q) return { ok: false, error: 'That quote no longer exists.' }
  if (q.approved_date || q.rejected_date || !OPEN.includes(q.status)) return { ok: false, stale: true, error: `That quote is now ${q.status}${q.approved_date ? ' (approved)' : q.rejected_date ? ' (rejected)' : ''} — no follow-up needed.` }

  const site = (Deno.env.get('SITE_URL') || '').replace(/\/$/, '')
  const link = c.portal_path && site ? `${site}${c.portal_path}` : null
  let external: string | null = null
  if (c.channel === 'sms') {
    const body = link ? `${c.message}\n${link}` : c.message
    const res = await fetch(`${r.url}/functions/v1/send-sms`, { method: 'POST', headers: H(r), body: JSON.stringify({ company_id: companyId, to: c.to, message: body, log: false }) })
    if (!res.ok) return { ok: false, error: `Text failed: ${res.status} ${(await res.text()).slice(0, 160)}` }
    external = (await res.json().catch(() => ({})))?.sid ?? null
  } else {
    const key = Deno.env.get('RESEND_API_KEY')
    if (!key) return { ok: false, error: 'Email is not configured (no RESEND_API_KEY).' }
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#2c3530;font-size:15px;line-height:1.55">
      <div style="white-space:pre-wrap">${esc(c.message)}</div>
      ${link ? `<p style="margin-top:18px"><a href="${link}" style="display:inline-block;padding:11px 22px;background:#5a6349;color:#fff;text-decoration:none;font-weight:600;border-radius:8px">View your estimate</a></p>` : ''}
      <p style="margin-top:22px;color:#4d5a52">${esc(c.rep_name || '')}${c.company_name ? `<br>${esc(c.company_name)}` : ''}</p>
    </div>`
    const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${c.company_name || 'JobScout'} <estimates@appsannex.com>`, to: [c.to], subject: c.subject, html, ...(c.rep_email && EMAIL.test(c.rep_email) ? { reply_to: c.rep_email } : {}) }) })
    if (!res.ok) return { ok: false, error: `Email failed: ${res.status} ${(await res.text()).slice(0, 160)}` }
    external = (await res.json().catch(() => ({})))?.id ?? null
  }

  // Book it the way the automatic follow-up books its own, so the two count together.
  const n = (Number(q.followup_count) || 0) + 1
  const patch: Record<string, unknown> = { followup_count: n }
  if (n <= 3) patch[`follow_up_${n}`] = new Date().toISOString()
  await fetch(`${r.url}/rest/v1/quotes?id=eq.${c.quote_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...H(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) })

  // The communications log, with the columns it actually has.
  let logId: number | null = null
  try {
    const res = await fetch(`${r.url}/rest/v1/communications_log`, { method: 'POST', headers: { ...H(r), Prefer: 'return=representation' },
      body: JSON.stringify({ company_id: companyId, type: c.channel, trigger: 'arnie_followup', customer_id: c.customer_id ?? null, recipient: c.to, sent_date: new Date().toISOString(), status: 'sent',
        response: `${c.channel === 'email' ? c.subject + ' — ' : ''}${String(c.message).slice(0, 240)}${external ? ` [${external}]` : ''}`, employee_id: c.rep_id ?? null }) })
    logId = (await res.json().catch(() => []))?.[0]?.id ?? null
  } catch { /* the log is a record, not the send */ }

  return { ok: true, id: c.quote_id, label: prop.payload?.entity_label || 'follow-up', created: { quote_id: c.quote_id, followup_n: n, log_id: logId, external_id: external, to: c.to, channel: c.channel } }
}

/** There is no unsending. Say so. */
export async function rollbackFollowup(_r: Rest, _companyId: number, prop: any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const made = prop.payload?.created || {}
  return { ok: false, error: `That ${made.channel === 'sms' ? 'text' : 'email'} went to ${made.to || 'the customer'} and cannot be unsent. The log entry stays so the next follow-up knows this one happened.` }
}
