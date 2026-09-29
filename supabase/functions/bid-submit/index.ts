// Approve and submit a bid (SAL_SCOUT_PLAN.md §5.8), and learn from it (§5.9).
//
//   approve         Manager+ ticks the exact approval sentence. Refused, in
//                   the page's own words, unless the bid is ready (_shared/
//                   bidPacket — the server twin of lib/bidPacket).
//   send_email      From bids@appsannex.com with the tenant's name, the packet
//                   attached (Resend's 40 MB cap: over it, the files become
//                   signed links), reply_to = the tenant's bid inbox so the
//                   buyer's reply files on Sal's Inbox, approver and signer in
//                   CC. Recipients come from the ROW, never the body — this
//                   is not an open relay. dry_run returns the plan unsent.
//   mark_submitted  Portal and mail: a person records the confirmation
//                   number / tracking / screenshot; the bid is submitted.
//   withdraw        Back to ready; the row is kept, status 'withdrawn'.
//   outcome         won | lost | no_award with amounts; the opportunity
//                   closes and the profile learns.
// JWT identity + roster, like sal-choose. Every action is mirrored to
// audit_log.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { submitReadiness, approvalSentence } from '../_shared/bidPacket.ts'
import { bidsInboxAddress } from '../_shared/replyToken.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
// deno-lint-ignore no-explicit-any
type Any = any
const RESEND_CAP = 40 * 1024 * 1024
const emailOk = (s: string) => /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(s || '').trim())

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = Number(body.company_id), subId = Number(body.submission_id), action = String(body.action || '')
    if (!companyId || !subId || !action) return json({ error: 'company_id, submission_id and action are required' }, 400)

    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in first' }, 401)
    const { data: emp } = await sb.from('employees').select('id,name,email').eq('company_id', companyId).ilike('email', user.email).limit(1).maybeSingle()
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    const level = caller?.companyId === companyId ? caller.level : 0
    const now = new Date().toISOString()

    const { data: sub } = await sb.from('bid_submissions').select('*').eq('id', subId).eq('company_id', companyId).maybeSingle()
    if (!sub) return json({ error: 'No such submission' }, 404)
    const { data: quote } = await sb.from('quotes').select('id, quote_id, estimate_name, quote_amount, document_type, bid_intake, customer_id, lead_id').eq('id', sub.quote_id).eq('company_id', companyId).maybeSingle()
    if (!quote) return json({ error: 'The bid behind this submission is gone' }, 404)
    const { data: opp } = sub.opportunity_id
      ? await sb.from('bid_opportunities').select('id, title, buyer, solicitation_number, due_at, due_tz, submit_method, submit_to, requirements, blockers, status').eq('id', sub.opportunity_id).maybeSingle()
      : { data: null }
    const { data: company } = await sb.from('companies').select('company_name, legal_name, owner_email, phone, insurance_cert_url, insurance_expiration, workers_comp_cert_url, workers_comp_expiration, w9_url, business_license_url, bond_cert_url').eq('id', companyId).maybeSingle()
    const intake: Any = quote.bid_intake || {}
    const dueAt: string | null = opp?.due_at || intake.due_at || null
    const title = opp?.title || intake.project || intake.title || quote.estimate_name || 'Bid'
    const solicitation = opp?.solicitation_number || intake.bid_number || null

    const audit = async (act: string, values: Record<string, unknown>) => {
      try { await sb.from('audit_log').insert({ company_id: companyId, user_email: emp.email, action: act, table_name: 'bid_submissions', record_id: String(sub.id), new_values: values, created_at: now }) } catch { /* best effort */ }
    }
    const notify = async (type: string, ntitle: string, message: string) => {
      try { await sb.from('company_notifications').insert({ company_id: companyId, type, title: ntitle, message, metadata: { submission_id: sub.id, quote_id: sub.quote_id, opportunity_id: sub.opportunity_id, route: `/estimates/${sub.quote_id}`, source: 'sal' }, created_by: null }) } catch { /* best effort */ }
    }
    const setOpp = async (status: string, extra: Record<string, unknown> = {}) => {
      if (sub.opportunity_id) await sb.from('bid_opportunities').update({ status, submission_id: sub.id, updated_at: now, ...extra }).eq('id', sub.opportunity_id)
    }

    // ── approve
    if (action === 'approve') {
      if (level < 2) return json({ error: 'Approving a bid for submission is a Manager decision' }, 403)
      const expected = approvalSentence(company?.company_name)
      if (String(body.approval_text || '').trim() !== expected) return json({ error: 'Tick the approval sentence exactly as written', expected }, 400)
      const { data: lines } = await sb.from('quote_lines').select('id, item_name, price_source, price_verified_at').eq('quote_id', sub.quote_id).eq('company_id', companyId)
      const readiness = submitReadiness({ documentType: quote.document_type || 'bid', lines: lines || [], checklist: sub.checklist || [], company, dueAt, blockers: opp?.blockers || [] })
      if (!readiness.ready) return json({ error: 'This bid is not ready to submit', reasons: readiness.reasons }, 409)
      if (!sub.packet_built_at) return json({ error: 'Build the packet first — the approval covers the attachments' }, 409)
      const patch = { status: 'approved', approved_by: emp.email, approved_at: now, approval_text: expected, updated_at: now }
      await sb.from('bid_submissions').update(patch).eq('id', sub.id)
      await audit('bid_approved', { ...patch, quote_id: sub.quote_id, opportunity_id: sub.opportunity_id, in_margin: readiness.inMargin })
      return json({ ok: true, status: 'approved', in_margin: readiness.inMargin })
    }

    // ── send_email
    if (action === 'send_email') {
      if (sub.status !== 'approved' && sub.status !== 'bounced') return json({ error: `Approve the bid before sending (it is ${sub.status})` }, 409)
      if (level < 2) return json({ error: 'Sending a bid is a Manager decision' }, 403)
      const to = String(body.to || sub.sent_to?.email || opp?.submit_to?.email || '').trim().toLowerCase()
      if (!emailOk(to)) return json({ error: 'The buyer\'s email address is missing or not valid — set it on the submission' }, 400)
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
      if (!RESEND_API_KEY) return json({ error: 'Email is not configured (RESEND_API_KEY)' }, 500)
      const displayName = company?.company_name || 'JobScout'
      // The packet, in order; over the cap the files become 7-day signed links.
      const files: Any[] = (sub.packet || []).filter((p: Any) => p.storage_path)
      const combined = files.find((p: Any) => p.kind === 'combined')
      const parts = files.filter((p: Any) => p.kind !== 'combined')
      const total = parts.reduce((t: number, p: Any) => t + (Number(p.bytes) || 0), 0)
      const attachAll = total <= RESEND_CAP
      const attachCombinedOnly = !attachAll && combined && Number(combined.bytes) <= RESEND_CAP
      const toAttach = attachAll ? parts : attachCombinedOnly ? [combined] : []
      const toLink = attachAll ? [] : attachCombinedOnly ? parts : files
      const attachments: Any[] = []
      for (const p of toAttach) {
        const { data: blob, error } = await sb.storage.from(p.bucket || 'project-documents').download(p.storage_path)
        if (error || !blob) return json({ error: `Could not read ${p.file_name} from storage` }, 500)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
        attachments.push({ filename: p.file_name, content: btoa(bin) })
      }
      const links: Any[] = []
      for (const p of toLink) {
        const { data } = await sb.storage.from(p.bucket || 'project-documents').createSignedUrl(p.storage_path, 7 * 24 * 3600)
        if (data?.signedUrl) links.push({ file_name: p.file_name, url: data.signedUrl })
      }
      const REPLY_SECRET = Deno.env.get('REPLY_TOKEN_SECRET') || ''
      const INBOUND_DOMAIN = Deno.env.get('INBOUND_EMAIL_DOMAIN') || 'appsannex.com'
      const replyTo = REPLY_SECRET ? await bidsInboxAddress(companyId, REPLY_SECRET, INBOUND_DOMAIN) : (sub.approved_by || emp.email)
      const cc = [...new Set([sub.approved_by, emp.email].filter((e) => e && emailOk(e) && e.toLowerCase() !== to))]
      const subject = `Bid${solicitation ? ` ${solicitation}` : ''} — ${title} — ${displayName}`
      const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const paras = String(sub.cover_letter || `Please find our bid for ${title} attached.`).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;line-height:1.55;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
      const html = `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#2c3530;font-size:14px;max-width:640px;margin:0 auto;padding:24px;">
  ${paras}
  <p style="margin:16px 0 4px;font-weight:bold;">Enclosed${links.length ? ' (links valid 7 days)' : ''}:</p>
  <ul style="margin:0 0 16px;padding-left:20px;">${[...attachments.map((a) => `<li>${esc(a.filename)}</li>`), ...links.map((l) => `<li><a href="${l.url}">${esc(l.file_name)}</a></li>`)].join('')}</ul>
  <p style="margin:0;color:#7d8a7f;font-size:12px;">${esc(displayName)}${company?.phone ? ` · ${esc(company.phone)}` : ''}</p>
</body></html>`
      const payload: Any = { from: `${displayName} <bids@appsannex.com>`, to: [to], subject, html, reply_to: replyTo }
      if (cc.length) payload.cc = cc
      if (attachments.length) payload.attachments = attachments
      const plan = { to, cc, reply_to: replyTo, subject, attached: attachments.map((a) => a.filename), linked: links.map((l) => l.file_name), bytes: total }
      if (body.dry_run) return json({ ok: true, dry_run: true, plan })
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const rb = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: `Resend refused the email: ${rb?.message || r.status}` }, 502)
      const patch = { status: 'sent', method: 'email', sent_to: { email: to, cc }, sent_at: now, email_id: rb.id || null, delivery_status: 'sent', bounce_reason: null, updated_at: now }
      await sb.from('bid_submissions').update(patch).eq('id', sub.id)
      await setOpp('submitted')
      await audit('bid_sent', { ...plan, email_id: rb.id || null })
      return json({ ok: true, status: 'sent', email_id: rb.id || null, plan })
    }

    // ── mark_submitted (portal, mail, hand delivery)
    if (action === 'mark_submitted') {
      if (!['approved', 'sent', 'delivered', 'bounced'].includes(sub.status)) return json({ error: `Approve the bid before recording a submission (it is ${sub.status})` }, 409)
      const method = ['portal', 'mail', 'buildingconnected', 'planhub', 'email'].includes(body.method) ? body.method : (sub.method || 'portal')
      const confirmation = { method, number: body.confirmation_number ? String(body.confirmation_number).slice(0, 120) : null, tracking: body.tracking ? String(body.tracking).slice(0, 120) : null, note: body.note ? String(body.note).slice(0, 500) : null, screenshot_path: body.screenshot_path || null, by: emp.email, at: now }
      const patch = { status: 'confirmed', method, confirmation, sent_at: sub.sent_at || now, updated_at: now }
      await sb.from('bid_submissions').update(patch).eq('id', sub.id)
      await setOpp('submitted')
      await audit('bid_submitted', patch)
      return json({ ok: true, status: 'confirmed' })
    }

    // ── withdraw
    if (action === 'withdraw') {
      if (level < 2) return json({ error: 'Withdrawing a submission is a Manager decision' }, 403)
      await sb.from('bid_submissions').update({ status: 'withdrawn', outcome_notes: body.reason ? String(body.reason).slice(0, 500) : sub.outcome_notes, updated_at: now }).eq('id', sub.id)
      await setOpp('ready', { submission_id: null })
      await audit('bid_withdrawn', { reason: body.reason || null })
      return json({ ok: true, status: 'withdrawn' })
    }

    // ── outcome
    if (action === 'outcome') {
      const outcome = ['won', 'lost', 'no_award', 'unknown'].includes(body.outcome) ? body.outcome : null
      if (!outcome) return json({ error: 'outcome must be won, lost, no_award or unknown' }, 400)
      const patch = { outcome, award_amount: body.award_amount != null && body.award_amount !== '' ? Number(body.award_amount) : null, low_bid_amount: body.low_bid_amount != null && body.low_bid_amount !== '' ? Number(body.low_bid_amount) : null, outcome_notes: body.notes ? String(body.notes).slice(0, 1000) : null, outcome_at: outcome === 'unknown' ? null : now, updated_at: now }
      await sb.from('bid_submissions').update(patch).eq('id', sub.id)
      if (outcome !== 'unknown') await setOpp(outcome)
      // What Sal learns: outcomes by buyer, and the spread against the low bid.
      try {
        const { data: prof } = await sb.from('bid_profiles').select('id, learned').eq('company_id', companyId).maybeSingle()
        if (prof && outcome !== 'unknown') {
          const learned = (prof.learned && typeof prof.learned === 'object') ? { ...prof.learned } : {}
          const byOutcome = { ...(learned.by_outcome || {}) }; byOutcome[outcome] = (Number(byOutcome[outcome]) || 0) + 1
          const byBuyer = { ...(learned.by_buyer || {}) }
          const buyer = String(opp?.buyer || intake.buyer || '').slice(0, 80)
          if (buyer) { const b = { ...(byBuyer[buyer] || {}) }; b[outcome] = (Number(b[outcome]) || 0) + 1; byBuyer[buyer] = b }
          const spreads: number[] = Array.isArray(learned.spreads) ? learned.spreads : []
          if (outcome === 'lost' && patch.low_bid_amount && Number(quote.quote_amount) > 0) spreads.push(Math.round(((Number(quote.quote_amount) - patch.low_bid_amount) / patch.low_bid_amount) * 1000) / 10)
          await sb.from('bid_profiles').update({ learned: { ...learned, by_outcome: byOutcome, by_buyer: byBuyer, spreads: spreads.slice(-50) }, updated_at: now }).eq('id', prof.id)
        }
      } catch { /* learning is best effort */ }
      await audit('bid_outcome', patch)
      if (outcome === 'won') await notify('bid_won', `Won: ${title}`, `${solicitation ? `${solicitation} — ` : ''}${opp?.buyer || intake.buyer || ''}${patch.award_amount ? ` · $${patch.award_amount.toLocaleString('en-US')}` : ''}`)
      return json({ ok: true, outcome })
    }

    return json({ error: `Unknown action ${action}` }, 400)
  } catch (err) {
    console.error('[bid-submit]', err)
    return json({ error: (err as Error)?.message || 'bid-submit hit an error' }, 500)
  }
})
