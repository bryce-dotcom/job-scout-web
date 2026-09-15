// "Halifax paid $3,200 by check."
//
// The payment the Invoices page records when someone taps Record Payment
// (src/pages/InvoiceDetail.jsx, the manual-payment handler): a payments
// row against the invoice, the invoice's payment_status re-derived from
// what has now been paid, and the receipt emailed to the address on the
// invoice. Three things that page had to learn the hard way are carried
// over on purpose:
//
//   - The status comes from the ONE rule (arHelpers.invoicePaymentStatus)
//     against the customer's NET total, never the gross — or a rebate
//     invoice sticks on "Partially Paid" after the customer pays in full
//     and the commissions behind it never reach payroll (Biorge).
//     customer_owes is a generated column that IS invoiceCustomerTotal, so
//     the net is read, not recomputed. The status rule is transliterated
//     below and a test pins it to the JavaScript.
//   - The utility's incentive is not a customer payment. An amount that
//     matches the incentive owed is refused with the same explanation the
//     page gives.
//   - A card payment carries a processing fee the page adds to the invoice
//     when the company charges one. Arnie does not do fee arithmetic; when
//     the fee is on, card payments go through the page.
//
// Who: admin. Money in is the owner's ledger; a tech does not book it.
// The receipt goes out on approve and cannot be unsent — the card says so.
// Rollback deletes the payment row (what the page's Delete does) and
// re-derives the status; the receipt stays sent.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const usd = (n: number) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const INV_SEL = 'id,invoice_id,customer_id,job_id,amount,discount_applied,credit_card_fee,payment_status,customer_owes,utility_owes,utility_paid_at,sent_to_email,business_unit,portal_token,invoice_type,due_date'
const OPEN_NOT = ['Paid', 'Void', 'Cancelled']

/**
 * arHelpers.js, transliterated. utilityHasPaid + invoicePaymentStatus.
 * `owed` is customer_owes + the CC fee. src/lib/arniePayment.test.js holds
 * the two side by side.
 */
export const utilityHasPaid = (inv: any) => (Number(inv?.utility_owes) || 0) > 0 && !!inv?.utility_paid_at
export function paymentStatus(inv: any, totalPaid: number): string {
  const owed = (Number(inv?.customer_owes) || 0) + (Number(inv?.credit_card_fee) || 0)
  const paid = Number(totalPaid) || 0
  if (owed <= 0.01) return paid > 0 || utilityHasPaid(inv) ? 'Paid' : 'Pending'
  if (paid >= owed - 0.01) return 'Paid'
  if (paid > 0) return 'Partially Paid'
  return 'Pending'
}

/** What the customer has paid on this invoice — the utility's money is not the customer's. */
async function customerPaid(r: Rest, companyId: number, invoiceId: number) {
  const rows = await readRecordList(r, `payments?select=amount,paid_by&company_id=eq.${companyId}&invoice_id=eq.${invoiceId}`)
  return rows.filter((p: any) => p.paid_by !== 'utility').reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
}

const METHODS: [RegExp, string][] = [
  [/\b(cash)\b/, 'Cash'],
  [/\b(check|cheque|chk)\b/, 'Check'],
  [/\b(credit card|card|visa|mastercard|amex|cc)\b/, 'Credit Card'],
  [/\b(ach|bank transfer|wire|bank|transfer|eft)\b/, 'ACH'],
  [/\bvenmo\b/, 'Venmo'],
  [/\bzelle\b/, 'Zelle'],
  [/\bpaypal\b/, 'PayPal'],
  [/\bfinanc/, 'Financing'],
]
const methodOf = (s: string) => { const q = String(s || '').toLowerCase(); for (const [re, m] of METHODS) if (re.test(q)) return m; return null }
const amountOf = (s: string) => { const n = Number(String(s || '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN }

const custLabel = (c: any) => c?.business_name && c?.name ? `${c.business_name} (${c.name})` : (c?.business_name || c?.name || '')
const invLabel = (inv: any, cust: any) => `${inv.invoice_id || 'INV-' + inv.id}${cust ? ' — ' + custLabel(cust) : ''}`

async function findInvoice(r: Rest, companyId: number, said: string) {
  const term = String(said || '').replace(/[*,()]/g, ' ').trim()
  const NOISE = new Set(['invoice', 'invoices', 'the', 'for', 'from', 'paid', 'payment', 'their', 'that', 'this', 'bill', 'balance', 'job', 'customer'])
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !NOISE.has(w)))]
  if (!words.length) return { error: 'Tell me which invoice — the number, or the customer it is for.' }
  const open = `payment_status=not.in.(${OPEN_NOT.map((s) => `"${s}"`).join(',')})`
  const hits = new Map<number, { row: any; n: number }>()
  const bump = (rs: any[]) => { for (const x of rs) { const h = hits.get(x.id) || { row: x, n: 0 }; h.n += 1; hits.set(x.id, h) } }
  for (const w of words) {
    bump(await readRecordList(r, `invoices?select=${INV_SEL}&company_id=eq.${companyId}&${open}&invoice_id=ilike.*${w}*&limit=30`))
    const custs = await readRecordList(r, `customers?select=id&company_id=eq.${companyId}&or=(name.ilike.*${w}*,business_name.ilike.*${w}*)&limit=40`)
    const jobs = await readRecordList(r, `jobs?select=id&company_id=eq.${companyId}&or=(job_id.ilike.*${w}*,job_title.ilike.*${w}*,customer_name.ilike.*${w}*,business_name.ilike.*${w}*)&limit=40`)
    const ors = [custs.length ? `customer_id.in.(${custs.map((c: any) => c.id).join(',')})` : '', jobs.length ? `job_id.in.(${jobs.map((j: any) => j.id).join(',')})` : ''].filter(Boolean)
    if (ors.length) bump(await readRecordList(r, `invoices?select=${INV_SEL}&company_id=eq.${companyId}&${open}&or=(${ors.join(',')})&limit=30`))
  }
  const ranked = [...hits.values()].sort((a, b) => b.n - a.n)
  const best = ranked[0]?.n ?? 0
  return { rows: ranked.filter((h) => h.n === best).map((h) => h.row) }
}

async function customerOf(r: Rest, companyId: number, id: number | null) {
  return id ? (await readRecordList(r, `customers?select=id,name,business_name,email&company_id=eq.${companyId}&id=eq.${id}&limit=1`))[0] || null : null
}

async function ccFeeOn(r: Rest, companyId: number) {
  const rows = await readRecordList(r, `settings?select=key,value&company_id=eq.${companyId}&key=in.(invoice_cc_fee_enabled,invoice_accept_credit_card)`)
  const get = (k: string, d: boolean) => { const v = rows.find((s: any) => s.key === k)?.value; if (v == null) return d; try { return JSON.parse(v) === true } catch { return String(v) === 'true' } }
  return get('invoice_cc_fee_enabled', true) && get('invoice_accept_credit_card', false)
}

export async function preparePayment(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  if (caller.level < 3) return { ok: false as const, error: 'Recording money in is an admin\'s job — it goes straight into the books. Ask an admin, or send them the details.' }

  const amount = amountOf(f.amount)
  if (!(amount > 0)) return { ok: false as const, error: `I need the amount — I read "${f.amount || ''}" and that is not a number.` }
  const method = methodOf(f.method)
  if (!method) return { ok: false as const, error: `How did they pay? Cash, check, card, ACH, Venmo, Zelle, PayPal or financing — I got "${f.method || ''}".` }
  const today = new Date().toISOString().slice(0, 10)
  const date = String(f.date || '').trim() || today
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) return { ok: false as const, error: `Give me the date as YYYY-MM-DD — I got "${f.date}".` }
  if (date > today) return { ok: false as const, error: `${date} is in the future. A payment is recorded on the day it arrived.` }
  if (method === 'Credit Card' && await ccFeeOn(r, companyId)) {
    return { ok: false as const, error: 'This company adds a processing fee to card payments, and the fee is worked out on the invoice page. Record card payments there; I can take cash, check, ACH, Venmo, Zelle, PayPal or financing.' }
  }

  const found = await findInvoice(r, companyId, f.invoice || '')
  if ('error' in found) return { ok: false as const, error: found.error }
  if (!found.rows.length) return { ok: false as const, error: `I do not find an open invoice for "${String(f.invoice || '').trim()}". Give me the invoice number, or check it is not already Paid.` }
  if (found.rows.length > 1) {
    const labelled = await Promise.all(found.rows.slice(0, 6).map(async (inv: any) => ({ id: inv.id, label: `${invLabel(inv, await customerOf(r, companyId, inv.customer_id))} · ${usd(Number(inv.customer_owes) || 0)} · ${inv.payment_status || 'Pending'}` })))
    return { needs_choice: labelled, message: 'More than one open invoice matches. Ask which, then call again with the invoice number as listed.' }
  }
  const inv = found.rows[0]
  const cust = await customerOf(r, companyId, inv.customer_id)
  const paidBefore = await customerPaid(r, companyId, inv.id)
  const owed = (Number(inv.customer_owes) || 0) + (Number(inv.credit_card_fee) || 0)
  const balance = Math.max(0, owed - paidBefore)

  // The utility's incentive arriving is not the customer paying.
  const util = Number(inv.utility_owes) || 0
  if (util > 0 && !inv.utility_paid_at && Math.abs(amount - util) < 0.01) {
    return { ok: false as const, error: `${usd(amount)} is the utility incentive on ${invLabel(inv, cust)}, not a customer payment. It is already taken off what the customer owes (${usd(balance)} left); recording it here would show the invoice overpaid and count the money twice in revenue. The utility's money is recorded on the utility invoice.` }
  }
  if (amount > balance + 0.01) {
    return { ok: false as const, error: `${invLabel(inv, cust)} has ${usd(balance)} left on it; ${usd(amount)} would overpay by ${usd(amount - balance)}. Is part of this for another invoice, or is it a deposit on the next job?` }
  }
  const statusAfter = paymentStatus(inv, paidBefore + amount)
  const receipt = [inv.sent_to_email, cust?.email].map((e) => String(e || '').trim()).find((e) => EMAIL.test(e)) || null
  const reference = String(f.reference || '').trim().slice(0, 140)
  const note = [reference && `Ref: ${reference}`, `Recorded via Arnie by ${caller.email}`].filter(Boolean).join(' · ')

  return {
    ok: true as const,
    columns: {
      invoice_db_id: inv.id, invoice_label: invLabel(inv, cust), customer_id: inv.customer_id ?? null, job_id: inv.job_id ?? null,
      amount, method, date, notes: note, receipt_email: receipt,
      paid_before: paidBefore, status_before: inv.payment_status ?? null, status_after: statusAfter, balance_before: balance,
    },
    display: [
      { label: 'Invoice', value: invLabel(inv, cust) },
      { label: 'Amount', value: `${usd(amount)} by ${method}${reference ? ' · ' + reference : ''}` },
      { label: 'Date', value: date },
      { label: 'Balance', value: `${usd(balance)} → ${usd(Math.max(0, balance - amount))} · ${inv.payment_status || 'Pending'} → ${statusAfter}` },
      { label: 'Receipt', value: receipt ? `emails to ${receipt} on approve — that part cannot be undone` : 'no email on file, so none goes out' },
    ],
  }
}

/** The page's write: the row, the status, the receipt. Refuses if the invoice moved since the draft. */
export async function applyPayment(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const [inv] = await readRecordList(r, `invoices?select=${INV_SEL}&company_id=eq.${companyId}&id=eq.${c.invoice_db_id}&limit=1`)
  if (!inv) return { ok: false as const, error: 'That invoice no longer exists.' }
  const paidNow = await customerPaid(r, companyId, inv.id)
  if (Math.abs(paidNow - Number(c.paid_before)) > 0.005 || String(inv.payment_status ?? '') !== String(c.status_before ?? '')) {
    return { ok: false as const, stale: true, error: `${c.invoice_label} changed since I drafted this — it is ${inv.payment_status} with ${usd(paidNow)} paid. Ask me again and I will redraft it.` }
  }
  const ins = await fetch(`${r.url}/rest/v1/payments`, {
    method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, invoice_id: inv.id, customer_id: c.customer_id ?? null, job_id: c.job_id ?? null,
      amount: c.amount, date: c.date, method: c.method, status: 'Completed', source: 'arnie', notes: c.notes || null,
    }),
  })
  if (!ins.ok) return { ok: false as const, error: `Could not record the payment: ${ins.status} ${await ins.text()}` }
  const row = (await ins.json())?.[0]
  const totalPaid = paidNow + Number(c.amount)
  const status = paymentStatus(inv, totalPaid)
  const up = await patchRow(r, 'invoices', companyId, inv.id, { payment_status: status, updated_at: new Date().toISOString() })
  if (!up.ok) return { ok: false as const, error: `Recorded the payment but could not update the invoice status: ${up.error}` }

  let receipt: string = 'none'
  if (c.receipt_email) receipt = await sendReceipt(r, companyId, inv, c, totalPaid) ? `sent to ${c.receipt_email}` : `failed to ${c.receipt_email}`
  return { ok: true as const, id: row.id, label: `${usd(Number(c.amount))} on ${c.invoice_label}`, created: { payment_id: row.id, status_after: status, receipt } }
}

async function sendReceipt(r: Rest, companyId: number, inv: any, c: any, totalPaid: number): Promise<boolean> {
  try {
    const [co] = await readRecordList(r, `companies?select=company_name,phone,owner_email,remit_to_address,address,logo_url&id=eq.${companyId}&limit=1`)
    const settings = await readRecordList(r, `settings?select=key,value&company_id=eq.${companyId}&key=in.(business_units,company_logo_url)`)
    let bu: any = null
    try { bu = inv.business_unit ? (JSON.parse(settings.find((s: any) => s.key === 'business_units')?.value || '[]') as any[]).find((u) => u.name === inv.business_unit) : null } catch { bu = null }
    const cust = await customerOf(r, companyId, inv.customer_id)
    const owed = (Number(inv.customer_owes) || 0) + (Number(inv.credit_card_fee) || 0)
    const res = await fetch(`${r.url}/functions/v1/send-receipt`, {
      method: 'POST', headers: hdr(r),
      body: JSON.stringify({
        recipient_email: c.receipt_email, customer_name: cust?.name || cust?.business_name || '',
        invoice_number: inv.invoice_id || `INV-${inv.id}`,
        payment_amount: c.amount, payment_method: c.method, payment_date: c.date,
        // The customer's balance, not gross minus paid — a rebate invoice's receipt should not tell them they still owe the incentive.
        balance_remaining: Math.max(0, owed - totalPaid), invoice_total: owed, total_paid: totalPaid,
        company_name: co?.company_name || '', business_unit_name: bu?.name || inv.business_unit || '',
        business_unit_phone: bu?.phone || co?.phone || '', business_unit_email: bu?.email || co?.owner_email || '',
        business_unit_address: bu?.address || co?.remit_to_address || co?.address || '',
        logo_url: bu?.logo_url || settings.find((s: any) => s.key === 'company_logo_url')?.value || co?.logo_url || '',
        portal_url: inv.portal_token ? `https://jobscout.appsannex.com/portal/${inv.portal_token}` : null,
      }),
    })
    const j = await res.json().catch(() => ({}))
    return !!j?.success
  } catch { return false }
}

/** The page's Delete: the row goes, the status is re-derived. The receipt already went. */
export async function rollbackPayment(r: Rest, companyId: number, prop: any) {
  const id = prop.payload?.created_id
  if (!id) return { ok: false as const, error: 'I have no record of the payment this made.' }
  const [p] = await readRecordList(r, `payments?select=id,invoice_id,source,refunded_amount&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!p) return { ok: true as const, deleted: 0 }
  if (p.source !== 'arnie') return { ok: false as const, error: 'That payment was not recorded by me; delete it from the invoice page.' }
  if (Number(p.refunded_amount) > 0) return { ok: false as const, error: 'That payment has been refunded since. Leave the record; it is the history of the refund.' }
  const del = await fetch(`${r.url}/rest/v1/payments?id=eq.${p.id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  if (!del.ok) return { ok: false as const, error: `Could not remove the payment: ${del.status} ${await del.text()}` }
  const [inv] = await readRecordList(r, `invoices?select=${INV_SEL}&company_id=eq.${companyId}&id=eq.${p.invoice_id}&limit=1`)
  if (inv) await patchRow(r, 'invoices', companyId, inv.id, { payment_status: paymentStatus(inv, await customerPaid(r, companyId, inv.id)), updated_at: new Date().toISOString() })
  return { ok: true as const, deleted: 1 }
}
