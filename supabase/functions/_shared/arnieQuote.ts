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
import { createEstimateFromIntakeRest, fillEstimateFromIntakeRest, IntakeWriteError } from './estimateIntakeRest.ts'
import type { EstimateIntake, IntakeLine } from './estimateIntake.ts'
import { labourRate, sourcePrices } from './bennySource.ts'

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
  } else if (!f.quote) {
    // Filling a named draft may omit both: the draft's own lead/customer is
    // used below. Refusing here first is what made the fill path unreachable.
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
  // "Fill estimate EST-5112": an existing EMPTY Draft in this company. Its
  // lead/customer stands in when the user named none; a draft with lines
  // already on it is refused rather than doubled (same rule as Benny's fill).
  let fillQuote: any = null
  if (f.quote) {
    const t = String(f.quote).trim()
    const idNum = Number((t.match(/^#?(\d+)$/) || [])[1])
    const rows = idNum
      ? await readRecordList(r, `quotes?select=id,quote_id,status,estimate_name,lead_id,customer_id,service_type,last_sent_at,job_id&company_id=eq.${companyId}&id=eq.${idNum}&limit=1`)
      : await readRecordList(r, `quotes?select=id,quote_id,status,estimate_name,lead_id,customer_id,service_type,last_sent_at,job_id&company_id=eq.${companyId}&or=(quote_id.ilike.*${encodeURIComponent(t)}*,estimate_name.ilike.*${encodeURIComponent(t)}*)&order=created_at.desc&limit=6`)
    if (!rows.length) return { ok: false, error: `No estimate matching "${t}" in this company.` }
    if (rows.length > 1) return { needs_choice: rows.map((q: any) => ({ id: q.id, label: `${q.quote_id || '#' + q.id} — ${q.estimate_name || 'unnamed'} (${q.status})` })), message: 'More than one estimate matches. Ask which one, then call again with its number.' }
    fillQuote = rows[0]
    if (fillQuote.status !== 'Draft' || fillQuote.last_sent_at || fillQuote.job_id) return { ok: false, error: `${fillQuote.quote_id || '#' + fillQuote.id} is ${fillQuote.status}${fillQuote.last_sent_at ? ' and has been sent' : ''} — I only fill an empty draft. Say "new estimate" instead.` }
    const existing = await readRecordList(r, `quote_lines?select=id&quote_id=eq.${fillQuote.id}&company_id=eq.${companyId}&limit=1`)
    if (existing.length) return { ok: false, error: `${fillQuote.quote_id || '#' + fillQuote.id} already has line items — I only fill an empty draft, so nothing gets doubled. Add to it on the Estimates page, or say "new estimate".` }
    if (!leadId && !customerId) {
      leadId = fillQuote.lead_id ? Number(fillQuote.lead_id) : null
      customerId = fillQuote.customer_id ? Number(fillQuote.customer_id) : null
      if (!forLabel) forLabel = fillQuote.estimate_name || fillQuote.quote_id || `estimate #${fillQuote.id}`
    }
  }
  if (!leadId && !customerId) return { ok: false, error: 'Who is the quote for? Name the lead or the customer.' }

  const wanted = parseLines(f.lines)
  if (typeof wanted === 'string') return { ok: false, error: wanted }
  const products = await readRecordList(r, `products_services?select=id,name,unit_price,product_category,manufacturer,model_number&company_id=eq.${companyId}&active=eq.true&limit=3000`)
  const lines: IntakeLine[] = []
  const display: { label: string; value: string }[] = []
  // Lines the price book has never heard of, kept in order for Benny.
  const misses: { i: number; w: any }[] = []
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
      // Not in the book and no price given: Benny goes and finds it rather
      // than the estimate stopping here (Bryce, 2026-09-29). Gathered now,
      // priced in one search below.
      if (w.price === undefined) { misses.push({ i, w }); lines.push(null as unknown as IntakeLine); display.push(null as unknown as { label: string; value: string }); continue }
      lines.push({ item_name: w.item, description: w.description ?? null, item_id: null, quantity: w.quantity, price: money(w.price), kind: 'custom' })
      display.push({ label: `Line ${i + 1}`, value: `${w.quantity} × ${w.item} @ ${usd(w.price)} = ${usd(w.quantity! * w.price)} (custom — not in the price book)` })
      continue
    }
    const p = hits[0]
    const price = w.price === undefined ? Number(p.unit_price) || 0 : money(w.price)
    lines.push({ item_name: p.name, description: w.description ?? null, item_id: p.id, quantity: w.quantity, price })
    display.push({ label: `Line ${i + 1}`, value: `${w.quantity} × ${p.name} @ ${usd(price)} = ${usd(w.quantity! * price)}${w.price !== undefined && Number(p.unit_price) !== price ? ` (book price ${usd(Number(p.unit_price) || 0)})` : ''}` })
  }
  // ── What the catalog does not carry: Benny prices it, with the page ──
  const sourced: { label: string; value: string }[] = []
  if (misses.length) {
    const [co] = await readRecordList(r, `companies?select=industry&id=eq.${companyId}&limit=1`)
    const rate = await labourRate(r, companyId)
    const { found } = await sourcePrices(
      misses.map((m) => ({ key: String(m.i), description: m.w.item, quantity: m.w.quantity ?? 1, unit: null, spec: m.w.description ?? null })),
      { feature: 'arnie-quote-source', companyId, withLabour: true, trade: co?.industry || null },
    )
    const stuck: string[] = []
    for (const m of misses) {
      const hit = found[String(m.i)]
      if (!hit) { stuck.push(m.w.item); continue }
      const qty = m.w.quantity ?? 1
      lines[m.i] = {
        item_name: m.w.item, description: m.w.description ?? null, item_id: null, quantity: qty,
        price: money(hit.unit_price), kind: 'custom',
        // The redline: priced by a machine, from a page, unverified. The send
        // gate (_shared/sourcedPricing.ts) will not let this estimate go out
        // until a person opens that page and ticks verified.
        price_source: 'ai_sourced', sourced_price: money(hit.unit_price),
        source_url: hit.source_url, source_note: [hit.source_title, hit.note].filter(Boolean).join(' — ').slice(0, 600) || null,
        match_kind: 'must_source', match_note: 'Not in the price book — Benny sourced this price from the web.',
      }
      display[m.i] = { label: `Line ${m.i + 1}`, value: `${qty} × ${m.w.item} @ ${usd(hit.unit_price)} = ${usd(qty * hit.unit_price)} — Benny sourced this (${hit.source_title || 'supplier page'}); it stays redlined until someone opens the page and verifies it` }
      sourced.push({ label: `Line ${m.i + 1} — where the price came from`, value: hit.source_url })
      // The time, priced by the tenant's own labour rate.
      if (hit.hours && rate) {
        const hours = Math.round(hit.hours * qty * 100) / 100
        // Deliberately NOT price_source 'ai_sourced': the price on this line is
        // the tenant's own labour rate, and asking a rep to "verify" their own
        // rate against a web page is nonsense. Benny's guess is the HOURS, and
        // match_note says so. The material line above already raises the send
        // warning, so the estimate cannot go out unnoticed either way.
        lines.push({
          item_name: `${rate.name} — ${m.w.item}`, description: hit.hours_note || `${hit.hours} hr per unit to fit`,
          item_id: null, quantity: hours, price: rate.rate, kind: 'custom',
          match_kind: 'must_source', match_note: `Benny's estimate of the time; the rate is your own ${rate.name} rate.`,
        })
        display.push({ label: `Line ${lines.length}`, value: `${hours} hr × ${usd(rate.rate)} = ${usd(hours * rate.rate)} — Benny's estimate of the labour to fit ${m.w.item}` })
      } else if (hit.hours && !rate) {
        sourced.push({ label: `Line ${m.i + 1} — labour`, value: `Benny reckons ${hit.hours} hr per unit, but there is no labour rate set up, so no labour line. Add one on Settings → Labor Rates.` })
      }
    }
    if (stuck.length) return { ok: false, error: `I could not find a price for ${stuck.map((x) => `"${x}"`).join(', ')} — Benny searched and did not come back with a supplier page he could stand behind. Give me a price and I will put it on as a custom line.` }
  }
  // Drop the placeholders for any line that never got filled.
  for (let k = lines.length - 1; k >= 0; k--) if (!lines[k]) { lines.splice(k, 1); display.splice(k, 1) }
  if (sourced.length) display.push(...sourced)

  const total = lines.reduce((s, l) => s + money((l.quantity || 1) * (l.price || 0)), 0)

  const intake: EstimateIntake = {
    source: 'arnie', company_id: companyId, lead_id: leadId, customer_id: customerId, salesperson_id: repId,
    audit_id: null, service_type: f.service_type || null, estimate_name: f.estimate_name || `${forLabel} — ${f.service_type || 'Estimate'}`,
    summary: f.notes || null, status: 'Draft', lines,
  }
  return {
    ok: true,
    columns: { intake, lead_before: leadBefore, for_label: forLabel, fill_quote_id: fillQuote ? Number(fillQuote.id) : null, fill_quote_ref: fillQuote ? (fillQuote.quote_id || `#${fillQuote.id}`) : null },
    display: [
      ...(fillQuote ? [{ label: 'Into', value: `${fillQuote.quote_id || '#' + fillQuote.id} — the empty draft, filled in place` }] : []),
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
  const fillId = Number(prop.payload?.columns?.fill_quote_id) || 0
  const target = { baseUrl: r.url, headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' } }
  if (fillId) {
    // Into the empty draft the rep was looking at — through the one writer,
    // which refuses a draft that gained lines since the card was drafted.
    try {
      const res = await fillEstimateFromIntakeRest(target, intake, fillId)
      return { ok: true, id: fillId, label: prop.payload?.entity_label || 'quote', created: { quote_id: fillId, line_count: res.lineCount, filled: true } }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  try {
    const res = await createEstimateFromIntakeRest(target, intake, { advanceLeadTo: null })
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
  if (prop.payload?.created?.filled) {
    // A filled draft keeps its header: take the lines back out and zero the headline.
    const H = { apikey: r.key, Authorization: `Bearer ${r.key}`, Prefer: 'return=minimal' }
    await fetch(`${r.url}/rest/v1/quote_lines?quote_id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: H })
    await patchRow(r, 'quotes', companyId, id, { quote_amount: 0, updated_at: new Date().toISOString() })
    return { ok: true, deleted: id }
  }
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
