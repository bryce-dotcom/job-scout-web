// A person decides what Sal found. Sal never does.
//
//   { company_id, opportunity_id, action: 'shortlist' | 'dismiss' | 'reopen' }
//   { company_id, opportunity_id, action: 'choose' }
//   { company_id, opportunity_id, action: 'build', storage_path, file_name, media_type }
//
// Choose is the hand-off the whole feature exists for (SAL_SCOUT_PLAN.md
// §5.4–5.6), in one call:
//   1. a normal lead (lead_source 'Bid Finder'), so the pipeline needs
//      nothing new — the party-sync triggers fill contact info
//   2. Bid Deadline appointments for the due date, the pre-bid meeting and
//      the questions deadline — inserted directly, never through
//      bookAppointment/arnieAppointment (those set the lead to Appointment
//      Set and write setter fees), with no setter_id so the setter-fee
//      trigger stays out of it
//   3. the package dropped on Benny: benny-bid-intake with the caller's own
//      JWT, the same body the upload card sends, so the bid builds exactly
//      as if the file had been dropped on his page. quote_id lands on the
//      opportunity. No PDF yet → status 'chosen', and the card asks for it.
//
// Manager and above choose (a bid is a week of someone's time); anyone on
// the roster can shortlist or dismiss. Every decision names who made it.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { DISMISS_REASONS } from '../_shared/bidFit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// deno-lint-ignore no-explicit-any
type Any = any

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const companyId = Number(body.company_id)
    const oppId = Number(body.opportunity_id)
    const action = String(body.action || '')
    if (!companyId || !oppId || !action) return json({ error: 'company_id, opportunity_id and action are required' }, 400)

    // ── Who: the JWT is the identity; the body only names the tenant.
    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in to use Sal' }, 401)
    const { data: emp } = await sb.from('employees').select('id,name,email').eq('company_id', companyId).ilike('email', user.email).limit(1).maybeSingle()
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    const level = caller?.companyId === companyId ? caller.level : 0
    const who = emp.email || user.email
    const now = new Date().toISOString()

    const { data: opp } = await sb.from('bid_opportunities').select('*').eq('id', oppId).eq('company_id', companyId).maybeSingle()
    if (!opp) return json({ error: 'That opportunity is not in this company' }, 404)

    // ── The easy decisions.
    if (action === 'shortlist') {
      if (!['new', 'dismissed', 'expired'].includes(opp.status)) return json({ error: `Cannot shortlist a ${opp.status} opportunity` }, 409)
      await sb.from('bid_opportunities').update({ status: 'shortlisted', dismissed_reason: null, dismissed_by: null, dismissed_at: null, updated_at: now }).eq('id', oppId)
      return json({ ok: true, status: 'shortlisted' })
    }
    if (action === 'dismiss') {
      if (!['new', 'shortlisted', 'expired'].includes(opp.status)) return json({ error: `Cannot dismiss a ${opp.status} opportunity` }, 409)
      const reason = DISMISS_REASONS.some((r) => r.key === body.reason) ? String(body.reason) : 'other'
      await sb.from('bid_opportunities').update({ status: 'dismissed', dismissed_reason: reason, dismissed_by: who, dismissed_at: now, updated_at: now }).eq('id', oppId)
      // The reason feeds what Sal learns (a person's word, never an auto-dismiss).
      await learn(sb, companyId, reason, opp)
      return json({ ok: true, status: 'dismissed', reason })
    }
    if (action === 'reopen') {
      if (!['dismissed', 'expired'].includes(opp.status)) return json({ error: `Cannot reopen a ${opp.status} opportunity` }, 409)
      await sb.from('bid_opportunities').update({ status: 'new', dismissed_reason: null, dismissed_by: null, dismissed_at: null, updated_at: now }).eq('id', oppId)
      return json({ ok: true, status: 'new' })
    }

    // ── Choose and build are a Manager's call.
    if (action !== 'choose' && action !== 'build') return json({ error: `Unknown action ${action}` }, 400)
    if (level < 2) return json({ error: 'Choosing a bid to pursue is a Manager decision — ask a manager or owner to choose it' }, 403)

    let leadId: number | null = opp.lead_id
    if (action === 'choose') {
      if (!['new', 'shortlisted', 'expired'].includes(opp.status)) return json({ error: `Already ${opp.status}` }, 409)
      if (Array.isArray(opp.blockers) && opp.blockers.length && body.override_blockers !== true) {
        return json({ error: `Sal flagged a blocker: ${opp.blockers[0]}. Choose again with "override" to pursue it anyway.`, blockers: opp.blockers, needs_override: true }, 409)
      }

      // 1. The lead. A normal row, so the pipeline needs nothing new.
      const st = opp.submit_to || {}
      const place = opp.place || {}
      const address = [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ') || null
      const serviceType = (await matchedServiceLine(sb, companyId, opp)) || 'Bid'
      const { data: lead, error: leadErr } = await sb.from('leads').insert({
        company_id: companyId,
        lead_id: `LEAD-${Date.now().toString(36).toUpperCase()}`,
        customer_name: st.contact_name || opp.buyer || opp.title,
        business_name: opp.buyer || null,
        email: st.email || null,
        phone: st.contact_phone || null,
        address,
        service_type: serviceType,
        lead_source: 'Bid Finder',
        status: 'New',
        salesperson_id: emp.id,
        source_system: 'sal',
        source_id: String(opp.id),
        quote_amount: opp.estimated_value_high ?? opp.estimated_value_low ?? null,
        notes: [
          `${opp.notice_type ? opp.notice_type.toUpperCase() : 'Solicitation'}${opp.solicitation_number ? ` ${opp.solicitation_number}` : ''} — ${opp.title}`,
          opp.summary || '',
          opp.due_at ? `Due ${new Date(opp.due_at).toLocaleString('en-US', { timeZone: opp.due_tz || 'America/Denver' })}${opp.due_tz ? ` (${opp.due_tz})` : ''}` : '',
          opp.url ? `Notice: ${opp.url}` : '',
          `Found by Sal (fit ${opp.fit_score ?? '?'}/100); chosen by ${emp.name || who}.`,
        ].filter(Boolean).join('\n'),
      }).select('id').single()
      if (leadErr || !lead) return json({ error: `Could not create the lead: ${leadErr?.message}` }, 500)
      leadId = lead.id
      await ensureLeadSource(sb, companyId)

      // 2. The dates. Direct inserts, type Bid Deadline, no setter.
      const dates: { at: string | null; title: string }[] = [
        { at: opp.due_at, title: `Bid due: ${opp.title}` },
        { at: opp.prebid_at, title: `Pre-bid${opp.prebid_mandatory ? ' (mandatory)' : ''}: ${opp.title}` },
        { at: opp.questions_due_at, title: `Questions due: ${opp.title}` },
      ]
      const appts = dates.filter((d) => d.at && new Date(d.at).getTime() > Date.now()).map((d) => ({
        company_id: companyId, lead_id: leadId, title: d.title.slice(0, 200),
        start_time: d.at, end_time: new Date(new Date(d.at!).getTime() + 30 * 60000).toISOString(), duration_minutes: 30,
        appointment_type: 'Bid Deadline', status: 'Scheduled',
        salesperson_id: emp.id, employee_id: emp.id, location: address,
        notes: opp.url || null,
      }))
      if (appts.length) {
        const { error: apErr } = await sb.from('appointments').insert(appts)
        if (apErr) console.error('[sal-choose] appointments failed:', apErr.message)
      }

      await sb.from('bid_opportunities').update({ status: 'chosen', lead_id: leadId, chosen_by: who, chosen_at: now, build_error: null, updated_at: now }).eq('id', oppId)
      await learn(sb, companyId, 'chosen', opp)
    }

    // 3. Drop the package on Benny.
    let storagePath: string | null = body.storage_path ? String(body.storage_path) : null
    let fileName: string | null = body.file_name ? String(body.file_name) : null
    let mediaType: string = body.media_type ? String(body.media_type) : 'application/pdf'
    // §5.5: SAM resourceLinks and public links that were never fetched come
    // down now — with the SAM key when the host is sam.gov. A login page
    // instead of a file is noted on the document; those stay a person's upload.
    if (['choose', 'build'].includes(action)) {
      const docs: Any[] = Array.isArray(opp.documents) ? opp.documents : []
      let changed = false
      for (const d of docs) {
        if (d.storage_path || !d.url || d.error || d.fetch_tried) continue
        try {
          const isSam = /(^|\.)sam\.gov$/i.test(new URL(d.url).hostname)
          const key = Deno.env.get('SAM_API_KEY')
          const u = isSam && key ? `${d.url}${d.url.includes('?') ? '&' : '?'}api_key=${key}` : d.url
          const r = await fetch(u, { redirect: 'follow' })
          const ct = (r.headers.get('content-type') || '').split(';')[0]
          if (!r.ok || /text\/html/i.test(ct)) { d.fetch_tried = now; d.error = r.ok ? 'a login page, not a file — download it from the portal and drop it here' : `HTTP ${r.status}`; changed = true; continue }
          const bytes = new Uint8Array(await r.arrayBuffer())
          if (bytes.length > 30 * 1024 * 1024) { d.fetch_tried = now; d.error = 'over 30 MB'; changed = true; continue }
          const name = String(d.name || d.url.split('/').pop() || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'document'
          const path = `bids/${companyId}/opps/${oppId}/${Date.now()}_${name}`
          const { error: upErr } = await sb.storage.from('project-documents').upload(path, bytes, { contentType: ct || 'application/pdf' })
          if (upErr) { d.fetch_tried = now; d.error = upErr.message; changed = true; continue }
          Object.assign(d, { bucket: 'project-documents', storage_path: path, bytes: bytes.length, content_type: ct || null, fetched_at: now, error: null }); changed = true
        } catch (e) { d.fetch_tried = now; d.error = (e as Error)?.message || 'fetch failed'; changed = true }
      }
      if (changed) { await sb.from('bid_opportunities').update({ documents: docs, updated_at: now }).eq('id', oppId); opp.documents = docs }
    }
    if (!storagePath) {
      const docs: Any[] = Array.isArray(opp.documents) ? opp.documents : []
      const pdf = docs.find((d) => d.storage_path && /\.pdf$/i.test(d.name || d.storage_path)) || docs.find((d) => d.storage_path && /image\//i.test(d.content_type || ''))
      if (pdf) { storagePath = pdf.storage_path; fileName = pdf.name || 'package.pdf'; mediaType = /\.pdf$/i.test(fileName || '') ? 'application/pdf' : (pdf.content_type || 'application/pdf') }
    } else if (action === 'build') {
      // A person dropped the package on the opportunity: keep it on the row.
      const docs: Any[] = Array.isArray(opp.documents) ? opp.documents : []
      if (!docs.some((d) => d.storage_path === storagePath)) docs.push({ name: fileName || 'package.pdf', bucket: 'project-documents', storage_path: storagePath, fetched_at: now, from: 'upload' })
      await sb.from('bid_opportunities').update({ documents: docs, updated_at: now }).eq('id', oppId)
    }
    if (!storagePath) {
      return json({ ok: true, status: 'chosen', lead_id: leadId, needs_package: true, message: 'Lead and deadlines made. Drop the bid package on the card and Benny will build the bid.' })
    }
    if (!leadId) return json({ error: 'Choose the opportunity before building' }, 409)

    // Hand over and return. A bid form takes Benny a minute; a plan takeoff
    // takes three or four, past the gateway's 150-second idle limit, so
    // nobody waits on him. He reports back to the opportunity when done
    // (opportunity_id → ready + quote_id, or chosen + build_error), and the
    // board shows "Benny is building" until then.
    // The rest of the package rides along: specs and addenda are read with the form (§5.6.1).
    const extraPaths = (Array.isArray(opp.documents) ? opp.documents : [])
      .filter((d: Any) => d.storage_path && d.storage_path !== storagePath && /\.(pdf|png|jpe?g|webp)$/i.test(d.name || d.storage_path))
      .slice(0, 12)
      .map((d: Any) => ({ bucket: d.bucket || 'project-documents', path: d.storage_path, name: d.name || null, media_type: /\.pdf$/i.test(d.name || d.storage_path) ? 'application/pdf' : (d.content_type || 'image/jpeg') }))
    await sb.from('bid_opportunities').update({ status: 'building', build_error: null, updated_at: now }).eq('id', oppId)
    const handoff = fetch(`${SUPABASE_URL}/functions/v1/benny-bid-intake`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth, apikey: ANON_KEY },
      body: JSON.stringify({ company_id: companyId, mode: 'create', storage_path: storagePath, extra_paths: extraPaths, storage_bucket: 'project-documents', file_name: fileName || 'package.pdf', media_type: mediaType, lead_id: leadId, salesperson_id: emp.id,
        opportunity_id: oppId,
        // What the buyer asked for, so a plan set with no bid form gets the right takeoff.
        scope_hint: [opp.title, opp.summary].filter(Boolean).join(' — ').slice(0, 600) }),
    }).then(async (r) => {
      // Benny patches the row himself; this only catches a hand-off that never reached him.
      if (!r.ok) {
        const b = await r.json().catch(() => ({}))
        if (r.status === 401 || r.status === 403 || r.status === 404 || r.status >= 500) {
          await sb.from('bid_opportunities').update({ status: 'chosen', build_error: String(b.error || `Benny returned ${r.status}`).slice(0, 500), updated_at: new Date().toISOString() }).eq('id', oppId).eq('status', 'building')
        }
      }
    }).catch(async (e) => {
      await sb.from('bid_opportunities').update({ status: 'chosen', build_error: `Could not reach Benny: ${(e as Error)?.message}`.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', oppId).eq('status', 'building')
    })
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime
    if (rt?.waitUntil) rt.waitUntil(handoff)
    return json({ ok: true, status: 'building', lead_id: leadId, message: 'Benny has the package. A bid form takes about a minute; a plan takeoff a few. The card turns "Bid ready" when he is done.' })
  } catch (err) {
    console.error('[sal-choose]', err)
    return json({ error: (err as Error)?.message || 'Sal hit an error' }, 500)
  }
})

// The service line whose words the opportunity matched, as the lead's service_type.
async function matchedServiceLine(sb: Any, companyId: number, opp: Any): Promise<string | null> {
  const { data: prof } = await sb.from('bid_profiles').select('service_lines').eq('company_id', companyId).maybeSingle()
  const text = `${opp.title} ${opp.summary || ''}`.toLowerCase()
  for (const line of prof?.service_lines || []) {
    const naicsHit = (line.naics || []).some((n: string) => (opp.naics || []).some((x: string) => String(x).startsWith(String(n))))
    const wordHit = (line.keywords || []).some((w: string) => w && text.includes(String(w).toLowerCase()))
    if ((naicsHit || wordHit) && line.label) return String(line.label).slice(0, 80)
  }
  return null
}

// 'Bid Finder' must be a value the Leads page can filter on. The settings
// row is unique on (company_id, key); read newest-first and write by id —
// never maybeSingle() (that is how 156 duplicate rows once appeared).
async function ensureLeadSource(sb: Any, companyId: number) {
  const { data: rows } = await sb.from('settings').select('id,value').eq('company_id', companyId).eq('key', 'lead_sources').order('id', { ascending: false }).limit(1)
  const row = rows?.[0]
  let list: string[] = []
  try { list = row?.value ? JSON.parse(row.value) : [] } catch { list = [] }
  if (!Array.isArray(list)) list = []
  if (list.includes('Bid Finder')) return
  list.push('Bid Finder')
  if (row) await sb.from('settings').update({ value: JSON.stringify(list) }).eq('id', row.id)
  else await sb.from('settings').insert({ company_id: companyId, key: 'lead_sources', value: JSON.stringify(list) })
}

// What Sal learns from a person's decisions: counts by reason and by buyer,
// summarised in one paragraph the fit prompt reads. Never a price.
async function learn(sb: Any, companyId: number, reason: string, opp: Any) {
  const { data: prof } = await sb.from('bid_profiles').select('id,learned').eq('company_id', companyId).maybeSingle()
  if (!prof) return
  const learned = (prof.learned && typeof prof.learned === 'object') ? { ...prof.learned } : {}
  const byReason = { ...(learned.by_reason || {}) }
  byReason[reason] = (Number(byReason[reason]) || 0) + 1
  const byBuyer = { ...(learned.by_buyer || {}) }
  const buyer = String(opp.buyer || '').slice(0, 80)
  if (buyer) {
    const b = { ...(byBuyer[buyer] || {}) }
    b[reason === 'chosen' ? 'chosen' : 'dismissed'] = (Number(b[reason === 'chosen' ? 'chosen' : 'dismissed']) || 0) + 1
    byBuyer[buyer] = b
  }
  const parts: string[] = []
  const dismissals = Object.entries(byReason).filter(([k]) => k !== 'chosen').sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 4)
  if (byReason.chosen) parts.push(`chosen ${byReason.chosen} so far`)
  if (dismissals.length) parts.push(`dismissed mostly for ${dismissals.map(([k, v]) => `${k.replace(/_/g, ' ')} (${v})`).join(', ')}`)
  const liked = Object.entries(byBuyer).filter(([, v]: Any) => v.chosen).map(([k]) => k).slice(0, 5)
  if (liked.length) parts.push(`buyers they pursue: ${liked.join('; ')}`)
  await sb.from('bid_profiles').update({ learned: { ...learned, by_reason: byReason, by_buyer: byBuyer, summary: parts.join('. ') }, updated_at: new Date().toISOString() }).eq('id', prof.id)
}
