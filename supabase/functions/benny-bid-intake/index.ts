// Benny reads a bid package and builds the bid.
//
// Bryce's design (2026-09-25): an AI reads the customer's bid document and
// builds the bid in THEIR required format — a three-way product match
// (exact / equivalent-with-justification / must-source) — and any price it
// had to source lands redlined until a human ticks "verified" with a source
// link. A bid with an unverified sourced price cannot be sent
// (_shared/sourcedPricing.ts, enforced by send-estimate).
//
// The passes, every one through the AI wrapper so it is metered:
//   READ     the package (PDF or page images) → the buyer's format and the
//            schedule of items, as JSON.
//   TAKEOFF  only when READ found no schedule: the document is a set of
//            drawings (Bryce, 2026-09-26, a real house plan: "bid the
//            electrical"). Benny counts what is drawn — service, openings,
//            fixtures, devices, circuits — and says on every line whether
//            he counted or estimated it. Quantities are HIS, said so on the
//            bid, verified by a person like a sourced price.
//   MATCH    each item against the tenant's own catalog candidates →
//            exact / equivalent / must_source, with the reasoning kept on
//            the line. A matched item takes the CATALOG price (never a
//            price the model typed).
//   PRICE    must-source items are priced from the web with the supplier
//            page on the line — still redlined until a person verifies.
//   WRITE    lines through the estimate-intake contract (one place for
//            every agent that produces a bid), so a bid is a header and its
//            lines together or it is nothing.
//
// WHY STAGES. An Edge Function worker gets about 150 seconds. A bid form is
// two passes and fits; a plan takeoff is four passes of about a minute each
// and does not. So a build is a benny_jobs row and each stage is its own
// request: it saves what it produced and kicks the next stage with the
// service key. The upload card still gets its answer in one request (a bid
// form runs the stages inline); Sal hands over with opportunity_id and is
// answered at once, and Benny reports back to the opportunity when done.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { callAnthropic } from '../_shared/anthropic.ts'
import { createEstimateFromIntakeRest, fillEstimateFromIntakeRest, IntakeWriteError } from '../_shared/estimateIntakeRest.ts'
import { intakeLineRows, intakeTotal, type EstimateIntake, type IntakeLine } from '../_shared/estimateIntake.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const READ_MODEL = 'claude-sonnet-5'
const FALLBACK_MODEL = 'claude-sonnet-4-6'

// deno-lint-ignore no-explicit-any
type Any = any

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const svc = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json' }

const textOf = (r: Any) => (r?.data?.content || []).map((c: Any) => c.text || '').join('')
const parseJson = (t: string) => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error('no JSON in reply'); return JSON.parse(m[0]) }

class StageError extends Error {
  status: number; extra: Record<string, unknown>
  constructor(message: string, status = 422, extra: Record<string, unknown> = {}) { super(message); this.status = status; this.extra = extra }
}

// ─────────────────────────────────────────────────────────────────────────────
// The job row
type Job = {
  id: number; company_id: number; opportunity_id: number | null; requested_by: string | null; employee_id: number | null
  mode: 'create' | 'fill'; quote_id: number | null; lead_id: number | null; customer_id: number | null; salesperson_id: number | null
  business_unit: string | null; service_type: string | null
  storage_bucket: string; storage_path: string; file_name: string | null; media_type: string; file_size: number | null; scope_hint: string | null
  stage: string; state: Any; error: string | null
  extra_paths?: Any[]
}
async function loadJob(id: number): Promise<Job | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/benny_jobs?id=eq.${id}&limit=1`, { headers: svc })
  return r.ok ? ((await r.json())?.[0] ?? null) : null
}
async function saveJob(job: Job, patch: Partial<Job> & { finished_at?: string }) {
  Object.assign(job, patch)
  await fetch(`${SUPABASE_URL}/rest/v1/benny_jobs?id=eq.${job.id}`, { method: 'PATCH', headers: svc, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) })
}

// Sal's opportunity, when there is one: ready with the quote, or chosen with the reason.
async function reportToSal(job: Job) {
  if (!job.opportunity_id) return
  const patch = job.stage === 'done' && job.quote_id
    ? { status: 'ready', quote_id: job.quote_id, build_error: null, updated_at: new Date().toISOString() }
    : { status: 'chosen', build_error: String(job.error || 'Benny stopped').slice(0, 500), updated_at: new Date().toISOString() }
  await fetch(`${SUPABASE_URL}/rest/v1/bid_opportunities?id=eq.${job.opportunity_id}&company_id=eq.${job.company_id}`, { method: 'PATCH', headers: svc, body: JSON.stringify(patch) }).catch(() => {})
}

// The next stage, as its own request. Fire-and-forget: the caller is answered now.
function kick(jobId: number) {
  const p = fetch(`${SUPABASE_URL}/functions/v1/benny-bid-intake`, { method: 'POST', headers: svc, body: JSON.stringify({ job_id: jobId }) })
    .then((r) => { if (!r.ok) console.warn('[benny] kick returned', r.status) })
    .catch((e) => console.warn('[benny] kick failed:', (e as Error)?.message))
  const rt = (globalThis as Any).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(p)
}

// ─────────────────────────────────────────────────────────────────────────────
// The document, from storage, as a content block.
async function docBlockFor(job: Job): Promise<{ block: Any; bytes: number }> {
  const fRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${job.storage_bucket}/${job.storage_path}`, { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } })
  if (!fRes.ok) throw new StageError(`Could not read the uploaded file (${fRes.status})`, 400)
  const bytes = new Uint8Array(await fRes.arrayBuffer())
  if (bytes.length > 30 * 1024 * 1024) throw new StageError('That package is over 30 MB — split it or send the bid schedule pages only', 413)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)))
  const b64 = btoa(bin)
  const block = job.media_type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: job.media_type, data: b64 } }
  return { block, bytes: bytes.length }
}

// Every document in the package, primary first: bid form + specs + addenda
// read together (SAL_SCOUT_PLAN §5.6.1). Each file keeps the 30 MB cap; the
// set is capped at 60 MB — beyond that the extras are dropped with a note so
// the build still runs on the form.
async function docBlocksFor(job: Job): Promise<{ blocks: Any[]; bytes: number; dropped: string[] }> {
  const primary = await docBlockFor(job)
  const blocks: Any[] = [primary.block]; let total = primary.bytes; const dropped: string[] = []
  for (const x of (job.extra_paths || [])) {
    try {
      const sub = { ...job, storage_bucket: x.bucket || job.storage_bucket, storage_path: x.path, media_type: x.media_type || 'application/pdf' } as Job
      const b = await docBlockFor(sub)
      if (total + b.bytes > 60 * 1024 * 1024) { dropped.push(x.name || x.path); continue }
      blocks.push(b.block); total += b.bytes
    } catch (e) { dropped.push(`${x.name || x.path} (${(e as Error)?.message || 'unreadable'})`) }
  }
  return { blocks, bytes: total, dropped }
}

const askFor = (companyId: number) => async (content: unknown[], maxTokens = 8192) => {
  const meta = { feature: 'benny-bid-intake', companyId }
  let r = await callAnthropic(meta, { model: READ_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
  if (!r.ok && r.status === 404) r = await callAnthropic(meta, { model: FALLBACK_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] })
  if (!r.ok) throw new StageError(r.friendly || 'AI unavailable', 502, { ai_unavailable: r.unavailable === true })
  return r
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE: read
async function stageRead(job: Job) {
  const ask = askFor(job.company_id)
  const { blocks, bytes, dropped } = await docBlocksFor(job)
  const readPrompt = `You are Benny, a bid builder for a field-services contractor. This is a bid package (an invitation to bid, request for quote, or bid form) the contractor received from a buyer — possibly several documents (bid form, specifications, addenda): read them together, and let an addendum's changes win. Read ALL of it and return ONLY a JSON object, no prose:

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

Rules: keep the buyer's item numbers and order exactly. quantity is a number (use 1 for lump sum). unit is the printed unit (EA, LF, SF, LS, HR...). Include EVERY schedule item, including alternates and allowances, in their own sections. Do not invent items or prices. If the document is a set of DRAWINGS with no bid schedule at all, return sections: [] and say so in instructions.`
  const read = await ask([...blocks, { type: 'text', text: readPrompt }], 12000)
  let pkg: Any
  try { pkg = parseJson(textOf(read)) } catch { throw new StageError('Benny could not make out a bid schedule in that document', 422, { raw: textOf(read).slice(0, 2000) }) }
  const items: Any[] = []
  for (const sec of pkg.sections || []) for (const it of sec.items || []) items.push({ ...it, section: sec.name || 'Schedule of Items' })
  await saveJob(job, { file_size: bytes, state: { ...job.state, pkg, items, dropped_docs: dropped }, stage: items.length ? 'match' : 'takeoff' })
}

// STAGE: takeoff — no schedule → count the drawings
async function stageTakeoff(job: Job) {
  const ask = askFor(job.company_id)
  const { blocks } = await docBlocksFor(job)
  const scope = String(job.scope_hint || '').slice(0, 600)
  const takeoffPrompt = `You are Benny, an estimator for a field-services contractor. This document has NO bid schedule: it is a set of drawings (plans, elevations, electrical/mechanical sheets, schedules). Produce a trade TAKEOFF from it so the contractor can bid.${scope ? `\n\nThe scope requested: ${scope}` : ''}
If no scope is stated, infer the trade from the sheets (electrical, lighting, plumbing, HVAC, etc.) and say which.

Return ONLY a JSON object, no prose:
{
  "title": "short title: <trade> — <project name>",
  "buyer": "the owner or GC named on the sheets, or null",
  "project": "the project or address on the title block, or null",
  "trade": "electrical" | "lighting" | "plumbing" | "hvac" | "other",
  "sheets_read": ["A-1 Floor Plan", "E-1 Electrical Plan", ...],
  "assumptions": ["what you assumed where the drawings were silent, e.g. service size, fixture allowance, code cycle"],
  "not_shown": ["scope the sheets do not show that a bidder must clarify"],
  "confidence": "counted" | "mixed" | "estimated",
  "sections": [
    { "name": "Service & Distribution",
      "items": [ { "item_no": "T-1", "description": "200A overhead service w/ meter base and 40-space panel", "spec": "E-1 panel note; 200A assumed", "quantity": 1, "unit": "LS", "confidence": "estimated" } ] },
    { "name": "Rough-in openings", "items": [ { "item_no": "T-2", "description": "Duplex receptacle opening, 15/20A", "spec": "Counted on E-1: 34 total", "quantity": 34, "unit": "EA", "confidence": "counted" } ] }
  ]
}

Rules for an ELECTRICAL takeoff: sections in this order — Service & Distribution; Dedicated circuits (range, oven, dryer, HVAC, water heater, disposal, dishwasher, microwave, EV); Rough-in openings (duplex, GFCI/WR, switches: single-pole, 3-way, 4-way, dimmer); Lighting fixtures (recessed cans, surface/ceiling, pendants, exterior, under-cabinet, fans with light); Life safety (smoke, smoke/CO, combination); Exhaust fans; Low voltage (data, TV, doorbell, thermostat); Permit & inspection (LS 1); Labor (rough-in HR, trim-out HR — estimate from the openings). Count every symbol on every electrical sheet; if the electrical is drawn on the floor plans, count there. Say in spec WHERE each count came from. Owner-supplied fixtures still need an install line. Never write a price. quantity is a number; unit is EA, LF, LS or HR. Be terse: spec is ONE short clause (under 100 characters), at most 40 items in total, no prose outside the JSON.`
  const tk = await ask([...blocks, { type: 'text', text: takeoffPrompt }], 16000)
  if (tk.data?.stop_reason === 'max_tokens') throw new StageError('Benny ran out of room writing the takeoff — the plan set is very large; send the electrical sheets only', 422, { raw: textOf(tk).slice(-800) })
  let takeoff: Any
  try { takeoff = parseJson(textOf(tk)) } catch { throw new StageError('Benny read the document but found neither a schedule of items nor drawings he could take off', 422, { raw: textOf(tk).slice(0, 2000) }) }
  const items: Any[] = []
  for (const sec of takeoff.sections || []) for (const it of sec.items || []) items.push({ ...it, section: sec.name || 'Takeoff', spec: `${it.confidence === 'counted' ? 'Counted' : 'Estimated'} by Benny — ${it.spec || ''}`.trim() })
  if (items.length === 0) throw new StageError('Benny read the document but found no schedule of items and nothing to take off', 422)
  const pkg0 = job.state.pkg || {}
  const pkg = {
    ...pkg0,
    title: pkg0.title || takeoff.title || null, buyer: pkg0.buyer || takeoff.buyer || null, project: pkg0.project || takeoff.project || null,
    instructions: [
      `AI TAKEOFF FROM PLANS (${takeoff.trade || 'trade'}; ${takeoff.confidence || 'mixed'} confidence) — every quantity is Benny's count from the sheets, not the buyer's schedule. Verify counts against the drawings before sending.`,
      (takeoff.assumptions || []).length ? `Assumed: ${(takeoff.assumptions || []).join('; ')}` : '',
      (takeoff.not_shown || []).length ? `Not shown on the sheets — clarify with the buyer: ${(takeoff.not_shown || []).join('; ')}` : '',
      pkg0.instructions || '',
    ].filter(Boolean).join('\n'),
    columns: pkg0.columns?.length ? pkg0.columns : ['Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Extended'],
    sections: takeoff.sections || [],
  }
  const takeoffMeta = { trade: takeoff.trade || null, confidence: takeoff.confidence || null, sheets_read: takeoff.sheets_read || [], assumptions: takeoff.assumptions || [], not_shown: takeoff.not_shown || [] }
  await saveJob(job, { state: { ...job.state, pkg, items, takeoff: takeoffMeta }, stage: 'match' })
}

// STAGE: match — the tenant's own price book, narrowed per item by word overlap
async function stageMatch(job: Job) {
  const ask = askFor(job.company_id)
  const items: Any[] = job.state.items || []
  const catRes = await fetch(`${SUPABASE_URL}/rest/v1/products_services?select=*&company_id=eq.${job.company_id}&limit=4000`, { headers: svc })
  const catalog: Any[] = catRes.ok ? await catRes.json() : []
  const active = catalog.filter((p) => p.active !== false && p.is_active !== false && p.status !== 'inactive')
  const priceOf = (p: Any) => Number(p.price ?? p.unit_price ?? p.sell_price ?? p.default_price ?? 0) || 0
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

  const matchPrompt = `You are Benny, pricing a bid for a contractor. For each of the buyer's items, decide how the contractor's own catalog covers it. Return ONLY a JSON object:

{ "matches": [ { "item_no": "...", "match_kind": "exact" | "equivalent" | "must_source", "item_id": 123 or null, "justification": "one or two sentences", "estimated_unit_price": 0.00, "price_basis": "what the estimate is based on" } ] }

Rules:
- "exact": the catalog product IS the specified item (same manufacturer/model, or the spec is generic and the product meets every stated attribute). item_id required.
- "equivalent": a catalog product meets the intent and performance but differs in brand/model; say in justification exactly what differs and why it is acceptable ("or equal" language). item_id required.
- "must_source": nothing in the catalog covers it (or it is labor/service/allowance the catalog does not carry). item_id null. Give estimated_unit_price = your best market estimate for the contractor's cost-plus unit price, and price_basis = what that rests on (typical distributor pricing, comparable products, trade rates). Be honest that it is an estimate.
- Never invent catalog ids. Use only the candidates listed. If the candidate list is empty for an item, it is must_source.
- Output one entry per item, same item_no as given. Keep justification under 160 characters.

BUYER'S ITEMS:
${items.map((it) => `- item_no ${it.item_no || '?'} [${it.section}] qty ${it.quantity} ${it.unit || ''}: ${it.description}${it.spec ? ` — SPEC: ${String(it.spec).slice(0, 600)}` : ''}`).join('\n')}

CONTRACTOR'S CATALOG CANDIDATES:
${candText || '(none)'}`
  const match = await ask([{ type: 'text', text: matchPrompt }], 12000)
  let matches: Any[] = []
  try { matches = parseJson(textOf(match)).matches || [] } catch { matches = [] }
  const compact = candidates.map((p) => ({ id: Number(p.id), name: p.name, price: priceOf(p), unit_of_measure: p.unit_of_measure || null }))
  const byNo = new Map<string, Any>(matches.map((m) => [String(m.item_no), m]))
  const needsPrice = items.some((it) => { const m = byNo.get(String(it.item_no)); return !m || m.match_kind === 'must_source' || m.item_id == null })
  await saveJob(job, { state: { ...job.state, matches, candidates: compact }, stage: needsPrice ? 'price' : 'write' })
}

// STAGE: price — source on the web what the catalog cannot.
// Bryce, 2026-09-25: "add web browsing to Benny". A must-source line used to
// carry Benny's market estimate; now he searches for it and brings back the
// page he read the price on. It still lands redlined — the rule is that a
// HUMAN ticks verified against a link — but the link is already on the line.
async function stagePrice(job: Job) {
  const items: Any[] = job.state.items || []
  const byNo = new Map<string, Any>((job.state.matches || []).map((m: Any) => [String(m.item_no), m]))
  const isMustSource = (it: Any) => { const m = byNo.get(String(it.item_no)); return !m || m.match_kind === 'must_source' || m.item_id == null }
  const mustSource = items.filter(isMustSource)
  const found: Record<string, { unit_price: number; source_url: string; source_title: string; note: string }> = {}
  let webSearches = 0
  if (mustSource.length) {
    const meta = { feature: 'benny-bid-intake', companyId: job.company_id }
    const searchPrompt = `You are Benny, pricing bid items a contractor's catalog does not carry. Use web search to find a CURRENT purchasable unit price for each item below from a real supplier or distributor page (Grainger, Graybar, Platt, HD Supply, Home Depot Pro, a manufacturer's store, or similar). Prefer a product that meets the spec; say what differs if it does not. For labor, commissioning or service items, search for typical regional trade rates and cite the page you used.

Return ONLY a JSON object:
{ "prices": [ { "item_no": "...", "unit_price": 0.00, "source_url": "https://...", "source_title": "page title", "product": "what the page sells", "note": "how it compares to the spec and what the price includes" } ] }

Rules: unit_price is the price PER UNIT in the bid's unit (${[...new Set(mustSource.map((it) => it.unit || 'EA'))].join(', ')}). source_url must be the exact page you read the price on — never invent or guess a URL. If nothing reliable turns up for an item, omit it rather than guess. Keep note under 160 characters.

ITEMS:
${mustSource.map((it) => `- item_no ${it.item_no || '?'} qty ${it.quantity} ${it.unit || ''}: ${it.description}${it.spec ? ` — SPEC: ${String(it.spec).slice(0, 500)}` : ''}`).join('\n')}`
    try {
      const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: Math.min(12, mustSource.length * 3) }]
      let messages: Any[] = [{ role: 'user', content: [{ type: 'text', text: searchPrompt }] }]
      let text = ''
      for (let hop = 0; hop < 3; hop++) {
        let r = await callAnthropic(meta, { model: READ_MODEL, max_tokens: 8192, messages, tools })
        if (!r.ok && r.status === 404) r = await callAnthropic(meta, { model: FALLBACK_MODEL, max_tokens: 8192, messages, tools })
        if (!r.ok) { console.warn('[benny] web pricing unavailable:', r.friendly); break }
        webSearches += (r.data?.usage?.server_tool_use?.web_search_requests as number) || 0
        text = textOf(r)
        // A long search can pause mid-turn; hand the transcript back and let it finish.
        if (r.data?.stop_reason !== 'pause_turn') break
        messages = [...messages, { role: 'assistant', content: r.data.content }]
      }
      const parsed = text ? parseJson(text) : null
      for (const p of parsed?.prices || []) {
        const url = String(p.source_url || '').trim()
        const price = Number(p.unit_price)
        if (!/^https?:\/\/\S+\.\S+/i.test(url) || !(price > 0)) continue
        found[String(p.item_no)] = {
          unit_price: Math.round(price * 100) / 100, source_url: url,
          source_title: String(p.source_title || '').slice(0, 160),
          note: [p.product, p.note].filter(Boolean).join(' — ').slice(0, 600),
        }
      }
    } catch (e) {
      // A failed search is not a reason to lose the bid: the line falls back
      // to the estimate from the match pass, still redlined.
      console.warn('[benny] web pricing failed:', (e as Error)?.message)
    }
  }
  await saveJob(job, { state: { ...job.state, found, web_searches: webSearches }, stage: 'write' })
}

// STAGE: write — lines through the intake contract
async function stageWrite(job: Job): Promise<Record<string, unknown>> {
  const st = job.state
  const items: Any[] = st.items || []
  const pkg: Any = st.pkg || {}
  const byNo = new Map<string, Any>((st.matches || []).map((m: Any) => [String(m.item_no), m]))
  const catById = new Map<number, Any>((st.candidates || []).map((p: Any) => [Number(p.id), p]))
  const found: Record<string, Any> = st.found || {}

  const lines: IntakeLine[] = items.map((it) => {
    const m = byNo.get(String(it.item_no)) || {}
    const kind = ['exact', 'equivalent', 'must_source'].includes(m.match_kind) ? m.match_kind : 'must_source'
    const prod = kind !== 'must_source' && m.item_id != null ? catById.get(Number(m.item_id)) : null
    const qty = Number(it.quantity) || 1
    if (prod) {
      return {
        item_name: prod.name, description: it.spec || it.description || null, item_id: prod.id, quantity: qty, price: Number(prod.price) || 0,
        unit_of_measure: it.unit || prod.unit_of_measure || null, notes: m.justification || null,
        price_source: 'catalog', match_kind: kind, match_note: m.justification || null,
        bid_item_no: it.item_no || null, bid_spec: it.spec || it.description || null,
      }
    }
    // A price Benny read on a supplier page beats his estimate; either way
    // the line is ai_sourced and unverified until a person checks the link.
    const web = found[String(it.item_no)]
    const est = web ? web.unit_price : Math.max(0, Number(m.estimated_unit_price) || 0)
    return {
      item_name: it.description || 'Bid item', description: it.spec || null, item_id: null, quantity: qty, price: est,
      unit_of_measure: it.unit || null, notes: m.justification || null,
      price_source: 'ai_sourced', sourced_price: est,
      source_url: web?.source_url || null,
      source_note: web
        ? `Found on the web${web.source_title ? ` — ${web.source_title}` : ''}${web.note ? `: ${web.note}` : ''}`
        : (m.price_basis || m.justification || 'Benny\'s market estimate — verify before sending'),
      match_kind: 'must_source', match_note: m.justification || null,
      bid_item_no: it.item_no || null, bid_spec: it.spec || it.description || null,
    }
  })

  const bidIntake = {
    title: pkg.title || null, bid_number: pkg.bid_number || null, buyer: pkg.buyer || null, project: pkg.project || null,
    due_at: pkg.due_at || null, submit_to: pkg.submit_to || null, instructions: pkg.instructions || null,
    acknowledgements: Array.isArray(pkg.acknowledgements) ? pkg.acknowledgements : [],
    columns: Array.isArray(pkg.columns) && pkg.columns.length ? pkg.columns : null,
    sections: (pkg.sections || []).map((s: Any) => ({ name: s.name || 'Schedule of Items', item_nos: (s.items || []).map((i: Any) => i.item_no).filter(Boolean) })),
    source_document: { bucket: job.storage_bucket, path: job.storage_path, name: job.file_name },
    read_at: new Date().toISOString(), read_by: job.requested_by || null, model: READ_MODEL,
    takeoff: st.takeoff || null,
  }
  const estimateName = [pkg.bid_number, pkg.project || pkg.title].filter(Boolean).join(' — ') || job.file_name || 'Bid'
  const target = { baseUrl: SUPABASE_URL, headers: svc }
  const patchQuote = async (quoteId: number, extra: Record<string, unknown>) => {
    await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${quoteId}&company_id=eq.${job.company_id}`, { method: 'PATCH', headers: svc, body: JSON.stringify(extra) })
  }

  let quoteId: number
  if (job.mode === 'fill') {
    quoteId = Number(job.quote_id)
    if (!quoteId) throw new StageError('quote_id is required to fill an existing bid', 400)
    const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?select=id,settings_overrides,estimate_name&id=eq.${quoteId}&company_id=eq.${job.company_id}&limit=1`, { headers: svc })
    const q = (await qRes.json())?.[0]
    if (!q) throw new StageError('That estimate is not in this company', 404)
    const intake: EstimateIntake = { source: 'benny-bid', company_id: job.company_id, lines }
    // Through the one writer (estimateIntakeRest.fillEstimateFromIntakeRest): it
    // refuses a draft that is not empty, so nothing is ever doubled.
    try { await fillEstimateFromIntakeRest(target, intake, quoteId) }
    catch (e) { if (e instanceof IntakeWriteError) throw new StageError(e.message, e.kind === 'invalid' ? 409 : 500); throw e }
    await patchQuote(quoteId, {
      document_type: 'bid', bid_intake: bidIntake,
      estimate_name: q.estimate_name || estimateName,
      settings_overrides: { ...(q.settings_overrides || {}), presentation_mode: 'bid' },
      bid_opportunity_id: job.opportunity_id ?? null,
      updated_at: new Date().toISOString(),
    })
  } else {
    const intake: EstimateIntake = {
      source: 'benny-bid', company_id: job.company_id,
      lead_id: job.lead_id ?? null, customer_id: job.customer_id ?? null,
      salesperson_id: job.salesperson_id ?? job.employee_id ?? null,
      business_unit: job.business_unit || null, service_type: job.service_type || null,
      estimate_name: estimateName, summary: pkg.title ? `${pkg.title}${pkg.buyer ? ` — ${pkg.buyer}` : ''}` : null,
      notes: pkg.instructions || null, status: 'Draft', lines,
    }
    try {
      const made = await createEstimateFromIntakeRest(target, intake, { advanceLeadTo: null })
      quoteId = made.quoteId
    } catch (e) {
      if (e instanceof IntakeWriteError) throw new StageError(e.message, e.kind === 'invalid' ? 400 : 500, { kind: e.kind })
      throw e
    }
    await patchQuote(quoteId, { document_type: 'bid', bid_intake: bidIntake, settings_overrides: { presentation_mode: 'bid' }, bid_opportunity_id: job.opportunity_id ?? null })
  }

  // The package rides along as a document on the estimate.
  await fetch(`${SUPABASE_URL}/rest/v1/file_attachments`, { method: 'POST', headers: svc, body: JSON.stringify({
    company_id: job.company_id, quote_id: quoteId, file_name: job.file_name, file_path: job.storage_path, storage_bucket: job.storage_bucket,
    file_type: job.media_type, file_size: job.file_size, photo_context: 'bid_package', created_by: job.employee_id, // employees.id — the column is a bigint
  }) }).catch(() => {})

  const counts = { exact: 0, equivalent: 0, must_source: 0 }
  for (const l of lines) counts[(l.match_kind || 'must_source') as keyof typeof counts]++
  const result = { ok: true, quote_id: quoteId, mode: job.mode, lines: lines.length, counts, unverified: counts.must_source,
    web_priced: Object.keys(found).length, web_searches: st.web_searches || 0, takeoff: st.takeoff ? { trade: st.takeoff.trade, confidence: st.takeoff.confidence } : null,
    read: { title: bidIntake.title, bid_number: bidIntake.bid_number, buyer: bidIntake.buyer, due_at: bidIntake.due_at, sections: bidIntake.sections.length } }
  // Not done yet: the requirements pass runs next, on the bid that now exists.
  await saveJob(job, { quote_id: quoteId, stage: 'requirements', state: { ...st, result } })
  return result
}

// The checklist rows every packet carries, then the buyer's. Twin of
// src/lib/bidPacket.seedChecklist — keep the two in step.
function seedChecklist(req: Any): Any[] {
  const base = [
    { key: 'bid_form', item: 'Bid schedule / bid form, priced and complete', required: true, kind: 'pricing', page: null, auto: 'bid_form' },
    { key: 'cover_letter', item: 'Transmittal / cover letter', required: false, kind: 'other', page: null, auto: 'cover_letter' },
    { key: 'qualifications', item: 'Qualification statement', required: false, kind: 'other', page: null, auto: 'qualifications' },
  ]
  const seen = new Set<string>(); const out: Any[] = []
  for (const r of [...base, ...((req && Array.isArray(req.checklist)) ? req.checklist : [])]) {
    const key = String(r.key || r.item || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    // A bid or performance bond is issued per project; the bonding LETTER on file never satisfies it (twin of lib/bidPacket).
    const kind = r.kind || 'other'
    const auto = kind === 'bond' && !/letter|capacity/i.test(String(r.item || '')) ? null : (r.auto || null)
    out.push({ key, item: r.item || key, required: r.required !== false, kind, page: r.page ?? null, auto, done: false, done_by: null, done_at: null, waived_reason: null })
  }
  return out
}

// STAGE: requirements — the compliance matrix (SAL_SCOUT_PLAN §5.6.2). Runs
// after the bid exists, so a failure here never costs the bid: it is noted
// on the result and the build is still done.
async function stageRequirements(job: Job): Promise<Record<string, unknown>> {
  const st = job.state; const result: Any = st.result || { ok: true, quote_id: job.quote_id }
  try {
    const ask = askFor(job.company_id)
    const { blocks } = await docBlocksFor(job)
    const prompt = `You are Benny, reading a bid package for a contractor. List EVERY submission requirement as the buyer states it — the compliance matrix. Return ONLY a JSON object:
{
  "submit_method": "email" | "portal" | "mail" | "unknown",
  "submit_to": { "email": null, "portal_url": null, "address": null, "contact_name": null, "contact_phone": null },
  "due_at": "ISO 8601 or null", "questions_due_at": "ISO 8601 or null", "prebid": { "at": "ISO 8601 or null", "mandatory": false },
  "bond": { "required": false, "pct": null, "kind": null },
  "insurance": { "gl_each": null, "gl_aggregate": null, "auto": null, "umbrella": null, "workers_comp": null, "additional_insured": false },
  "license": "license type or class required, or null",
  "references": { "count": 0, "page": null },
  "page_limit": null, "copies": null, "sealed": false, "label_text": "exact envelope wording, or null",
  "forms": [ { "name": "form title as printed", "page": 12, "purpose": "what it is", "signature_required": true, "notarized": false } ],
  "acknowledgements": [ { "name": "Addendum No. 1", "page": 3 } ],
  "checklist": [ { "key": "short_snake_key", "item": "one line, in the buyer's words", "required": true, "kind": "form" | "bond" | "insurance" | "license" | "w9" | "references" | "acknowledgement" | "copies" | "sealed" | "delivery" | "pricing" | "other", "page": 12, "auto": null } ]
}
Rules: one checklist row per thing the bidder must include, sign, initial, attach or do; page = where it is in the package. Set "auto" to "cert:insurance", "cert:workers_comp", "cert:w9", "cert:business_license" or "cert:bond" when the row is satisfied by that standard certificate; otherwise null. Do not add a row for pricing the bid form itself (that row exists). Nothing invented: if the package does not say, leave null or omit.`
    const r = await ask([...blocks, { type: 'text', text: prompt }], 6000)
    const req: Any = parseJson(textOf(r))
    const now = new Date().toISOString()
    const method = req.submit_method && req.submit_method !== 'unknown' ? String(req.submit_method) : null
    // The opportunity carries the matrix; the bid carries a copy, so a bid built from the upload card has one too.
    if (job.opportunity_id) {
      const patch: Any = { requirements: req, updated_at: now }
      if (method) patch.submit_method = method
      if (req.submit_to && Object.values(req.submit_to).some(Boolean)) patch.submit_to = req.submit_to
      await fetch(`${SUPABASE_URL}/rest/v1/bid_opportunities?id=eq.${job.opportunity_id}&company_id=eq.${job.company_id}`, { method: 'PATCH', headers: svc, body: JSON.stringify(patch) })
    }
    const qRes = await fetch(`${SUPABASE_URL}/rest/v1/quotes?select=bid_intake&id=eq.${job.quote_id}&company_id=eq.${job.company_id}&limit=1`, { headers: svc })
    const q = (await qRes.json())?.[0]
    await fetch(`${SUPABASE_URL}/rest/v1/quotes?id=eq.${job.quote_id}&company_id=eq.${job.company_id}`, { method: 'PATCH', headers: svc, body: JSON.stringify({ bid_intake: { ...(q?.bid_intake || {}), requirements: req } }) })
    // Seed the submission — one live per bid. An existing draft keeps every tick a person made.
    const seeded = seedChecklist(req)
    const sRes = await fetch(`${SUPABASE_URL}/rest/v1/bid_submissions?select=id,checklist&quote_id=eq.${job.quote_id}&status=neq.withdrawn&limit=1`, { headers: svc })
    const existing = (await sRes.json())?.[0]
    if (existing) {
      const keep = new Map<string, Any>((existing.checklist || []).map((x: Any) => [x.key, x]))
      const merged = seeded.map((x) => keep.get(x.key) || x)
      for (const [k, x] of keep) if (!merged.some((y) => y.key === k)) merged.push(x)
      await fetch(`${SUPABASE_URL}/rest/v1/bid_submissions?id=eq.${existing.id}`, { method: 'PATCH', headers: svc, body: JSON.stringify({ checklist: merged, ...(method ? { method } : {}), updated_at: now }) })
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/bid_submissions`, { method: 'POST', headers: svc, body: JSON.stringify({ company_id: job.company_id, opportunity_id: job.opportunity_id, quote_id: job.quote_id, method, checklist: seeded, status: 'draft', created_by: job.requested_by }) })
    }
    result.requirements = { checklist: seeded.length, submit_method: method, bond: req.bond || null, forms: (req.forms || []).length }
  } catch (e) {
    console.warn('[benny] requirements pass failed:', (e as Error)?.message)
    result.requirements_error = (e as Error)?.message || 'failed'
  }
  await saveJob(job, { stage: 'done', state: { ...st, result }, finished_at: new Date().toISOString() })
  return result
}

// One stage of a job. Returns the write stage's result when it ran.
async function runStage(job: Job): Promise<Record<string, unknown> | null> {
  switch (job.stage) {
    case 'read': await stageRead(job); return null
    case 'takeoff': await stageTakeoff(job); return null
    case 'match': await stageMatch(job); return null
    case 'price': await stagePrice(job); return null
    case 'write': return await stageWrite(job)
    case 'requirements': return await stageRequirements(job)
    default: return null
  }
}

async function failJob(job: Job, e: unknown) {
  const err = e as StageError
  await saveJob(job, { stage: 'failed', error: String(err?.message || 'Benny hit an error').slice(0, 500), finished_at: new Date().toISOString() })
  await reportToSal(job)
}

// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  let body: Any = {}
  try { body = await req.json() } catch { body = {} }

  try {
    // ── A stage of an existing job: only Benny himself (service key) asks for these.
    if (body.job_id) {
      const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
      if (bearer !== SERVICE_KEY) return json({ error: 'Stages are Benny\'s own business' }, 403)
      const job = await loadJob(Number(body.job_id))
      if (!job) return json({ error: 'No such job' }, 404)
      if (job.stage === 'done' || job.stage === 'failed') return json({ ok: true, stage: job.stage, quote_id: job.quote_id, error: job.error })
      try {
        const result = await runStage(job)
        if (job.stage === 'done') { await reportToSal(job); return json({ ...result, stage: 'done', job_id: job.id }) }
        kick(job.id)
        return json({ ok: true, stage: job.stage, job_id: job.id })
      } catch (e) {
        await failJob(job, e)
        const err = e as StageError
        return json({ error: err?.message || 'Benny hit an error', stage: 'failed', job_id: job.id, ...(err?.extra || {}) }, err?.status || 500)
      }
    }

    // ── A new build.
    const companyId = Number(body.company_id)
    const mode: 'create' | 'fill' = body.mode === 'fill' ? 'fill' : 'create'
    const storagePath = String(body.storage_path || '')
    if (!companyId || !storagePath) return json({ error: 'company_id and storage_path are required' }, 400)

    // Who is asking. The JWT is the identity; the body only names the tenant.
    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in to use Benny' }, 401)
    const empRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id,name,email&company_id=eq.${companyId}&email=ilike.${encodeURIComponent(user.email)}&limit=1`, { headers: svc })
    const emp = (await empRes.json())?.[0]
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)

    const oppId = Number(body.opportunity_id) || null
    const row = {
      company_id: companyId, opportunity_id: oppId, requested_by: user.email, employee_id: emp.id, mode,
      quote_id: mode === 'fill' ? Number(body.quote_id) || null : null,
      lead_id: body.lead_id ? Number(body.lead_id) : null, customer_id: body.customer_id ? Number(body.customer_id) : null,
      salesperson_id: body.salesperson_id ? Number(body.salesperson_id) : emp.id,
      business_unit: body.business_unit || null, service_type: body.service_type || null,
      storage_bucket: String(body.storage_bucket || 'project-documents'), storage_path: storagePath,
      file_name: String(body.file_name || storagePath.split('/').pop() || 'bid-package.pdf'),
      media_type: String(body.media_type || 'application/pdf'), scope_hint: body.scope_hint ? String(body.scope_hint).slice(0, 600) : null,
      // The rest of the package (specs, addenda), read with the form.
      extra_paths: Array.isArray(body.extra_paths)
        ? body.extra_paths.slice(0, 12).map((x: Any) => ({ bucket: x.bucket || 'project-documents', path: String(x.path || x.storage_path || ''), name: x.name || null, media_type: x.media_type || 'application/pdf' })).filter((x: Any) => x.path)
        : [],
      stage: 'read', state: {},
    }
    if (mode === 'fill' && !row.quote_id) return json({ error: 'quote_id is required to fill an existing bid' }, 400)
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/benny_jobs`, { method: 'POST', headers: { ...svc, Prefer: 'return=representation' }, body: JSON.stringify(row) })
    const job: Job | undefined = ins.ok ? (await ins.json())?.[0] : undefined
    if (!job) return json({ error: `Could not start the build (${ins.status})` }, 500)

    // Staged (Sal, or anyone who asked for async): answer now, Benny reports back.
    if (oppId || body.async === true) {
      kick(job.id)
      return json({ ok: true, accepted: true, job_id: job.id, stage: 'read', message: 'Benny has the package. A bid form takes about a minute; a plan takeoff a few.' }, 202)
    }

    // Inline (the upload card): a bid form fits in one request. A plan set
    // that turns out to need a takeoff is handed to the stages instead, and
    // the card is told where to look.
    try {
      for (let guard = 0; guard < 8; guard++) {
        if (job.stage === 'takeoff') {
          kick(job.id)
          return json({ ok: true, accepted: true, job_id: job.id, stage: 'takeoff', message: 'That is a set of drawings, not a bid form. Benny is taking it off — the bid appears on your Bids list in a few minutes.' }, 202)
        }
        const result = await runStage(job)
        if (job.stage === 'done') return json({ ...result, job_id: job.id })
      }
      throw new StageError('Benny lost his place in the build', 500)
    } catch (e) {
      await failJob(job, e)
      const err = e as StageError
      return json({ error: err?.message || 'Benny hit an error', job_id: job.id, ...(err?.extra || {}) }, err?.status || 500)
    }
  } catch (err) {
    console.error('[benny-bid-intake]', err)
    return json({ error: (err as Error)?.message || 'Benny hit an error' }, 500)
  }
})
