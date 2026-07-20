// AR (Accounts Receivable) helpers — single source of truth for "how much
// is owed to us" across Dashboard, Arnie, Frankie, Books, and the Job
// Detail widget. Previously each surface computed AR slightly differently
// and one or two ignored utility AR entirely, which is why HHH saw
// inflated totals on the Dashboard ($217k for one job) but correct
// numbers in Books ($19k customer + $163k utility).
//
// Two principles:
//   1. CUSTOMER balance is gross − discount_applied − applied payments.
//      Never sum inv.amount alone — that includes the utility incentive
//      and the deposit credit, neither of which the customer owes.
//   2. UTILITY AR is the unpaid utility_invoices amount — the rebate the
//      utility company owes us. It's real receivable, not optional context.
//
// All helpers handle both invoice shapes:
//   NEW shape: amount = gross project, discount = incentive + deposit credit
//   LEGACY shape: amount = net customer portion, discount = informational
//
// Detected by: discount > amount → treat as legacy.
//
// STRICTLY greater, not >=. A modern invoice whose discounts FULLY cover the
// project has discount_applied == amount exactly and the customer owes $0.
// The old >= test misread that as legacy and returned the full gross, billing
// the customer for the entire project (AZ Upark We Sell, inv 32610: $14,162.93
// incentive on a $14,162.93 job — its own utility invoice says net_cost $0 —
// was showing $14,162.93 due). Legacy invoices have amount = NET, so their
// informational discount is strictly larger; equality only happens on the
// modern fully-covered shape.

// ────────────────────────────── invoices ──────────────────────────────

/**
 * Is this invoice stored in the LEGACY shape (amount already net of the
 * incentive) rather than the modern one (amount = gross)?
 *
 * THE ONE definition — every surface must use this, never re-derive it.
 * It was open-coded in ~8 places (Books x3, InvoiceDetail x2, JobDetail x2,
 * CustomerPortal, collections-autopilot) and drifted, which is how a
 * fully-covered invoice ended up billing the whole project on some screens.
 *
 * STRICTLY greater. A modern invoice whose discounts fully cover the project
 * has disc === gross and owes $0; only a legacy row (amount = NET) carries a
 * discount larger than its own amount.
 */
export function isLegacyNetShape(gross, disc) {
  const g = Number(gross) || 0
  const d = Number(disc) || 0
  return d > 0 && d > g
}

// What this customer-facing invoice is asking the customer to pay AFTER
// netting out the utility incentive + any deposit credit. This is the
// number that should print on a statement of account.
export function invoiceCustomerTotal(inv) {
  const gross = Number(inv?.amount) || 0
  const disc = Number(inv?.discount_applied) || 0
  return isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc)
}

// Outstanding customer balance: customer total minus payments applied to
// this invoice. Pass either a paymentsByInvoiceId Map (preferred — O(1))
// or the raw payments array (filtered per call).
export function invoiceBalance(inv, paymentsArrOrMap = []) {
  const customer = invoiceCustomerTotal(inv)
  if (customer === 0) return 0
  let paid = 0
  if (paymentsArrOrMap instanceof Map) {
    paid = paymentsArrOrMap.get(inv.id) || 0
  } else if (Array.isArray(paymentsArrOrMap)) {
    paid = paymentsArrOrMap
      .filter(p => p.invoice_id === inv.id)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  }
  return Math.max(0, customer - paid)
}

// The stored payment_status an invoice SHOULD carry given how much has been
// paid against it. THE ONE definition — every write path must use this instead
// of open-coding a `totalPaid >= invoice.amount` test, which compares against
// the GROSS amount and ignores discount_applied (the utility incentive + any
// deposit credit the customer never owes). That gross comparison is why
// Energy Scout invoices sat on "Partially Paid" forever after the customer
// paid their full net portion (Biorge inv 32597: $1,778.44 net paid on a
// $7,113.77 gross read as half-paid), which in turn kept setter/rep
// commissions and money-in bonuses off payroll. HHH invoices carry no
// discount, so invoiceCustomerTotal === gross and their behavior is unchanged.
//
// extraFee: a CC processing fee added ON TOP of the customer total (the card
// payer owes their net portion plus the fee). Pass 0 for cash/check.
export function invoicePaymentStatus(inv, totalPaid, extraFee = 0) {
  const owed = invoiceCustomerTotal(inv) + (Number(extraFee) || 0)
  const paid = Number(totalPaid) || 0
  // owed <= 0 (fully incentive-covered) → nothing to collect → Paid.
  if (paid >= owed - 0.01) return 'Paid'
  if (paid > 0) return 'Partially Paid'
  return 'Pending'
}

// Open = not Paid / Void / Cancelled. Treats anything else as still owed
// so legacy statuses like "Sent" / "Pending" / "Overdue" / "Partially Paid"
// all count.
export function isInvoiceOpen(inv) {
  const s = inv?.payment_status
  return s !== 'Paid' && s !== 'Void' && s !== 'Cancelled'
}

// Build the payments-by-invoice index once, then reuse for many balance
// calls. Cheap, O(n) over payments.
export function paymentsByInvoiceIndex(payments) {
  const map = new Map()
  for (const p of payments || []) {
    if (!p.invoice_id) continue
    map.set(p.invoice_id, (map.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
  }
  return map
}

// ────────────────────────────── totals ──────────────────────────────

// Total customer AR — sum of balances on every open invoice. Pass payments
// as either a Map (preferred) or array.
export function totalCustomerAR(invoices = [], paymentsArrOrMap = []) {
  const idx = paymentsArrOrMap instanceof Map
    ? paymentsArrOrMap
    : paymentsByInvoiceIndex(paymentsArrOrMap)
  return (invoices || [])
    .filter(isInvoiceOpen)
    .reduce((s, i) => s + invoiceBalance(i, idx), 0)
}

// Total utility AR — sum of unpaid utility_invoices. (Utility invoice
// records don't carry a discount field; the amount IS what the utility
// owes us.)
export function totalUtilityAR(utilityInvoices = []) {
  return (utilityInvoices || [])
    .filter(u => u?.payment_status !== 'Paid' && u?.payment_status !== 'Void')
    .reduce((s, u) => s + (Number(u.amount || u.incentive_amount) || 0), 0)
}

// Combined AR — what every surface should show as "accounts receivable"
// unless it's explicitly labeling one or the other.
export function totalAR(invoices = [], utilityInvoices = [], paymentsArrOrMap = []) {
  return totalCustomerAR(invoices, paymentsArrOrMap) + totalUtilityAR(utilityInvoices)
}

// ────────────────────────────── per-job ──────────────────────────────

// AR snapshot for one job: customer balance + utility balance, plus the
// invoice records so the caller can render details. Used by the
// JobDetail "Who Pays What" widget so it shows BOTH sides of the AR.
export function jobARSnapshot(jobId, invoices = [], utilityInvoices = [], paymentsArrOrMap = []) {
  const idx = paymentsArrOrMap instanceof Map
    ? paymentsArrOrMap
    : paymentsByInvoiceIndex(paymentsArrOrMap)
  const jobInvoices = (invoices || []).filter(i => i.job_id === jobId)
  const customerBalance = jobInvoices
    .filter(isInvoiceOpen)
    .reduce((s, i) => s + invoiceBalance(i, idx), 0)
  const jobUtility = (utilityInvoices || []).filter(u => u.job_id === jobId)
  const utilityBalance = jobUtility
    .filter(u => u?.payment_status !== 'Paid' && u?.payment_status !== 'Void')
    .reduce((s, u) => s + (Number(u.amount || u.incentive_amount) || 0), 0)
  return {
    customerBalance,
    utilityBalance,
    combined: customerBalance + utilityBalance,
    customerInvoices: jobInvoices,
    utilityInvoices: jobUtility,
  }
}
