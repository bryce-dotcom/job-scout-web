// Sal reads what arrived and scores it.
//
// One function, three ways in:
//   { company_id, inbox_id }          — a bid_inbox row (portal alert, forwarded
//                                       invitation, RSS notice): read it into
//                                       opportunities, then score them
//   { company_id, opportunity_ids }   — rows that already exist (SAM.gov poll
//                                       writes structured rows): score only
//   { company_id, text, subject?, from?, url? } — pasted text or a link
//
// Two metered passes, both through _shared/anthropic.ts:
//   bid-parse  the unstructured alert → the opportunity fields, as JSON. Every
//              portal words its alerts differently; a regex per portal is the
//              scraper problem in a different coat.
//   bid-fit    profile + opportunity → score 0–100, reasons, blockers, effort.
// Before the model sees anything, _shared/bidFit.prefilter decides the cheap
// things (area, exclusions, set-asides, deadline) and writes the reason down.
// The model never sets a price and never chooses; a person does that on the
// board (sal-choose).
//
// Called by the cron with the service key, and by a person on the Inbox tab
// ("Read it now") with their JWT — then they must be on the company's roster.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAnthropic } from '../_shared/anthropic.ts'
import { dedupeHash, prefilter, statusForScore, shouldNotify, type Profile, type OppLike } from '../_shared/bidFit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const READ_MODEL = 'claude-sonnet-5'
const FALLBACK_MODEL = 'claude-sonnet-4-6'
const DOC_CAP = 15 * 1024 * 1024

// deno-lint-ignore no-explicit-any
type Any = any

const textOf = (r: Any) => (r?.data?.content || []).map((c: Any) => c.text || '').join('')
const parseJson = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]) }
const iso = (v: Any): string | null => { if (!v) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null }
const num = (v: Any): number | null => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null }
const arr = (v: Any): string[] => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []
const str = (v: Any, max = 4000): string | null => { const s = v == null ? '' : String(v).trim(); return s ? s.slice(0, max) : null }
const oneOf = (v: Any, allowed: string[], dflt: string | null = null) => allowed.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : dflt

function hrefsOf(html: string | null | undefined): string[] {
  const out: string[] = []
  const re = /href\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(html || ''))) && out.length < 40) {
    const u = m[1].trim()
    if (/^https?:\/\//i.test(u) && !/unsubscribe|mailto:|privacy|twitter|facebook|linkedin/i.test(u)) out.push(u)
  }
  return [...new Set(out)]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const body = await req.json().catch(() => ({}))
    const companyId = Number(body.company_id)
    if (!companyId) return json({ error: 'company_id is required' }, 400)

    // ── Who is asking: the cron (service key) or a person on the roster.
    const auth = req.headers.get('Authorization') || ''
    const bearer = auth.replace(/^Bearer\s+/i, '').trim()
    let callerEmail: string | null = null
    if (bearer !== SERVICE_KEY) {
      const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
      const user = uRes.ok ? await uRes.json() : null
      if (!user?.email) return json({ error: 'Sign in to use Sal' }, 401)
      const { data: emp } = await sb.from('employees').select('id,email').eq('company_id', companyId).ilike('email', user.email).limit(1).maybeSingle()
      if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)
      callerEmail = user.email
    }

    // ── The profile: what a fit means here. None yet = everything passes the
    // prefilter and the model scores against the company's name alone.
    const { data: profRow } = await sb.from('bid_profiles').select('*').eq('company_id', companyId).limit(1).maybeSingle()
    const profile: Profile = profRow || {}
    const { data: company } = await sb.from('companies').select('company_name,city,state').eq('id', companyId).single()

    const meta = { feature: 'bid-parse', companyId }
    const ask = async (feature: string, prompt: string, maxTokens = 6000) => {
      const m = { ...meta, feature }
      const content = [{ type: 'text', text: prompt }]
      let r = await callAnthropic(m, { model: READ_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      if (!r.ok && r.status === 404) r = await callAnthropic(m, { model: FALLBACK_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      return r
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PARSE: an inbox row or pasted text → candidate opportunities.
    // ═══════════════════════════════════════════════════════════════════════
    let candidates: Any[] = []
    let inbox: Any = null
    let sourceKind: 'email' | 'rss' | 'manual' | 'sam' = 'email'
    let inboxAttachments: Any[] = []

    const wantsParse = body.inbox_id || body.text || body.url
    if (wantsParse) {
      let subject = str(body.subject, 300) || ''
      let from = str(body.from, 200) || ''
      let text = str(body.text, 60000) || ''
      let links: string[] = body.url ? [String(body.url)] : []
      if (body.inbox_id) {
        const { data: row } = await sb.from('bid_inbox').select('*').eq('id', Number(body.inbox_id)).eq('company_id', companyId).maybeSingle()
        if (!row) return json({ error: 'That inbox row is not in this company' }, 404)
        inbox = row
        subject = row.subject || ''
        from = row.from_email || ''
        text = String(row.text_body || '').slice(0, 60000)
        links = hrefsOf(row.html_body)
        inboxAttachments = Array.isArray(row.attachments) ? row.attachments : []
        sourceKind = String(row.email_id || '').startsWith('rss:') ? 'rss' : 'email'
      } else if (body.url && !text) {
        // A pasted public link: read the page if it will let us.
        try {
          const r = await fetch(String(body.url), { headers: { 'User-Agent': 'JobScout Sal (bid notice reader)' } })
          const ct = r.headers.get('content-type') || ''
          if (r.ok && /text\/html|text\/plain/i.test(ct)) text = (await r.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 60000)
        } catch { /* the model gets the URL alone */ }
        sourceKind = 'manual'
      } else {
        sourceKind = 'manual'
      }

      const attNames = inboxAttachments.map((a) => a.name).filter(Boolean)
      const parsePrompt = `You are Sal, a solicitation scout for a field-services contractor (${company?.company_name || 'the company'}${company?.state ? `, ${company.state}` : ''}). Below is an email or notice that may announce one or more solicitations: invitations to bid, RFPs, RFQs, GC invitations to bid, sources-sought notices, addenda. Read it and return ONLY a JSON object, no prose:

{
  "is_solicitation": true,
  "note": "one line on what this is, or why it is not a solicitation",
  "opportunities": [
    {
      "title": "short title as the buyer names the project",
      "buyer": "the buying organization and department as printed, or the GC's name",
      "buyer_level": "federal" | "state" | "county" | "city" | "district" | "utility" | "gc" | "private" | "unknown",
      "solicitation_number": "the buyer's bid / ITB / RFP / RFQ number, or null",
      "notice_type": "ifb" | "rfp" | "rfq" | "itb" | "sources_sought" | "presolicitation" | "amendment" | "award" | "other",
      "summary": "2-4 sentences: the scope of work in plain words",
      "naics": ["6-digit NAICS codes printed, else []"],
      "commodity_codes": ["commodity / NIGP / UNSPSC codes printed, else []"],
      "set_aside": "set-aside or preference text as printed, or null",
      "estimated_value_low": null,
      "estimated_value_high": null,
      "place": { "address": null, "city": null, "state": "two-letter state or null", "zip": null },
      "posted_at": "ISO 8601 or null",
      "due_at": "ISO 8601 WITH the utc offset for the zone printed (e.g. 2026-10-14T14:00:00-06:00), or null",
      "due_tz": "IANA zone the deadline was printed in (America/Denver, America/Phoenix, America/New_York...), or null",
      "questions_due_at": "ISO 8601 or null",
      "prebid_at": "ISO 8601 or null",
      "prebid_mandatory": false,
      "requirements": { "bond_pct": null, "license": null, "insurance": null, "prevailing_wage": null, "other": [] },
      "submit_method": "email" | "portal" | "mail" | "sealed" | "unknown",
      "submit_to": { "email": null, "portal_url": null, "address": null, "contact_name": null, "contact_phone": null },
      "url": "the main link to the solicitation, or null",
      "document_links": ["direct links to notice/bid documents, if any"]
    }
  ]
}

Rules: one entry per distinct solicitation (a digest email may carry several). Copy numbers, dates and names as printed; never invent a due date — null when absent. A newsletter, receipt, registration confirmation or portal marketing email is NOT a solicitation: is_solicitation false, opportunities []. Do not estimate a value unless the notice prints one.

FROM: ${from}
SUBJECT: ${subject}
${attNames.length ? `ATTACHMENTS: ${attNames.join(', ')}\n` : ''}${links.length ? `LINKS:\n${links.slice(0, 40).join('\n')}\n` : ''}
BODY:
${text || '(no text)'}`

      const read = await ask('bid-parse', parsePrompt, 8000)
      if (!read.ok) {
        if (inbox) await sb.from('bid_inbox').update({ status: 'failed', error: read.friendly || 'Sal could not read it' }).eq('id', inbox.id)
        return json({ error: read.friendly, ai_unavailable: read.unavailable === true }, 502)
      }
      let parsed: Any
      try { parsed = parseJson(textOf(read)) } catch {
        if (inbox) await sb.from('bid_inbox').update({ status: 'failed', error: 'Sal could not make out a solicitation in it' }).eq('id', inbox.id)
        return json({ error: 'Sal could not make out a solicitation in that', raw: textOf(read).slice(0, 1500) }, 422)
      }
      candidates = Array.isArray(parsed?.opportunities) ? parsed.opportunities : []
      if (!parsed?.is_solicitation || candidates.length === 0) {
        if (inbox) await sb.from('bid_inbox').update({ status: 'ignored', error: str(parsed?.note, 300) || 'Not a solicitation' }).eq('id', inbox.id)
        return json({ ok: true, opportunities: [], ignored: true, note: parsed?.note || null })
      }
    }

    // ── Upsert the candidates as rows (dedupe on the buyer's number).
    const madeIds: number[] = []
    for (const c of candidates) {
      const opp: OppLike & Record<string, Any> = {
        title: str(c.title, 300) || str(inbox?.subject, 300) || 'Untitled solicitation',
        buyer: str(c.buyer, 200),
        buyer_level: oneOf(c.buyer_level, ['federal', 'state', 'county', 'city', 'district', 'utility', 'gc', 'private', 'unknown'], 'unknown'),
        solicitation_number: str(c.solicitation_number, 80),
        notice_type: oneOf(c.notice_type, ['ifb', 'rfp', 'rfq', 'itb', 'sources_sought', 'presolicitation', 'amendment', 'award', 'other'], 'other'),
        summary: str(c.summary, 2000),
        naics: arr(c.naics), commodity_codes: arr(c.commodity_codes),
        set_aside: str(c.set_aside, 200),
        estimated_value_low: num(c.estimated_value_low), estimated_value_high: num(c.estimated_value_high),
        place: c.place && typeof c.place === 'object' ? { address: str(c.place.address, 200), city: str(c.place.city, 100), state: str(c.place.state, 2)?.toUpperCase() || null, zip: str(c.place.zip, 12) } : null,
        posted_at: iso(c.posted_at), due_at: iso(c.due_at), due_tz: str(c.due_tz, 60),
        questions_due_at: iso(c.questions_due_at), prebid_at: iso(c.prebid_at), prebid_mandatory: c.prebid_mandatory === true,
        requirements: c.requirements && typeof c.requirements === 'object' ? c.requirements : {},
        submit_method: oneOf(c.submit_method, ['email', 'portal', 'mail', 'sealed', 'unknown'], 'unknown'),
        submit_to: c.submit_to && typeof c.submit_to === 'object' ? c.submit_to : null,
        url: str(c.url, 800) || (body.url ? String(body.url) : null),
      }
      const hash = dedupeHash(opp)
      // Documents: the inbox attachments already in storage, plus any direct
      // public file links the notice carried, fetched now (cap 15 MB each).
      const documents: Any[] = inboxAttachments.filter((a) => a.storage_path).map((a) => ({ name: a.name, bucket: a.bucket, storage_path: a.storage_path, bytes: a.size, fetched_at: a.fetched_at, from: 'attachment' }))
      for (const link of arr(c.document_links).slice(0, 6)) {
        if (!/^https?:\/\//i.test(link)) continue
        if (!/\.(pdf|docx?|xlsx?|zip)(\?|$)/i.test(link)) { documents.push({ name: link.split('/').pop() || 'link', url: link, fetched_at: null }); continue }
        try {
          const r = await fetch(link, { headers: { 'User-Agent': 'JobScout Sal (bid notice reader)' }, redirect: 'follow' })
          const ct = r.headers.get('content-type') || ''
          if (!r.ok || /text\/html/i.test(ct)) { documents.push({ name: link.split('/').pop() || 'link', url: link, fetched_at: null, error: r.ok ? 'login page' : `http ${r.status}` }); continue }
          const bytes = new Uint8Array(await r.arrayBuffer())
          if (bytes.length > DOC_CAP) { documents.push({ name: link.split('/').pop() || 'file', url: link, fetched_at: null, error: 'over 15 MB' }); continue }
          const name = (link.split('/').pop() || 'document').split('?')[0].replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
          const path = `bids/${companyId}/opps/${hash.replace(':', '_')}/${name}`
          const { error: upErr } = await sb.storage.from('project-documents').upload(path, bytes, { contentType: ct.split(';')[0] || 'application/octet-stream', upsert: true })
          if (upErr) { documents.push({ name, url: link, fetched_at: null, error: upErr.message }); continue }
          documents.push({ name, url: link, bucket: 'project-documents', storage_path: path, bytes: bytes.length, fetched_at: new Date().toISOString(), from: 'link' })
        } catch (e) {
          documents.push({ name: link.split('/').pop() || 'link', url: link, fetched_at: null, error: (e as Error)?.message || 'fetch failed' })
        }
      }

      const { data: existing } = await sb.from('bid_opportunities').select('id,status,due_at,documents,summary').eq('company_id', companyId).eq('dedupe_hash', hash).maybeSingle()
      if (existing) {
        // An amendment or a second feed: update what changed, keep the
        // person's decision, and say so if the deadline moved on a chosen one.
        const dueMoved = opp.due_at && existing.due_at && new Date(opp.due_at).getTime() !== new Date(existing.due_at).getTime()
        const mergedDocs = [...(Array.isArray(existing.documents) ? existing.documents : [])]
        for (const d of documents) if (!mergedDocs.some((x) => (x.storage_path && x.storage_path === d.storage_path) || (x.url && x.url === d.url))) mergedDocs.push(d)
        await sb.from('bid_opportunities').update({
          ...(opp.due_at ? { due_at: opp.due_at, due_tz: opp.due_tz } : {}),
          ...(opp.summary && !existing.summary ? { summary: opp.summary } : {}),
          documents: mergedDocs, amended_at: dueMoved ? new Date().toISOString() : undefined,
          inbox_id: inbox?.id ?? undefined, updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
        if (dueMoved && ['chosen', 'building', 'ready'].includes(existing.status)) {
          await sb.from('company_notifications').insert({
            company_id: companyId, type: 'bid_amended',
            title: `Sal: deadline moved — ${opp.title}`,
            message: `Now due ${new Date(opp.due_at!).toLocaleString('en-US', { timeZone: opp.due_tz || 'America/Denver' })}${opp.due_tz ? ` (${opp.due_tz})` : ''}`,
            metadata: { opportunity_id: existing.id, route: '/agents/sal', source: 'sal' }, created_by: null,
          })
        }
        madeIds.push(existing.id)
        continue
      }
      const { data: made, error: insErr } = await sb.from('bid_opportunities').insert({
        company_id: companyId, source_kind: sourceKind, source_ref: inbox ? String(inbox.email_id || inbox.id) : (body.url || null),
        inbox_id: inbox?.id ?? null, dedupe_hash: hash, documents, status: 'new',
        raw: { from: str(body.from, 200) || inbox?.from_email || null, subject: inbox?.subject || str(body.subject, 300) || null, parsed_by: callerEmail || 'cron' },
        ...opp,
      }).select('id').single()
      if (insErr) { console.error('[sal-ingest] insert failed:', insErr.message); continue }
      madeIds.push(made.id)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SCORE: the prefilter decides the cheap things; the model refines the rest.
    // ═══════════════════════════════════════════════════════════════════════
    const ids: number[] = [...madeIds, ...(Array.isArray(body.opportunity_ids) ? body.opportunity_ids.map(Number).filter(Boolean) : [])]
    const results: Any[] = []
    if (ids.length) {
      const { data: rows } = await sb.from('bid_opportunities').select('*').eq('company_id', companyId).in('id', ids)
      const profileText = [
        `Company: ${company?.company_name || ''}${company?.city ? `, ${company.city}` : ''}${company?.state ? `, ${company.state}` : ''}`,
        profile.capability_statement ? `About: ${profile.capability_statement}` : '',
        `Service lines: ${(profile.service_lines || []).map((l) => `${l.label || ''} [NAICS ${(l.naics || []).join('/') || '-'}; keywords ${(l.keywords || []).join(', ') || '-'}]`).join(' · ') || '(none set)'}`,
        `Service area: states ${(profile.service_area?.states || []).join(', ') || 'any'}${profile.service_area?.radius_km ? `, within ${profile.service_area.radius_km} km of home` : ''}`,
        `Job size: ${profile.value_min != null ? `$${profile.value_min}` : 'any'} to ${profile.value_max != null ? `$${profile.value_max}` : 'any'}`,
        `Certifications held: ${(profile.set_asides || []).join(', ') || 'none'}`,
        (profile as Any).licenses?.length ? `Licenses: ${JSON.stringify((profile as Any).licenses).slice(0, 600)}` : '',
        (profile as Any).bonding?.single_limit ? `Bonding: single $${(profile as Any).bonding.single_limit}, aggregate $${(profile as Any).bonding.aggregate_limit || '?'}` : 'Bonding: unknown',
        (profile as Any).learned?.summary ? `What they have chosen and dismissed before: ${(profile as Any).learned.summary}` : '',
      ].filter(Boolean).join('\n')

      for (const row of rows || []) {
        // A person's decision stands; only unscored or still-open rows are rescored.
        if (['chosen', 'building', 'ready', 'submitted', 'won', 'lost', 'no_award'].includes(row.status)) { results.push({ id: row.id, skipped: row.status }); continue }
        const pre = prefilter(row as OppLike, profile)
        let score: number | null = pre.score
        let reasons = [...pre.reasons]
        let blockers = [...pre.blockers]
        let effort: string | null = null
        let model: string | null = null
        if (pre.pass) {
          const fitPrompt = `You are Sal, a solicitation scout. Decide how well this solicitation fits this contractor and return ONLY a JSON object:
{ "score": 0-100, "reasons": ["3-5 short reasons, most important first"], "blockers": ["hard problems: a license or certification they lack, mandatory pre-bid already passed, bonding beyond capacity, prevailing-wage work they have not done — [] if none"], "effort": "small" | "medium" | "large", "go_no_go": "go" | "watch" | "no_go", "why": "one sentence" }
Score means: 90+ exactly their trade, their area, their size, nothing missing; 70 worth a look; 50 a stretch; under 30 not for them. Never mention price or estimate a price.

CONTRACTOR
${profileText}

SOLICITATION
Title: ${row.title}
Buyer: ${row.buyer || '?'} (${row.buyer_level || '?'})
Type: ${row.notice_type || '?'}${row.solicitation_number ? ` · ${row.solicitation_number}` : ''}
Summary: ${row.summary || '(none)'}
NAICS: ${(row.naics || []).join(', ') || '-'} · Commodity: ${(row.commodity_codes || []).join(', ') || '-'}
Set-aside: ${row.set_aside || 'none stated'}
Place: ${[row.place?.city, row.place?.state].filter(Boolean).join(', ') || 'not stated'}
Due: ${row.due_at || 'not stated'}${row.prebid_at ? ` · pre-bid ${row.prebid_at}${row.prebid_mandatory ? ' (mandatory)' : ''}` : ''}
Requirements: ${JSON.stringify(row.requirements || {}).slice(0, 800)}
Value stated: ${row.estimated_value_low ?? '-'} to ${row.estimated_value_high ?? '-'}
Prefilter said: ${pre.reasons.join('; ') || 'nothing'}`
          const fit = await ask('bid-fit', fitPrompt, 1200)
          if (fit.ok) {
            try {
              const f = parseJson(textOf(fit))
              const s = Number(f.score)
              if (Number.isFinite(s)) score = Math.max(0, Math.min(100, Math.round(s)))
              reasons = [...arr(f.reasons).slice(0, 6), ...(f.why ? [String(f.why).slice(0, 200)] : [])]
              blockers = [...blockers, ...arr(f.blockers).slice(0, 5)]
              effort = oneOf(f.effort, ['small', 'medium', 'large'])
              model = String(fit.data?.model || READ_MODEL)
            } catch { reasons.push('Sal could not read his own fit answer; prefilter score kept') }
          } else {
            reasons.push(fit.unavailable ? 'AI unavailable — prefilter score only' : `Fit scoring failed — prefilter score only`)
          }
        }
        const status = statusForScore(score, profile, pre)
        const patch: Record<string, Any> = {
          fit_score: score, fit_reasons: reasons, blockers, effort_estimate: effort, scored_at: new Date().toISOString(), score_model: model,
          status: row.status === 'shortlisted' && status === 'new' ? 'shortlisted' : status,
          updated_at: new Date().toISOString(),
        }
        if (status === 'dismissed' && row.status !== 'dismissed') { patch.dismissed_reason = 'auto'; patch.dismissed_by = 'sal'; patch.dismissed_at = new Date().toISOString() }
        await sb.from('bid_opportunities').update(patch).eq('id', row.id)
        if (status === 'new' && shouldNotify(score, profile) && row.scored_at == null) {
          await sb.from('company_notifications').insert({
            company_id: companyId, type: 'bid_match',
            title: `Sal: ${score}/100 — ${row.title}`,
            message: `${row.buyer || ''}${row.due_at ? ` · due ${new Date(row.due_at).toLocaleDateString('en-US', { timeZone: row.due_tz || 'America/Denver' })}` : ''} · ${reasons[0] || ''}`,
            metadata: { opportunity_id: row.id, route: '/agents/sal', source: 'sal' }, created_by: null,
          })
        }
        results.push({ id: row.id, score, status: patch.status, blockers: blockers.length })
      }
    }

    if (inbox) await sb.from('bid_inbox').update({ status: 'parsed', error: null, opportunity_ids: madeIds }).eq('id', inbox.id)
    return json({ ok: true, opportunities: madeIds, scored: results })
  } catch (err) {
    console.error('[sal-ingest]', err)
    return json({ error: (err as Error)?.message || 'Sal hit an error' }, 500)
  }
})
