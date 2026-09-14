// A quote through Arnie: "quote Halifax Flooring for 40 LED high bays and
// 12 wall packs."
//
// It goes through estimateIntake — the ONE way an agent's bid becomes a
// real estimate — so it is not a fifth copy of the quotes + quote_lines
// write, and it inherits the invariants that were each once a shipped bug:
// a header and its lines together or nothing, line_total always present,
// sort_order always assigned, the lead linked back.
//
// The lines come from the PRICE BOOK. The model names a product in words;
// the server finds it with the same squashed match query_products uses, so
// "highbay" finds "LED High Bay 150W", takes the catalogue price unless the
// user gave one, and refuses to guess when several products fit. A line
// that matches nothing is allowed only as a custom line WITH a price —
// Arnie never invents a number.
//
// It is a Draft. Nothing is sent, the lead does not advance, and the person
// can open it on the Estimates page and change anything before it goes out.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { RECORD_TARGETS, resolveEntity } from './arnieRecords.ts'
import type { Prepared } from './arnieCreate.ts'
import { createEstimateFromIntakeRest, IntakeWriteError } from './estimateIntakeRest.ts'
import type { EstimateIntake, IntakeLine } from './estimateIntake.ts'

const squash = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const money = (n: number) => Math.round(n * 100) / 100
const usd = (n: number) => '$' + money(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface WantedLine { item: string; quantity?: number; price?: number; description?: string }

function parseLines(raw: string | undefined): WantedLine[] | string {
  let v: unknown
  try { v = JSON.parse(raw || '[]') } catch { return 'lines must be a list of { item, quantity, price? }' }
  if (!Array.isArray(v) || !v.length) return 'a quote needs at least one line'
  if (v.length > 40) return 'that is more than 40 lines — build this one on the Estimates page'
  const out: WantedLine[] = []
  for (const [i, l] of v.entries()) {
    if (!l || typeof l !== 'object') return `line ${i + 1} is not an object`
    const o = l as Record<string, unknown>
    const item = String(o.item ?? o.item_name ?? o.name ?? '').trim()
    if (!item) return `line ${i + 1} has no item`
    const quantity = o.quantity == null ? 1 : Number(o.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return `line ${i + 1}: quantity "${o.quantity}" is not usable`
    const price = o.price == null || o.price === '' ? undefined : Number(o.price)
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) return `line ${i + 1}: price "${o.price}" is not usable`
    out.push({ item, quantity, price, description: o.description ? String(o.description).slice(0, 300) : undefined })
  }
  return out
}

export async function prepareQuote(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number

  // Who it is for: a lead or a customer, by description.
  let leadId: number | null = null, customerId: number | null = null, forLabel = '', leadBefore: Record<string, unknown> | null = null
  if (f.lead) {
    const found = await resolveEntity(r, companyId, RECORD_TARGETS.lead_note, f.lead)
    if ('error' in found) return { ok: false, error: found.error }
    if ('candidates' in found) return { needs_choice: found.candidates, message: 'More than one lead matches. Ask which one, then call again naming it as listed.' }
    const [lead] = await readRecordList(r, `leads?select=id,customer_name,business_name,customer_id,service_type,salesperson_id,status,quote_id,quote_generated&company_id=eq.${companyId}&id=eq.${found.row.id}&limit=1`)
    if (!lead) return { ok: false, error: 'That lead is no longer there.' }
    leadId = lead.id; customerId = lead.customer_id ?? null
    forLabel = lead.business_name || lead.customer_name || `lead #${lead.id}`
    leadBefore = { status: lead.status, quote_id: lead.quote_id, quote_generated: lead.quote_generated }
    if (!f.service_type && lead.service_type) f.service_type = lead.service_type
    if (!f.salesperson && lead.salesperson_id) f.__lead_rep = String(lead.salesperson_id)
  } else if (f.customer) {
    const t = String(f.customer).replace(/[*,()]/g, '').trim()
    if (t.length < 3) return { ok: false, error: 'Tell me which customer — a name I can match on.' }
    const cs = await readRecordList(r, `customers?select=id,name,business_name&company_id=eq.${companyId}&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)&limit=6`)
    if (!cs.length) return { ok: false, error: `No customer matching "${f.customer}".` }
    if (cs.length > 1) return { needs_choice: cs.map((c: any) => ({ id: c.id, label: c.business_name || c.name })), message: 'More than one customer matches. Ask which, then call again with the full name.' }
    customerId = cs[0].id; forLabel = cs[0].business_name || cs[0].name
  } else {
    return { ok: false, error: 'Who is the quote for? Name the lead or the customer.' }
  }

  // The rep. Named → looked up; otherwise the lead's; otherwise the asker.
  let repId: number | null = null, repName = ''
  if (f.salesperson) {
    const t = String(f.salesperson).replace(/[*,()]/g, '').trim()
    const reps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true&name=ilike.*${t}*&limit=6`)
    if (!reps.length) return { ok: false, error: `No active employee matching "${f.salesperson}".` }
    if (reps.length > 1) return { needs_choice: reps.map((e: any) => ({ id: e.id, label: e.name })), message: 'More than one person matches that name. Ask which, then call again with the full name.' }
    repId = reps[0].id; repName = reps[0].name
  } else {
    const id = f.__lead_rep ? Number(f.__lead_rep) : caller.employeeId
    if (id) { const [e] = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&id=eq.${id}&limit=1`); if (e) { repId = e.id; repName = e.name + (f.__lead_rep ? ' (on the lead)' : ' (you)') } }
  }

  // The lines, against the price book.
  const wanted = parseLines(f.lines)
  if (typeof wanted === 'string') return { ok: false, error: wanted }
  const products = await readRecordList(r, `products_services?select=id,name,unit_price,product_category,manufacturer,model_number&company_id=eq.${companyId}&active=eq.true&limit=3000`)
  const lines: IntakeLine[] = []
  const display: { label: string; value: string }[] = []
  for (const [i, w] of wanted.entries()) {
    const want = squash(w.item)
    let hits = products.filter((p: any) => squash(p.name) === want)
    if (!hits.length) hits = products.filter((p: any) => squash(p.name).includes(want) || squash(p.model_number).includes(want))
    if (!hits.length && want.length >= 6) hits = products.filter((p: any) => want.includes(squash(p.name)) && squash(p.name).length >= 6)
    if (hits.length > 1) {
      return { needs_choice: hits.slice(0, 6).map((p: any) => ({ id: p.id, label: `${p.name}${p.manufacturer ? ' — ' + p.manufacturer : ''} (${usd(Number(p.unit_price) || 0)})` })),
        message: `"${w.item}" matches ${hits.length} products. Ask which one, then call again with the product named exactly as listed.` }
    }
    if (!hits.length) {
      if (w.price === undefined) return { ok: false, error: `Nothing in the price book matches "${w.item}". Give me a price and I will add it as a custom line, or name the product as it appears on the Products page.` }
      lines.push({ item_name: w.item, description: w.description ?? null, item_id: null, quantity: w.quantity, price: money(w.price), kind: 'custom' })
      display.push({ label: `Line ${i + 1}`, value: `${w.quantity} × ${w.item} @ ${usd(w.price)} = ${usd(w.quantity! * w.price)} (custom — not in the price book)` })
      continue
    }
    const p = hits[0]
    const price = w.price === undefined ? Number(p.unit_price) || 0 : money(w.price)
    lines.push({ item_name: p.name, description: w.description ?? null, item_id: p.id, quantity: w.quantity, price })
    display.push({ label: `Line ${i + 1}`, value: `${w.quantity} × ${p.name} @ ${usd(price)} = ${usd(w.quantity! * price)}${w.price !== undefined && Number(p.unit_price) !== price ? ` (book price ${usd(Number(p.unit_price) || 0)})` : ''}` })
  }
  const total = lines.reduce((s, l) => s + money((l.quantity || 1) * (l.price || 0)), 0)

  const intake: EstimateIntake = {
    source: 'arnie', company_id: companyId, lead_id: leadId, customer_id: customerId, salesperson_id: repId,
    audit_id: null, service_type: f.service_type || null, estimate_name: f.estimate_name || `${forLabel} — ${f.service_type || 'Estimate'}`,
    summary: f.notes || null, status: 'Draft', lines,
  }
  return {
    ok: true,
    columns: { intake, lead_before: leadBefore, for_label: forLabel },
    display: [
      { label: 'For', value: forLabel },
      { label: 'Rep', value: repName || '(none)' },
      ...display,
      { label: 'Total', value: usd(total) + ' · Draft — nothing is sent' },
    ],
  }
}

/** Write it through the intake contract. Header + lines or nothing. */
export async function applyQuote(r: Rest, companyId: number, prop: any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }> {
  const intake = prop.payload?.columns?.intake as EstimateIntake | undefined
  if (!intake || intake.company_id !== companyId) return { ok: false, error: 'That draft is missing its quote.' }
  try {
    const res = await createEstimateFromIntakeRest(
      { baseUrl: r.url, headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' } },
      intake,
      { advanceLeadTo: null },
    )
    return { ok: true, id: res.quoteId, label: prop.payload?.entity_label || 'quote', created: { quote_id: res.quoteId, line_count: res.lineCount } }
  } catch (e) {
    if (e instanceof IntakeWriteError) return { ok: false, error: e.message + (e.rolledBack ? '' : ` (a header #${e.orphanQuoteId} was left behind)`) }
    return { ok: false, error: (e as Error).message }
  }
}

/** Delete the draft — lines then header — and put the lead back. Only while it is still a draft nobody has sent. */
export async function rollbackQuote(r: Rest, companyId: number, prop: any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const id = Number(prop.payload?.created?.quote_id)
  if (!id) return { ok: false, error: 'This draft never created a quote.' }
  const [q] = await readRecordList(r, `quotes?select=id,status,last_sent_at,job_id,approved_date&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!q) return { ok: true, deleted: id }
  if (q.status !== 'Draft' || q.last_sent_at || q.job_id || q.approved_date) {
    return { ok: false, error: `Can't withdraw — that quote is ${q.status}${q.last_sent_at ? ' and has been sent' : ''}${q.job_id ? ' and has a job' : ''}. Handle it on the Estimates page.` }
  }
  const H = { apikey: r.key, Authorization: `Bearer ${r.key}`, Prefer: 'return=minimal' }
  await fetch(`${r.url}/rest/v1/quote_lines?quote_id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: H })
  const leadId = prop.payload?.columns?.intake?.lead_id
  const before = prop.payload?.columns?.lead_before
  if (leadId && before) await patchRow(r, 'leads', companyId, leadId, before)
  await fetch(`${r.url}/rest/v1/quotes?id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: H })
  // Inserting the quote promoted the setter's fee on this lead to earned
  // (quotes_promote_setter_commissions). The trigger handles relinks, not
  // deletes, so withdrawing the quote has to put the fee back itself — but
  // only if no other quote remains on the lead, and never a paid row.
  if (leadId) {
    const others = await readRecordList(r, `quotes?select=id&company_id=eq.${companyId}&lead_id=eq.${leadId}&limit=1`)
    if (!others.length) {
      await fetch(`${r.url}/rest/v1/lead_commissions?company_id=eq.${companyId}&lead_id=eq.${leadId}&commission_type=eq.appointment_set&payment_status=eq.earned`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_status: 'pending' }),
      })
    }
  }
  return { ok: true, deleted: id }
}
