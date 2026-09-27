// Vercel cron — SAM.gov, once a day.
//
// The one official API among the bid sources (SAL_SCOUT_PLAN.md §3). One
// platform key, SAM_API_KEY: a personal key allows about ten calls a day, an
// entity-registered key about a thousand, so the poll is one call per STATE
// per day and the per-tenant NAICS filter runs here, not on the API. Every
// tenant with a SAM source in that state shares the same call.
//
// Rows are structured, so they skip the parser and land straight on
// bid_opportunities; sal-ingest then scores them (opportunity_ids mode).
// The notice's description is a second authenticated call per row and
// attachments are more, so neither is fetched here; the title, NAICS,
// set-aside, place and deadline are what the prefilter and the fit score
// need, and the package is fetched when a person chooses (Phase 2).
//
// Auth: Vercel's cron header, or a CRON_SECRET bearer for a manual run.

const { createClient } = require('@supabase/supabase-js')
const { dedupeHash } = require('../_lib/bidFitNode.cjs')

const SAM_URL = 'https://api.sam.gov/opportunities/v2/search'
const TYPE_LABEL = { o: 'ifb', k: 'ifb', p: 'presolicitation', r: 'sources_sought', s: 'other', a: 'award', u: 'other', g: 'other', i: 'other' }
const SKIP_TYPES = new Set(['a', 'u', 'g', 'i']) // awards, J&As, sale of surplus, ITBs for "intent to bundle"
const mmddyyyy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) return res.status(401).json({ error: 'unauthorized' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: sources } = await sb.from('bid_sources').select('id, company_id, config').eq('kind', 'sam').eq('enabled', true)
  if (!sources?.length) return res.status(200).json({ ok: true, sources: 0 })

  const samKey = process.env.SAM_API_KEY
  if (!samKey) {
    // Say so on every source rather than silently polling nothing.
    for (const s of sources) await sb.from('bid_sources').update({ health: 'error', error_text: 'SAM_API_KEY is not set on the server — register the platform at sam.gov and add the key', last_polled_at: new Date().toISOString() }).eq('id', s.id)
    return res.status(200).json({ ok: false, error: 'SAM_API_KEY not set', sources: sources.length })
  }

  // Which states, across every tenant. A source with no states polls nothing.
  const byState = new Map()
  for (const s of sources) for (const st of (s.config?.states || []).map((x) => String(x).toUpperCase())) {
    if (!byState.has(st)) byState.set(st, [])
    byState.get(st).push(s)
  }
  const lookback = Number(req.query?.days) || 2
  const from = new Date(Date.now() - lookback * 86400000)
  const to = new Date()
  const out = { states: byState.size, fetched: 0, inserted: 0, scored: 0, errors: [] }
  const touched = new Map() // company_id -> new opportunity ids

  for (const [state, srcs] of byState) {
    let rows = []
    try {
      const q = new URLSearchParams({ api_key: samKey, postedFrom: mmddyyyy(from), postedTo: mmddyyyy(to), state, limit: '1000', offset: '0' })
      const r = await fetch(`${SAM_URL}?${q}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`)
      rows = Array.isArray(j.opportunitiesData) ? j.opportunitiesData : []
      out.fetched += rows.length
    } catch (e) {
      out.errors.push(`${state}: ${e.message}`)
      for (const s of srcs) await sb.from('bid_sources').update({ health: 'error', error_text: String(e.message).slice(0, 300), last_polled_at: new Date().toISOString() }).eq('id', s.id)
      continue
    }
    for (const s of srcs) {
      const naics = (s.config?.naics || []).map(String)
      let newest = null
      for (const o of rows) {
        if (SKIP_TYPES.has(String(o.type || '').toLowerCase().slice(0, 1)) && !/solicitation|combined/i.test(o.type || '')) { /* keep: type field is a word in v2 */ }
        const typeWord = String(o.type || '').toLowerCase()
        if (/award|justification|surplus|intent to bundle/.test(typeWord)) continue
        if (naics.length && !naics.some((n) => String(o.naicsCode || '').startsWith(n))) continue
        const pop = o.placeOfPerformance || {}
        const poc = Array.isArray(o.pointOfContact) ? o.pointOfContact[0] : null
        const opp = {
          title: String(o.title || 'Untitled').slice(0, 300),
          buyer: [o.fullParentPathName || o.organizationName || o.department, o.subTier, o.office].filter(Boolean).join(' / ').slice(0, 200) || 'Federal',
          buyer_level: 'federal',
          solicitation_number: o.solicitationNumber || null,
          notice_type: /combined|solicitation/.test(typeWord) ? 'ifb' : /presol/.test(typeWord) ? 'presolicitation' : /sources/.test(typeWord) ? 'sources_sought' : /special/.test(typeWord) ? 'other' : TYPE_LABEL[typeWord.slice(0, 1)] || 'other',
          summary: null,
          naics: o.naicsCode ? [String(o.naicsCode)] : [],
          commodity_codes: o.classificationCode ? [String(o.classificationCode)] : [],
          set_aside: o.typeOfSetAsideDescription || o.typeOfSetAside || null,
          place: { address: pop.streetAddress || null, city: pop.city?.name || pop.city || null, state: (pop.state?.code || pop.state || state || null) && String(pop.state?.code || pop.state || state).toUpperCase().slice(0, 2), zip: pop.zip || null },
          posted_at: o.postedDate ? new Date(o.postedDate).toISOString() : null,
          due_at: o.responseDeadLine ? new Date(o.responseDeadLine).toISOString() : null,
          due_tz: null,
          submit_method: poc?.email ? 'email' : 'unknown',
          submit_to: poc ? { email: poc.email || null, contact_name: poc.fullName || poc.fullname || null, contact_phone: poc.phone || null, portal_url: o.uiLink || null } : (o.uiLink ? { portal_url: o.uiLink } : null),
          url: o.uiLink || `https://sam.gov/opp/${o.noticeId}/view`,
          documents: Array.isArray(o.resourceLinks) ? o.resourceLinks.map((u) => ({ name: String(u).split('/').pop() || 'attachment', url: u, fetched_at: null, from: 'sam' })) : [],
        }
        const hash = dedupeHash(opp)
        const { data: ins, error } = await sb.from('bid_opportunities').upsert({
          company_id: s.company_id, source_id: s.id, source_kind: 'sam', source_ref: o.noticeId || null, dedupe_hash: hash, status: 'new',
          raw: { noticeId: o.noticeId, type: o.type, active: o.active, description_url: o.description || null }, ...opp,
        }, { onConflict: 'company_id,dedupe_hash', ignoreDuplicates: true }).select('id')
        if (error) { out.errors.push(`co${s.company_id}: ${error.message}`); continue }
        if (ins?.length) {
          out.inserted++
          if (!touched.has(s.company_id)) touched.set(s.company_id, [])
          touched.get(s.company_id).push(ins[0].id)
          newest = newest && newest > opp.posted_at ? newest : opp.posted_at
        }
      }
      await sb.from('bid_sources').update({ health: 'ok', error_text: null, last_polled_at: new Date().toISOString(), ...(newest ? { last_item_at: newest } : {}) }).eq('id', s.id)
    }
  }

  // Score what is new, per tenant, through the one scorer.
  for (const [companyId, ids] of touched) {
    for (let i = 0; i < ids.length; i += 15) {
      try {
        const r = await fetch(`${url}/functions/v1/sal-ingest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
          body: JSON.stringify({ company_id: companyId, opportunity_ids: ids.slice(i, i + 15) }),
        })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.ok) out.scored += (j.scored || []).length
        else out.errors.push(`score co${companyId}: ${j.error || r.status}`)
        if (j.ai_unavailable) break
      } catch (e) { out.errors.push(`score co${companyId}: ${e.message}`) }
    }
  }
  return res.status(200).json({ ok: out.errors.length === 0, ...out })
}
