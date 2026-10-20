// Arnie may reword; he may not reprice.
//
// Bryce (2026-10-20): "Arnie should be able to edit descriptions but not
// amounts." Four kinds of text, each one column, each behind the same
// propose → approve → apply → rollback card as every other record change:
//
//   job_description               jobs.details              (the job page's Details)
//   estimate_summary              quotes.summary            (Summary / Scope)
//   estimate_line_description     quote_lines.description
//   invoice_line_description      invoice_lines.description
//   product_description           products_services.description
//
// The column is fixed by the target, never named by the model, so there is
// no input that reaches quantity, price, line_total or any total: a price
// change stays on the page, where the totals, the incentive and the PDF are
// worked out together. arnieDescriptionTargets.test.js pins that.
//
// Who may: the page's rule. An estimate's text is its rep's own or a
// manager's (the same bar as follow-ups and "won"); an invoice's lines are an
// admin's and never once the invoice is locked (InvoiceDetail: checkAdmin,
// and no Edit on a locked invoice); a job's details and the price book are a
// manager's.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { findQuote, forWhom } from './arnieFollowup.ts'
import { findInvoice } from './arniePayment.ts'

/** The text columns this module writes. Nothing else, ever. */
export const DESCRIPTION_COLUMNS = ['details', 'summary', 'description']

/** Longest description a card will carry — a paragraph, not a document. */
export const DESCRIPTION_MAX = 2000

type Found =
  | { row: Record<string, any> }
  | { candidates: { id: number; label: string }[]; message?: string }
  | { error: string }

type FindInput = { record_query?: string; record_id?: number; line?: string }

const usd = (n: unknown) => {
  const v = Number(n)
  return Number.isFinite(v) ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
const clip = (s: unknown, n = 60) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

// ── which line ──────────────────────────────────────────────────────────────

export interface LineLike {
  id: number
  item_name?: string | null
  description?: string | null
  quantity?: number | string | null
  price?: number | string | null
  unit_price?: number | string | null
}

const LINE_NOISE = new Set(['line', 'item', 'the', 'one', 'for', 'and', 'with', 'description', 'text', 'that', 'this'])

/** What a person sees for one line: its position, its name, and what it costs (read-only, to tell lines apart). */
export function lineLabel(line: LineLike, pos: number): string {
  const what = clip(line.item_name || line.description || 'line', 50)
  const qty = Number(line.quantity)
  const each = line.unit_price ?? line.price
  const money = Number.isFinite(qty) && each != null ? ` — ${qty} × ${usd(each)}` : ''
  // The wording as it stands, so "add a sentence to line 2" can be drafted
  // in full without guessing what is already there.
  const now = line.item_name && line.description ? ` — reads: "${clip(line.description, 120)}"` : ''
  return `Line ${pos}: ${what}${money}${now}`
}

/**
 * The one line `said` names, out of `lines` in the order the document shows
 * them. "line 3", "3", "#3" → the third. Words → the line whose name or
 * description holds all of them. Anything less certain comes back as
 * candidates (id = the line's POSITION, which is what the user is asked to
 * say back), never a guess.
 */
export function pickLine(lines: LineLike[], said: string | undefined):
  { line: LineLike; pos: number } | { candidates: { id: number; label: string }[] } | { error: string } {
  if (!lines.length) return { error: 'That document has no lines.' }
  const all = () => ({ candidates: lines.slice(0, 15).map((l, i) => ({ id: i + 1, label: lineLabel(l, i + 1) })) })
  const s = String(said ?? '').trim()
  if (!s) return lines.length === 1 ? { line: lines[0], pos: 1 } : all()
  const n = s.match(/^(?:line|item|row|#)?\s*#?\s*(\d{1,3})(?:st|nd|rd|th)?$/i)
  if (n) {
    const pos = Number(n[1])
    if (pos >= 1 && pos <= lines.length) return { line: lines[pos - 1], pos }
    return { error: `There is no line ${pos} — it has ${lines.length} line${lines.length === 1 ? '' : 's'}.` }
  }
  const words = [...new Set(s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !LINE_NOISE.has(w)))]
  if (!words.length) return all()
  const scored = lines.map((l, i) => {
    const hay = `${l.item_name || ''} ${l.description || ''}`.toLowerCase()
    return { l, pos: i + 1, n: words.filter((w) => hay.includes(w)).length }
  })
  const best = Math.max(...scored.map((x) => x.n))
  if (best === 0) return all()
  const top = scored.filter((x) => x.n === best)
  if (top.length === 1 && best === words.length) return { line: top[0].l, pos: top[0].pos }
  return { candidates: top.slice(0, 15).map((x) => ({ id: x.pos, label: lineLabel(x.l, x.pos) })) }
}

// ── the documents ───────────────────────────────────────────────────────────

const QUOTE_ANY = 'id=gt.0'

async function quoteRow(r: Rest, companyId: number, id: number) {
  return (await readRecordList(r,
    `quotes?select=id,quote_id,estimate_name,quote_amount,status,salesperson_id,lead_id,customer_id,summary&company_id=eq.${companyId}&id=eq.${id}&limit=1`))[0] || null
}

async function quoteLabelOf(r: Rest, companyId: number, q: any) {
  const who = (await forWhom(r, companyId, q)).name
  return `${q.quote_id || q.estimate_name || 'Estimate #' + q.id} — ${who}`
}

/** The estimate the user means, by number, name or customer — any status. */
async function findOneQuote(r: Rest, companyId: number, input: FindInput): Promise<{ q: any } | Found> {
  if (input.record_id) {
    const q = await quoteRow(r, companyId, Number(input.record_id))
    return q ? { q } : { error: `There's no estimate #${input.record_id} in this company.` }
  }
  const got: any = await findQuote(r, companyId, input.record_query || '', QUOTE_ANY)
  if (got.error) return { error: got.error }
  const rows = got.rows || []
  if (!rows.length) return { error: `I couldn't find an estimate matching "${input.record_query}".` }
  if (rows.length > 1) {
    const candidates = []
    for (const q of rows.slice(0, 6)) candidates.push({ id: q.id, label: await quoteLabelOf(r, companyId, q) })
    return { candidates, message: 'More than one estimate matches. Ask the user which one, then call again with record_id.' }
  }
  return { q: await quoteRow(r, companyId, rows[0].id) }
}

async function invoiceRow(r: Rest, companyId: number, id: number) {
  return (await readRecordList(r,
    `invoices?select=id,invoice_id,customer_id,job_id,amount,payment_status,is_locked&company_id=eq.${companyId}&id=eq.${id}&limit=1`))[0] || null
}

async function invoiceLabelOf(r: Rest, companyId: number, inv: any) {
  const c = inv.customer_id
    ? (await readRecordList(r, `customers?select=name,business_name&company_id=eq.${companyId}&id=eq.${inv.customer_id}&limit=1`))[0]
    : null
  const who = c?.business_name || c?.name
  return `${inv.invoice_id || 'INV-' + inv.id}${who ? ' — ' + who : ''}`
}

async function findOneInvoice(r: Rest, companyId: number, input: FindInput): Promise<{ inv: any } | Found> {
  if (input.record_id) {
    const inv = await invoiceRow(r, companyId, Number(input.record_id))
    return inv ? { inv } : { error: `There's no invoice #${input.record_id} in this company.` }
  }
  const got: any = await findInvoice(r, companyId, input.record_query || '', 'id=gt.0')
  if (got.error) return { error: got.error }
  const rows = got.rows || []
  if (!rows.length) return { error: `I couldn't find an invoice matching "${input.record_query}".` }
  if (rows.length > 1) {
    const candidates = []
    for (const inv of rows.slice(0, 6)) candidates.push({ id: inv.id, label: await invoiceLabelOf(r, companyId, inv) })
    return { candidates, message: 'More than one invoice matches. Ask the user which one, then call again with record_id.' }
  }
  return { inv: await invoiceRow(r, companyId, rows[0].id) }
}

const LOCKED = 'That invoice is locked (finalized) — its lines cannot be changed, by me or on the page. Unlock it on the invoice first.'

// ── finders the record rail calls (RecordTarget.findRow) ───────────────────

/** estimate_summary: the quote row itself. */
export async function findEstimateSummaryRow(r: Rest, caller: Caller, input: FindInput): Promise<Found> {
  const got = await findOneQuote(r, caller.companyId as number, input)
  if (!('q' in got)) return got
  const q = got.q
  return { row: { ...q, _label: await quoteLabelOf(r, caller.companyId as number, q) } }
}

const QUOTE_LINE_SELECT = 'id,quote_id,item_name,description,quantity,price,line_total,sort_order'
const INVOICE_LINE_SELECT = 'id,invoice_id,item_id,description,quantity,unit_price,line_total,sort_order,line_number'

/** estimate_line_description: one quote_lines row, found by its estimate then by "line 3" or its words. */
export async function findEstimateLineRow(r: Rest, caller: Caller, input: FindInput): Promise<Found> {
  const companyId = caller.companyId as number
  const got = await findOneQuote(r, companyId, input)
  if (!('q' in got)) return got
  const q = got.q
  const lines = await readRecordList(r,
    `quote_lines?select=${QUOTE_LINE_SELECT}&company_id=eq.${companyId}&quote_id=eq.${q.id}&order=sort_order.asc.nullslast,id.asc&limit=500`)
  const picked = pickLine(lines, input.line)
  if ('error' in picked) return picked
  if ('candidates' in picked) {
    return {
      candidates: picked.candidates,
      message: `Several lines on that estimate could be meant. Read them out, ask which one, then call again with record_id=${q.id} and line set to its number.`,
    }
  }
  const parent = await quoteLabelOf(r, companyId, q)
  return { row: { ...picked.line, _label: `${parent} — line ${picked.pos} (${clip(picked.line.item_name || picked.line.description, 50)})` } }
}

/** invoice_line_description: one invoice_lines row; a locked invoice is refused before anything is drafted. */
export async function findInvoiceLineRow(r: Rest, caller: Caller, input: FindInput): Promise<Found> {
  const companyId = caller.companyId as number
  const got = await findOneInvoice(r, companyId, input)
  if (!('inv' in got)) return got
  const inv = got.inv
  if (inv.is_locked) return { error: LOCKED }
  const lines = await readRecordList(r,
    `invoice_lines?select=${INVOICE_LINE_SELECT}&company_id=eq.${companyId}&invoice_id=eq.${inv.id}&order=sort_order.asc.nullslast,line_number.asc.nullslast,id.asc&limit=500`)
  const picked = pickLine(lines, input.line)
  if ('error' in picked) return picked
  if ('candidates' in picked) {
    return {
      candidates: picked.candidates,
      message: `Several lines on that invoice could be meant. Read them out, ask which one, then call again with record_id=${inv.id} and line set to its number.`,
    }
  }
  const parent = await invoiceLabelOf(r, companyId, inv)
  return { row: { ...picked.line, _label: `${parent} — line ${picked.pos} (${clip(picked.line.description, 50)})` } }
}

// ── who owns it, and what refuses it at apply time ─────────────────────────

/** An estimate's rep may change its text below manager. */
export async function quoteOwner(r: Rest, companyId: number, quoteId: number): Promise<number | null> {
  return (await quoteRow(r, companyId, quoteId))?.salesperson_id ?? null
}

export async function quoteLineOwner(r: Rest, companyId: number, lineId: number): Promise<number | null> {
  const line = (await readRecordList(r, `quote_lines?select=quote_id&company_id=eq.${companyId}&id=eq.${lineId}&limit=1`))[0]
  return line?.quote_id ? quoteOwner(r, companyId, line.quote_id) : null
}

/** Re-checked when the card is approved and when it is rolled back: the invoice may have been locked since. */
export async function invoiceLineGuard(r: Rest, companyId: number, lineId: number): Promise<string | null> {
  const line = (await readRecordList(r, `invoice_lines?select=invoice_id&company_id=eq.${companyId}&id=eq.${lineId}&limit=1`))[0]
  if (!line) return 'That invoice line no longer exists.'
  const inv = await invoiceRow(r, companyId, line.invoice_id)
  if (!inv) return 'That invoice no longer exists.'
  return inv.is_locked ? LOCKED : null
}

/** The text itself: plain, trimmed, one paragraph's worth. Returns an error sentence or null. */
export function checkDescription(value: string): string | null {
  const v = String(value ?? '').trim()
  if (!v) return 'Nothing to set — tell me the new wording.'
  if (v.length > DESCRIPTION_MAX) return `That is ${v.length} characters; a description holds ${DESCRIPTION_MAX}. Shorten it.`
  return null
}
