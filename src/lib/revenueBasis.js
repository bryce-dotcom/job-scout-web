// Revenue recognition basis — shared by the Dashboard and Books so the two
// always agree and a company can pick how it counts revenue.
//
//   cash    — money actually COLLECTED in the period: payments recorded
//             against invoices + lead/job deposits + collected utility
//             incentives. (Counts each dollar once; the old "paid-invoice
//             gross + bank deposits" formula double-counted and swept in
//             internal transfers.)
//   accrual — revenue recognized when BILLED: the customer-net of invoices
//             issued in the period + utility incentives billed. Deposits are
//             unearned until invoiced, so they're excluded here.
//
// All inputs are plain arrays already scoped to the company / business unit by
// the caller; `inRange(dateString)` decides which period a record falls in.

import { isLegacyNetShape } from './arHelpers'

export const BASIS_CASH = 'cash'
export const BASIS_ACCRUAL = 'accrual'

const num = (v) => parseFloat(v) || 0
const isCollected = (p) => (p.status || 'Completed') !== 'Refunded' && (p.status || '') !== 'Voided'

// Customer-net of an invoice = gross minus the total deduction (utility
// incentive + project discount + deposit credit). Legacy-net invoices already
// store the net in `amount`, so don't subtract again.
// Uses the shared predicate — this file had its own `disc >= gross` copy, which
// counted a fully-covered invoice's ENTIRE gross as accrual revenue instead of
// $0. Never re-derive the legacy-net test.
export function invoiceNet(inv) {
  const gross = num(inv.amount)
  const disc = num(inv.discount_applied)
  return isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc)
}

// When the utility's money arrived. paid_at is the receipt date the office
// records when it marks the incentive paid (and can correct afterwards).
//
// This used to read updated_at, and that was a landmine: ANY edit to the row
// re-dated the revenue. On 2026-09-10 a data fix named the utility on all 28
// rows, and every incentive collected since March — $432,847.96 — moved into
// September's cash revenue on the dashboard. The date money arrived is a fact
// about the money, not about the last time someone touched the record.
//
// updated_at remains only as the fallback for a row marked Paid before paid_at
// existed. The same rule was open-coded on the Dashboard twice and in Books
// once; they all call this now.
export function incentiveReceivedAt(u) {
  return u?.paid_at || u?.updated_at || u?.created_at || null
}

// Collected utility incentives that arrived inside the period.
export function collectedIncentives(utilityInvoices = [], inRange = () => true) {
  return (utilityInvoices || [])
    .filter(i => i.payment_status === 'Paid' && inRange(incentiveReceivedAt(i)))
    .reduce((s, i) => s + num(i.amount ?? i.incentive_amount), 0)
}

export function cashRevenue({ payments = [], leadPayments = [], utilityInvoices = [] }, inRange) {
  // Trade-credit applications reduce an invoice balance but are NOT cash — they
  // draw down credit HHH already holds with a trade partner. Excluding them here
  // keeps cash revenue from being overstated.
  const pay = (payments || []).filter(p => isCollected(p) && p.method !== 'Trade Credit' && inRange(p.date || p.created_at)).reduce((s, p) => s + num(p.amount), 0)
  const dep = (leadPayments || []).filter(d => inRange(d.date_created || d.created_at)).reduce((s, d) => s + num(d.amount), 0)
  const inc = collectedIncentives(utilityInvoices, inRange)
  return pay + dep + inc
}

export function accrualRevenue({ invoices = [], utilityInvoices = [] }, inRange) {
  const cust = (invoices || []).filter(i => inRange(i.invoice_date || i.created_at)).reduce((s, i) => s + invoiceNet(i), 0)
  const inc = (utilityInvoices || []).filter(i => inRange(i.created_at)).reduce((s, i) => s + num(i.amount ?? i.incentive_amount), 0)
  return cust + inc
}

export function computeRevenue(basis, data, inRange) {
  return basis === BASIS_ACCRUAL ? accrualRevenue(data, inRange) : cashRevenue(data, inRange)
}

// Cash-basis expenses (money actually paid out) — the mirror of the revenue
// double-count. Bank outflows (Plaid positive, non-transfer) are the actual
// money out; a manual expense carrying a plaid_transaction_id is the SAME
// purchase as one of those bank rows, so only manual expenses with NO bank
// link are added (cash purchases, receipts not yet reconciled). Counting
// manual + all-bank together double-counted reconciled expenses.
export function cashExpenses({ expenses = [], plaidTransactions = [] }, inRange) {
  const bank = (plaidTransactions || []).filter(t => t.amount > 0 && !t.is_transfer && inRange(t.date)).reduce((s, t) => s + num(t.amount), 0)
  const manualUnlinked = (expenses || []).filter(e => !e.plaid_transaction_id && inRange(e.date || e.created_at)).reduce((s, e) => s + num(e.amount), 0)
  return bank + manualUnlinked
}

// Accrual expenses: what the business INCURRED in the window, paid or not.
//   • manual expenses by expense_date (incurred), linked to a bank row or not
//   • vendor bills by bill_date, whatever has been paid on them
//   • bank outflows that are neither a linked manual expense nor a bill
//     payment (a bill payment reaching the bank is the bill, already counted;
//     matched by amount within 3 days of a bill_payments row)
// Everything else in the feed (fuel, a card swipe at the supply house with no
// bill) is an expense the moment it happens on either basis.
export function accrualExpenses({ expenses = [], plaidTransactions = [], bills = [], billPayments = [] }, inRange) {
  const manual = (expenses || []).filter(e => inRange(e.date || e.expense_date || e.created_at)).reduce((s, e) => s + num(e.amount), 0)
  const billed = (bills || []).filter(b => inRange(b.bill_date || b.created_at)).reduce((s, b) => s + num(b.amount), 0)
  const linkedTxnIds = new Set((expenses || []).map(e => e.plaid_transaction_id).filter(Boolean))
  const paidBills = (billPayments || []).map(p => ({ cents: Math.round(num(p.amount) * 100), at: new Date(p.paid_at || p.created_at).getTime() }))
  const isBillPayment = (t) => {
    const cents = Math.round(num(t.amount) * 100)
    const at = new Date(t.date).getTime()
    return paidBills.some(p => p.cents === cents && Number.isFinite(p.at) && Math.abs(p.at - at) <= 3 * 86400000)
  }
  const bank = (plaidTransactions || [])
    .filter(t => t.amount > 0 && !t.is_transfer && inRange(t.date) && !linkedTxnIds.has(t.id) && !isBillPayment(t))
    .reduce((s, t) => s + num(t.amount), 0)
  return manual + billed + bank
}

// The one entry point pages should use, mirroring computeRevenue.
export function computeExpenses(basis, data, inRange) {
  return basis === BASIS_ACCRUAL ? accrualExpenses(data, inRange) : cashExpenses(data, inRange)
}
