// Dougie reads a bid package and builds the bid.
//
// Bryce's design (2026-09-25): an AI reads the customer's bid document and
// builds the bid in THEIR required format — a three-way product match
// (exact / equivalent-with-justification / must-source) — and any price it
// had to source lands redlined until a human ticks "verified" with a source
// link. A bid with an unverified sourced price cannot be sent
// (_shared/sourcedPricing.ts, enforced by send-estimate).
//
// Two passes, both through the AI wrapper so they are metered:
//   1. READ  — the package (PDF or page images) → the buyer's format and the
//              schedule of items, as JSON.
//   2. MATCH — each item against the tenant's own catalog candidates →
//              exact / equivalent / must_source, with the reasoning kept on
//              the line. A matched item takes the CATALOG price (never a
//              price the model typed); a must-source item takes the model's
//              estimate as sourced_price, flagged ai_sourced and unverified.
//
// Writes go through the estimate-intake contract (one place for every agent
// that produces a bid), so a bid is a header and its lines together or it
// is nothing.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { createEstimateFromIntakeRest, IntakeWriteError } from '../_shared/estimateIntakeRest.ts'
import { intakeLineRows, intakeTotal, type EstimateIntake, type IntakeLine } from '../_shared/estimateIntake.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const READ_MODEL = 'claude-sonnet-5'
const FALLBACK_MODEL = 'claude-sonnet-4-6'

// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const svc = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' }

  try {
    const body = await req.json()
    const companyId = Number(body.company_id)
    const mode: 'create' | 'fill' = body.mode === 'fill' ? 'fill' : 'create'
    const storagePath = String(body.storage_path || '')
    const bucket = String(body.storage_bucket || 'project-documents')
    const fileName = String(body.file_name || storagePath.split('/').pop() || 'bid-package.pdf')
    const mediaType = String(body.media_type || 'application/pdf')
    if (!companyId || !storagePath) return json({ error: 'company_id and storage_path are required' }, 400)

    // ── Who is asking. The JWT is the identity; the body only names the tenant.
    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in to use Dougie' }, 401)
    const empRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id,name,email&company_id=eq.${companyId}&email=ilike.${encodeURIComponent(user.email)}&limit=1`, { headers: svc })
    const emp = (await empRes.json())?.[0]
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)

    // ── The package itself, from storage.
    const fRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } })
    if (!fRes.ok) return json({ error: `Could not read the uploaded file (${fRes.status})` }, 400)
    const bytes = new Uint8Array(await fRes.arrayBuffer())
    if (bytes.length > 30 * 1024 * 1024) return json({ error: 'That package is over 30 MB — split it or send the bid schedule pages only' }, 413)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
    const b64 = btoa(bin)
    const docBlock = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }

    const meta = { feature: 'dougie-bid-intake', companyId }
    const ask = async (content: unknown[], maxTokens = 8192) => {
      let r = await callAnthropic(meta, { model: READ_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      if (!r.ok && r.status === 404) r = await callAnthropic(meta, { model: FALLBACK_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
      return r
    }
    const textOf = (r: any) => (r?.data?.content || []).map((c: any) => c.text || '').join('')
    const parseJson = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]) }

    // ── PASS 1: read the package.
    const readPrompt = `You are Dougie, a document reader for a field-services contractor. This is a bid package (an invitation to bid, request for quote, or bid form) the contractor received from a buyer. Read ALL of it and return ONLY a JSON object, no prose:

{
  "title": "short title of the solicitation",
  "bid_number": "the buyer's bid/ITB/RFQ number, or null",
  "buyer": "the buying organization and department, as printed",
  "project": "the project or site name, or null",
  "due_at": "ISO 8601 date-time the bid is due, or null",
  "submit_to": "how/where to submit (portal, address, email), or null",
  "instructions": "1-4 sentences of the submission rules that matter (format, sealed, alternates, bonding), or null",
  "acknowledgements": ["each addendum or acknowledgement the bidder must initial, as printed"],
  "columns": ["the column headings of the bid schedule as printed, e.g. Item, Description, Qty, Unit, Unit Price, Extended"],
  "sections": [
    { "name": "section heading as printed (e.g. Base Bid, Alternate 1)",
      "items": [
        { "item_no": "the buyer's item number as printed", "description": "short description as printed", "spec": "the full specification text for this item, verbatim where possible", "quantity": 12, "unit": "EA" }
      ] }
  ]
}

Rules: keep the buyer's item numbers and order exactly. quantity is a number (use 1 for lump sum). unit is the printed unit (EA, LF, SF, LS, HR...). Include EVERY schedule item, including alternates and allowances, in their own sections. Do not invent items or prices.`
    const read = await ask([docBlock, { type: 'text', text: readPrompt }], 12000)
    if (!read.ok) return json({ error: read.friendly, ai_unavailable: read.unavailable === true }, 502)
    let pkg: any
    try { pkg = parseJson(textOf(read)) } catch { return json({ error: 'Dougie could not make out a bid schedule in that document', raw: textOf(read).slice(0, 2000) }, 422) }
    const items: any[] = []
    for (const sec of pkg.sections || []) for (const it of sec.items || []) items.push({ ...it, section: sec.name || 'Schedule of Items' })
    if (items.length === 0) return json({ error: 'Dougie read the document but found no schedule of items in it' }, 422)

    // ── Catalog candidates: the tenant's own price book, narrowed per item by word overlap.
    const catRes = await fetch(`${SUPABASE_URL}/rest/v1/products_services?select=*&company_id=eq.${companyId}&limit=4000`, { headers: svc })
    const catalog: any[] = catRes.ok ? await catRes.json() : []
    const active = catalog.filter((p) => p.active !== false && p.is_active !== false && p.status !== 'inactive')
    const priceOf = (p: any) => Number(p.price ?? p.unit_price ?? p.sell_price ?? p.default_price ?? 0) || 0
    const tokens = (s: string) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2))
    const catTokens = active.map((p) => tokens([p.name, p.description, p.manufacturer, p.model_number, p.product_category].filter(Boolean).join(' ')))
    const candidateIds = new Set<number>()
    for (const it of items) {
      const t = tokens(`${it.description} ${it.spec}`)
      const scored = active.map((p, i) => { let n = 0; for (const w of t) if (catTokens[i].has(w)) n++; return { p, n } })
        .filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 12)
      for (const x of scored) candidateIds.add(Number(x.p.id))
    }
    const candidates = active.filter((p) => candidateIds.has(Number(p.id))).slice(0, 250)
    const candText = candidates.map((p) => `#${p.id} | ${p.name}${p.manufacturer ? ` | ${p.manufacturer}` : ''}${p.model_number ? ` ${p.model_number}` : ''}${p.product_category ? ` | ${p.product_category}` : ''} | $${priceOf(p).toFixed(2)}${p.description ? ` | ${String(p.description).slice(0, 140)}` : ''}`).join('\n')

    // ── PASS 2: match.
    const matchPrompt = `You are Dougie, pricing a bid for a contractor. For each of the buyer's items, decide how the contractor's own catalog covers it. Return ONLY a JSON object:

{ "matches": [ { "item_no": "...", "match_kind": "exact" | "equivalent" | "must_source", "item_id": 123 or null, "justification": "one or two sentences", "estimated_unit_price": 0.00, "price_basis": "what the estimate is based on" } ] }

Rules:
- "exact": the catalog product IS the specified item (same manufacturer/model, or the spec is generic and the product meets every stated attribute). item_id required.
- "equivalent": a catalog product meets the intent and performance but differs in brand/model; say in justification exactly what differs and why it is acceptable ("or equal" language). item_id required.
- "must_source": nothing in the catalog covers it (or it is labor/service/allowance the catalog does not carry). item_id null. Give estimated_unit_price = your best market estimate for the contractor's cost-plus unit price, and price_basis = what that rests on (typical distributor pricing, comparable products, trade rates). Be honest that it is an estimate.
- Never invent catalog ids. Use only the candidates listed. If the candidate list is empty for an item, it is must_source.
- Output one entry per item, same item_no as given.

BUYER'S ITEMS:
${items.map((it) => `- item_no ${it.item_no || '?'} [${it.section}] qty ${it.quantity} ${it.unit || ''}: ${it.description}${it.spec ? ` — SPEC: ${String(it.spec).slice(0, 600)}` : ''}`).join('\n')}

CONTRACTOR'S CATALOG CANDIDATES:
${candText || '(none)'}`
    const match = await ask([{ type: 'text', text: matchPrompt }], 12000)
    if (!match.ok) return json({ error: match.friendly, ai_unavailable: match.unavailable === true }, 502)
    let matches: any[] = []
    try { matches = parseJson(textOf(match)).matches || [] } catch { matches = [] }
    const byNo = new Map<string, any>(matches.map((m) => [String(m.item_no), m]))
    const catById = new Map<number, any>(candidates.map((p) => [Number(p.id), p]))

    // ── Lines, through the intake contract.
    const lines: IntakeLine[] = items.map((it) => {
      const m = byNo.get(String(it.item_no)) || {}
      const kind = ['exact', 'equivalent', 'must_source'].includes(m.match_kind) ? m.match_kind : 'must_source'
      const prod = kind !== 'must_source' && m.item_id != null ? catById.get(Number(m.item_id)) : null
      const qty = Number(it.quantity) || 1
      if (prod) {
        const price = priceOf(prod)
        return {
          item_name: prod.name, description: it.spec || it.description || null, item_id: prod.id, quantity: qty, price,
          unit_of_measure: it.unit || prod.unit_of_measure || null, notes: m.justification || null,
          price_source: 'catalog', match_kind: kind, match_note: m.justification || null,
          bid_item_no: it.item_no || null, bid_spec: it.spec || it.description || null,
        }
      }
      const est = Math.max(0, Number(m.estimated_unit_price) || 0)
      return {
        item_name: it.description || 'Bid item', description: it.spec || null, item_id: null, quantity: qty, price: est,
        unit_of_measure: it.unit || null, notes: m.justification || null,
        price_source: 'ai_sourced', sourced_price: est, source_note: m.price_basis || m.justification || 'Dougie\'s market estimate — verify before sending',
        match_kind: 'must_source', match_note: m.justification || null,
        bid_item_no: it.item_no || null, bid_spec: it.spec || it.description || null,
      }
    })

    const bidIntake = {
      title: pkg.title || null, bid_number: pkg.bid_number || null, buyer: pkg.buyer || null, project: pkg.project || null,
      due_at: pkg.due_at || null, submit_to: pkg.submit_to || null, instructions: pkg.instructions || null,
      acknowledgements: Array.isArray(pkg.acknowledgements) ? pkg.acknowledgements : [],
      columns: Array.isArray(pkg.columns) && pkg.columns.length ? pkg.columns : null,
      sections: (pkg.sections || []).map((s: any) => ({ name: s.name || 'Schedule of Items', item_nos: (s.items || []).map((i: any) => i.item_no).filter(Boolean) })),
      source_document: { bucket, path: storagePath, name: fileName },
      read_at: new Date().toISOString(), read_by: emp.email || null, model: READ_MODEL,
    }
    const estimateName = [pkg.bid_number, pkg.project || pkg.title].filter(Boolean).join(' — ') || fileName
    const target = { baseUrl: SUPABASE_URL, headers: svc }
    const patchQuote = async (quoteId: number, extra: Record<string, unknown>) => {
      await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&company_id=eq.${companyId}`, { method: 'PATCH', headers: svc, body: JSON.stringify(extra) })
    }

    let quoteId: number
    if (mode === 'fill') {
      quoteId = Number(body.quote_id)
      if (!quoteId) return json({ error: 'quote_id is required to fill an existing bid' }, 400)
      const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?select=id,settings_overrides,estimate_name&id=eq.${quoteId}&company_id=eq.${companyId}&limit=1`, { headers: svc })
      const q = (await qRes.json())?.[0]
      if (!q) return json({ error: 'That estimate is not in this company' }, 404)
      const lRes = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines?select=id&quote_id=eq.${quoteId}&limit=1`, { headers: svc })
      if (((await lRes.json()) || []).length) return json({ error: 'That estimate already has line items. Dougie only fills an empty one — make a new bid instead.' }, 409)
      const intake: EstimateIntake = { source: 'dougie-bid', company_id: companyId, lines }
      const rows = intakeLineRows(intake, quoteId)
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/quote_lines`, { method: 'POST', headers: { ...svc, Prefer: 'return=representation' }, body: JSON.stringify(rows) })
      const made = ins.ok ? await ins.json() : null
      if (!Array.isArray(made) || made.length !== rows.length) return json({ error: `Lines failed to write: ${ins.status} ${(await ins.text()).slice(0, 300)}` }, 500)
      await patchQuote(quoteId, {
        quote_amount: intakeTotal(intake), document_type: 'bid', bid_intake: bidIntake,
        estimate_name: q.estimate_name || estimateName,
        settings_overrides: { ...(q.settings_overrides || {}), presentation_mode: 'bid' },
        updated_at: new Date().toISOString(),
      })
    } else {
      const intake: EstimateIntake = {
        source: 'dougie-bid', company_id: companyId,
        lead_id: body.lead_id ? Number(body.lead_id) : null, customer_id: body.customer_id ? Number(body.customer_id) : null,
        salesperson_id: body.salesperson_id ? Number(body.salesperson_id) : emp.id,
        business_unit: body.business_unit || null, service_type: body.service_type || null,
        estimate_name: estimateName, summary: pkg.title ? `${pkg.title}${pkg.buyer ? ` — ${pkg.buyer}` : ''}` : null,
        notes: pkg.instructions || null, status: 'Draft', lines,
      }
      try {
        const made = await createEstimateFromIntakeRest(target, intake, { advanceLeadTo: null })
        quoteId = made.quoteId
      } catch (e) {
        if (e instanceof IntakeWriteError) return json({ error: e.message, kind: e.kind }, e.kind === 'invalid' ? 400 : 500)
        throw e
      }
      await patchQuote(quoteId, { document_type: 'bid', bid_intake: bidIntake, settings_overrides: { presentation_mode: 'bid' } })
    }

    // The package rides along as a document on the estimate.
    await fetch(`${SUPABASE_URL}/rest/v1/file_attachments`, { method: 'POST', headers: svc, body: JSON.stringify({
      company_id: companyId, quote_id: quoteId, file_name: fileName, file_path: storagePath, storage_bucket: bucket,
      file_type: mediaType, file_size: bytes.length, photo_context: 'bid_package', created_by: emp.id, // employees.id — the column is a bigint
    }) }).catch(() => {})

    const counts = { exact: 0, equivalent: 0, must_source: 0 }
    for (const l of lines) counts[(l.match_kind || 'must_source') as keyof typeof counts]++
    return json({ ok: true, quote_id: quoteId, mode, lines: lines.length, counts, unverified: counts.must_source,
      read: { title: bidIntake.title, bid_number: bidIntake.bid_number, buyer: bidIntake.buyer, due_at: bidIntake.due_at, sections: bidIntake.sections.length } })
  } catch (err) {
    console.error('[dougie-bid-intake]', err)
    return json({ error: (err as Error)?.message || 'Dougie hit an error' }, 500)
  }
})
