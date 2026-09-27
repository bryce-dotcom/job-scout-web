// The two things in a bid packet a model writes (SAL_SCOUT_PLAN.md §5.7):
//   cover_letter — a transmittal letter from the profile's capability
//                  statement, the opportunity and the bid total. Editable on
//                  the page; never sent without a person reading it.
//   map_fields   — the buyer's fillable form has field names; we have the
//                  company, the profile and the bid. Which value goes where.
//                  Anything it is not sure of stays blank for a person.
// JWT identity + roster check, like benny-bid-intake. Metered as 'benny'.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callAnthropic } from '../_shared/anthropic.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const MODEL = 'claude-sonnet-5', FALLBACK = 'claude-sonnet-4-6'
// deno-lint-ignore no-explicit-any
type Any = any

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!, SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const svc = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' }
  try {
    const body = await req.json()
    const companyId = Number(body.company_id)
    const action = String(body.action || '')
    if (!companyId || !['cover_letter', 'map_fields'].includes(action)) return json({ error: 'company_id and action (cover_letter | map_fields) are required' }, 400)

    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in first' }, 401)
    const empRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id,name,email,user_role&company_id=eq.${companyId}&email=ilike.${encodeURIComponent(user.email)}&limit=1`, { headers: svc })
    const emp = (await empRes.json())?.[0]
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)

    // What the model may know about us. Never pay, never bank, never EINs
    // beyond what a bid form itself asks for (a W-9 is its own document).
    const [coRes, profRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/companies?select=company_name,legal_name,address,city,state,zip,phone,owner_email,website,entity_type,business_type,state_of_incorporation,ein,naics_code,license_number,insurance_provider,insurance_policy_number,insurance_expiration,workers_comp_policy,workers_comp_expiration,bonded,bond_amount,duns_number&id=eq.${companyId}&limit=1`, { headers: svc }),
      fetch(`${SUPABASE_URL}/rest/v1/bid_profiles?select=capability_statement,past_performance,key_personnel,licenses,bonding,federal,service_lines,signer_employee_id&company_id=eq.${companyId}&limit=1`, { headers: svc }),
    ])
    const company: Any = (await coRes.json())?.[0] || {}
    const profile: Any = (await profRes.json())?.[0] || {}
    let signer: Any = null
    if (profile.signer_employee_id) {
      const sRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=name,email,role,user_role&id=eq.${profile.signer_employee_id}&company_id=eq.${companyId}&limit=1`, { headers: svc })
      signer = (await sRes.json())?.[0] || null
    }
    const quoteId = Number(body.quote_id) || null
    let quote: Any = null, opp: Any = null
    if (quoteId) {
      const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?select=id,quote_id,estimate_name,quote_amount,bid_intake,bid_opportunity_id&id=eq.${quoteId}&company_id=eq.${companyId}&limit=1`, { headers: svc })
      quote = (await qRes.json())?.[0] || null
      if (quote?.bid_opportunity_id) {
        const oRes = await fetch(`${SUPABASE_URL}/rest/v1/bid_opportunities?select=title,buyer,buyer_level,solicitation_number,summary,due_at,submit_method,submit_to,requirements,set_aside,place&id=eq.${quote.bid_opportunity_id}&company_id=eq.${companyId}&limit=1`, { headers: svc })
        opp = (await oRes.json())?.[0] || null
      }
    }
    const intake: Any = quote?.bid_intake || {}
    const meta = { feature: 'bid-packet-ai', companyId }
    const ask = async (text: string, maxTokens = 3000) => {
      let r = await callAnthropic(meta, { model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: [{ type: 'text', text }] }] })
      if (!r.ok && r.status === 404) r = await callAnthropic(meta, { model: FALLBACK, max_tokens: maxTokens, messages: [{ role: 'user', content: [{ type: 'text', text }] }] })
      if (!r.ok) throw Object.assign(new Error(r.friendly || 'AI unavailable'), { status: 502, ai_unavailable: r.unavailable === true })
      return (r.data?.content || []).map((c: Any) => c.text || '').join('')
    }
    const context = `CONTRACTOR: ${company.legal_name || company.company_name || ''}${company.entity_type ? ` (${company.entity_type}${company.state_of_incorporation ? `, ${company.state_of_incorporation}` : ''})` : ''}; ${[company.address, company.city, company.state, company.zip].filter(Boolean).join(', ')}; ${company.phone || ''}; ${company.owner_email || ''}${company.website ? `; ${company.website}` : ''}
LICENSE: ${company.license_number || ''} ${(profile.licenses || []).map((l: Any) => `${l.state || ''} ${l.type || ''} ${l.number || ''}`).join('; ')}
NAICS: ${company.naics_code || ''}   UEI: ${profile.federal?.uei || ''}   CAGE: ${profile.federal?.cage || ''}   DUNS: ${company.duns_number || ''}
INSURANCE: ${company.insurance_provider || ''} ${company.insurance_policy_number || ''} through ${company.insurance_expiration || ''}; workers comp ${company.workers_comp_policy || ''} through ${company.workers_comp_expiration || ''}
BONDING: ${JSON.stringify(profile.bonding || {})}
CAPABILITY: ${profile.capability_statement || '(none written)'}
PAST PERFORMANCE: ${JSON.stringify((profile.past_performance || []).slice(0, 6))}
KEY PERSONNEL: ${JSON.stringify((profile.key_personnel || []).slice(0, 6))}
SIGNER: ${signer ? `${signer.name}${signer.role ? `, ${signer.role}` : ''}` : (emp.name || '')}
BID: ${quote ? `${quote.quote_id || quote.id} — ${quote.estimate_name || ''} — total $${Number(quote.quote_amount || 0).toFixed(2)}` : '(none)'}
SOLICITATION: ${opp ? `${opp.solicitation_number || ''} ${opp.title || ''} — ${opp.buyer || ''} (${opp.buyer_level || ''}); due ${opp.due_at || ''}; submit ${opp.submit_method || ''} ${JSON.stringify(opp.submit_to || {})}; set-aside ${opp.set_aside || 'none'}` : `${intake.bid_number || ''} ${intake.title || ''} — ${intake.buyer || ''}; due ${intake.due_at || ''}; submit ${intake.submit_to || ''}`}
REQUIREMENTS: ${JSON.stringify(opp?.requirements || intake.requirements || {}).slice(0, 2500)}`

    if (action === 'cover_letter') {
      const text = await ask(`You are Benny, writing the transmittal (cover) letter for a contractor's bid. Write it in plain, direct business English, first person plural, no hype, no adjectives that cannot be checked. 3–5 short paragraphs: (1) we submit our bid for <solicitation> in response to <buyer>'s <notice>; total bid amount in words and figures if known; (2) what makes us the right contractor — ONLY facts from the CONTEXT (licenses held, bonding, insurance, relevant past performance); do not invent projects, numbers or certifications; (3) acknowledgement of addenda if any are listed, and that the bid is firm for the period the solicitation states (say "the period stated in the solicitation" if unknown); (4) who to contact, with phone and email. Do not write a salutation line or a signature block — the page adds them. Return ONLY the letter body.

CONTEXT:
${context}`, 1800)
      return json({ ok: true, cover_letter: text.trim() })
    }

    // map_fields
    const fields: Any[] = Array.isArray(body.fields) ? body.fields.slice(0, 200) : []
    if (!fields.length) return json({ ok: true, values: {}, unsure: [] })
    const text = await ask(`You are Benny, filling a buyer's fillable bid form for a contractor. Below are the form's field names (and their types). Using ONLY the CONTEXT, decide the value for each field you are confident about. Return ONLY a JSON object:
{ "values": { "<field name>": "<value>" }, "unsure": ["<field name>", ...] }

Rules: text fields get strings; checkbox fields get "true" or "false" only when the context clearly decides them (e.g. an entity-type box); leave date-of-signature, signature, notary, bid-security-attached, and any price or amount fields OUT unless the field is plainly the total bid amount (then use the BID total). Do not guess an EIN, license or policy number the context does not state. Field names are often cryptic (e.g. "Text12"): use their order and any label-like text in them; when in doubt, list the field under "unsure".

FIELDS:
${fields.map((f) => `- ${f.name} [${f.type || 'text'}]${f.value ? ` (currently: ${String(f.value).slice(0, 40)})` : ''}`).join('\n')}

CONTEXT:
${context}`, 3500)
    let parsed: Any = { values: {}, unsure: [] }
    try { const m = text.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]) } catch { /* leave empty */ }
    const values: Record<string, string> = {}
    const names = new Set(fields.map((f) => String(f.name)))
    for (const [k, v] of Object.entries(parsed.values || {})) if (names.has(k) && v != null && String(v).trim() !== '') values[k] = String(v).slice(0, 500)
    return json({ ok: true, values, unsure: Array.isArray(parsed.unsure) ? parsed.unsure.filter((n: Any) => names.has(String(n))) : [] })
  } catch (err) {
    const e = err as Any
    return json({ error: e?.message || 'Benny hit an error', ai_unavailable: e?.ai_unavailable === true }, e?.status || 500)
  }
})
