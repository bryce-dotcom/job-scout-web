// Reconciling a bank deposit against what the books already say.
//
// Books matched a deposit to ONE customer invoice with ONE new payment. Real
// deposits are not shaped like that (Tracy, 2026-09-16, three tickets in an
// afternoon):
//
//   - one Jan Pro cheque for $670 paying three invoices, each payment already
//     entered by hand that morning
//   - SRP's $57,372.68 cheque settling two utility incentives, both already
//     recorded on their utility records
//   - Evergreen's $6,524 ACH — the utility's money — which had no customer
//     invoice to match against at all
//
// So a deposit can be matched to a SET of things already recorded (customer
// payments, utility settlements, or both), or split into several new ones.
// Nothing here writes; Books does the I/O with the results.

import { findSubset } from './walletReconcile'
import { expectedUtilityAmount } from './utilitySettlement'

const CENTS = (n) => Math.round((parseFloat(n) || 0) * 100)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const DAY = 86400000

/**
 * Recorded money with no bank deposit linked yet, as one list the deposit can
 * be matched against. Customer payments and utility settlements are the same
 * thing to the bank — money that arrived.
 *
 * @param payments   payments rows with source_transaction_id null (+ invoice join)
 * @param settlements utility_invoices rows Paid, source_transaction_id null (+ invoice join)
 * @param depositDate 'YYYY-MM-DD'
 * @param windowDays  how far either side of the deposit a recording may sit
 */
export function recordedEntries({ payments = [], settlements = [], depositDate, windowDays = 14 } = {}) {
  const depTime = new Date(depositDate).getTime()
  const near = (d) => {
    const t = new Date(d).getTime()
    return Number.isFinite(t) && Number.isFinite(depTime) && Math.abs(t - depTime) <= windowDays * DAY
  }
  const out = []
  for (const p of payments || []) {
    if (!p || p.source_transaction_id != null || !(CENTS(p.amount) > 0) || !near(p.date)) continue
    out.push({
      kind: 'payment', key: `payment:${p.id}`, id: p.id, amount: r2(p.amount), date: p.date,
      invoiceId: p.invoice_id ?? null,
      label: `${p.invoice?.invoice_id || `Invoice ${p.invoice_id}`}${p.invoice?.customer?.name ? ` — ${p.invoice.customer.name}` : ''}`,
      detail: [p.method, p.notes].filter(Boolean).join(' · '),
      row: p,
    })
  }
  for (const u of settlements || []) {
    if (!u || u.source_transaction_id != null || !(CENTS(u.amount) > 0) || !near(u.paid_at)) continue
    out.push({
      kind: 'settlement', key: `settlement:${u.id}`, id: u.id, amount: r2(u.amount), date: u.paid_at,
      invoiceId: u.invoice_id ?? null,
      label: `${u.utility_name || 'Utility'} incentive${u.invoice?.invoice_id ? ` on ${u.invoice.invoice_id}` : ''}${u.invoice?.customer?.name ? ` — ${u.invoice.customer.name}` : ''}`,
      detail: 'utility settlement',
      row: u,
    })
  }
  return out
}

/**
 * The recorded entries that add up to the deposit, exactly. One entry is the
 * common case (a cheque banked days after it was entered); several is a
 * cheque that paid several invoices (Jan Pro) or a utility's cheque covering
 * several jobs (SRP). Prefers entries that share the deposit's date, and
 * fewer entries over more.
 *
 * @param depositDate 'YYYY-MM-DD' — entries recorded that day are tried first
 * @returns { entries, total } or null
 */
export function findRecordedSet(entries, depositAmount, depositDate = null) {
  const list = (entries || []).filter((e) => e && CENTS(e.amount) > 0)
  const target = CENTS(depositAmount)
  if (!list.length || target <= 0) return null
  // One entry, exact.
  const one = list.find((e) => Math.abs(CENTS(e.amount) - target) <= 1)
  if (one) return { entries: [one], total: one.amount }
  // Several. Try the entries recorded on the deposit's own day first — a
  // cheque's parts are entered together — then everything in the window.
  const day = String(depositDate || '').slice(0, 10)
  const sameDay = day ? list.filter((e) => String(e.date || '').slice(0, 10) === day) : []
  for (const pool of [sameDay, list]) {
    const capped = pool.slice(0, 40)
    if (capped.length < 2) continue
    const subset = findSubset(capped.map((e) => CENTS(e.amount)), target)
    if (subset && subset.length > 1) {
      const chosen = subset.map((k) => capped[k])
      return { entries: chosen, total: r2(chosen.reduce((s, e) => s + e.amount, 0)) }
    }
  }
  return null
}
/**
 * When nothing adds up exactly: the recorded entries from the deposit's own
 * day, with the gap named. SRP's cheque was $57,372.68; the two settlements
 * recorded that day total $56,892.68. The $480.00 is the question, and a
 * reconciler needs to see it, not a blank list.
 *
 * @returns { entries, total, gap } or null (nothing recorded that day, or the gap is too big to be the same money)
 */
export function nearestRecordedSet(entries, depositAmount, depositDate, { maxGapPct = 0.05 } = {}) {
  const day = String(depositDate || '').slice(0, 10)
  const sameDay = (entries || []).filter((e) => e && String(e.date || '').slice(0, 10) === day && CENTS(e.amount) > 0)
  if (!sameDay.length) return null
  const total = r2(sameDay.reduce((s, e) => s + e.amount, 0))
  const gap = r2(depositAmount - total)
  if (Math.abs(gap) < 0.005) return null // that is an exact set; findRecordedSet already has it
  if (Math.abs(gap) > Math.abs(depositAmount) * maxGapPct) return null
  return { entries: sameDay, total, gap }
}

/**
 * Open utility receivables — the other party's balance on an invoice — as
 * match targets. A deposit from the utility settles one of these.
 *
 * @param invoices  invoices carrying a utility debt: utility_owes > 0, utility_paid_at null (+ customer join)
 * @param rows      the linked utility_invoices rows (Open), keyed by invoice_id
 * @param orphans   utility_invoices rows Open with no invoice link
 */
export function utilityTargets({ invoices = [], rows = [], orphans = [] } = {}) {
  const rowByInvoice = new Map((rows || []).filter((r) => r && r.invoice_id != null).map((r) => [r.invoice_id, r]))
  const out = []
  for (const inv of invoices || []) {
    if (!inv || !(CENTS(inv.utility_owes) > 0) || inv.utility_paid_at) continue
    const row = rowByInvoice.get(inv.id) || null
    const expected = row ? expectedUtilityAmount(row, inv) : r2(inv.utility_owes)
    out.push({
      kind: 'utility', key: `utility:${inv.id}`, invoiceId: inv.id, invoice: inv, row,
      open: r2(inv.utility_owes), expected: r2(expected),
      label: `${row?.utility_name || 'Utility'} incentive on ${inv.invoice_id || `invoice ${inv.id}`}${inv.customer?.name ? ` — ${inv.customer.name}` : ''}`,
      detail: 'the utility owes this',
    })
  }
  for (const u of orphans || []) {
    if (!u || u.invoice_id != null || !(CENTS(u.amount) > 0) || u.payment_status === 'Paid' || u.payment_status === 'Void') continue
    out.push({
      kind: 'utility', key: `utility-row:${u.id}`, invoiceId: null, invoice: null, row: u,
      open: r2(u.amount), expected: r2(expectedUtilityAmount(u, null)),
      label: `${u.utility_name || 'Utility'} incentive${u.customer_name ? ` — ${u.customer_name}` : ''} (no invoice)`,
      detail: 'the utility owes this',
    })
  }
  return out
}

/**
 * Split a deposit across chosen targets, each `{ key, open }`, in the order
 * they were picked: each takes what it is owed until the deposit runs out.
 * Amounts the user has typed (`amounts[key]`) win over the default.
 *
 * @returns { rows: [{ key, amount, open, short }], allocated, leftover }
 */
export function splitPlan(targets, depositAmount, amounts = {}) {
  let remaining = r2(depositAmount)
  const rows = []
  for (const t of targets || []) {
    const typed = amounts && amounts[t.key] !== undefined && amounts[t.key] !== '' ? parseFloat(amounts[t.key]) : NaN
    const dflt = Math.max(0, Math.min(r2(t.open), remaining))
    const amount = Number.isFinite(typed) && typed >= 0 ? r2(typed) : dflt
    rows.push({ key: t.key, amount, open: r2(t.open), short: r2(Math.max(0, r2(t.open) - amount)) })
    remaining = r2(remaining - amount)
  }
  const allocated = r2(rows.reduce((s, r) => s + r.amount, 0))
  return { rows, allocated, leftover: r2(depositAmount - allocated) }
}

/** A recorded entry's row + kind → the fields Books writes on the bank row. */
export function bankRowPointer(entry) {
  if (!entry) return { matched_invoice_id: null, matched_payment_id: null, matched_utility_invoice_id: null }
  if (entry.kind === 'payment') return { matched_invoice_id: entry.invoiceId ?? null, matched_payment_id: entry.id, matched_utility_invoice_id: null }
  return { matched_invoice_id: entry.invoiceId ?? null, matched_payment_id: null, matched_utility_invoice_id: entry.id }
}

/** Is this bank row already matched to something? One definition for Books. */
export function depositIsMatched(t) {
  return !!(t?.matched_invoice_id || t?.matched_payment_id || t?.matched_utility_invoice_id)
}
