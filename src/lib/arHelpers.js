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

// A payment the CUSTOMER made. Once a rebate invoice carries both debts, a
// utility's payment lands on the same invoice_id as the customer's, and
// summing both would report the customer's balance as settled when only the
// utility has paid.
//
// Written as "not the utility" rather than "is the customer" on purpose. A
// caller that forgets `paid_by` in its .select() reads undefined, and undefined
// must keep counting — otherwise the omission silently zeroes customer AR
// instead of leaving it as it is today. Omitting a selected column and having
// the code read it as false has bitten this codebase repeatedly; this is the
// direction where that mistake is harmless.
//
// Every payments row is 'customer' today (5,990 of 5,990, NOT NULL DEFAULT),
// so this changes nothing now. It exists before the data that needs it.
function isCustomerPayment(p) {
  return p?.paid_by !== 'utility'
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
      .filter(p => p.invoice_id === inv.id && isCustomerPayment(p))
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
  // Nothing owed — an empty $0 invoice OR one fully covered by the incentive.
  // Only call it Paid if money actually came in. Auto-marking these Paid with
  // $0 collected would (a) flip 850+ empty shell invoices on their next payment
  // event and (b) trip the "Paid + no payments" fallback in bonusCalc into
  // paying commission on the full gross. When nothing was collected, leave the
  // status alone by reporting Pending — matches the old record/rescind paths.
  if (owed <= 0.01) return paid > 0 ? 'Paid' : 'Pending'
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
    if (!isCustomerPayment(p)) continue
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

// Does this invoice carry its own utility debt? Set by the step-two backfill
// and kept current by the mirror_utility_settlement trigger. Null means the
// debt (if any) still lives only on a utility_invoices row.
function carriesUtilityDebt(inv) {
  return inv?.utility_owes != null
}

// What the utility still owes on ONE invoice that carries the debt.
// utility_paid_at is the receipt date; null means unpaid. A void or
// cancelled invoice has no debts on either side.
export function invoiceUtilityBalance(inv) {
  if (!carriesUtilityDebt(inv)) return 0
  if (inv.utility_paid_at) return 0
  if (inv.payment_status === 'Void' || inv.payment_status === 'Cancelled') return 0
  return Number(inv.utility_owes) || 0
}

// Total utility AR — the rebates utilities owe us.
//
// Two sources during the transition off the separate utility invoice:
//
//   1. Invoices that carry the debt themselves (utility_owes / utility_paid_at).
//   2. utility_invoices rows whose invoice does NOT yet carry it — rows the
//      backfill refused because the figures disagreed, or rows nobody has
//      linked. Same rule as before: unpaid, not void, amount || incentive.
//
// A utility row linked to an invoice that carries the debt is NOT counted
// again from the row. The stitch shrinks as rows get resolved and vanishes
// when the last one does, with no code change.
//
// Callers that pass no invoices get exactly the old answer — every utility
// row counts — so an un-updated caller cannot under-report. The unsafe
// omission is selecting utility_owes without utility_paid_at: a paid row
// would then read as unpaid. The store selects `*`; a test guards that.
export function totalUtilityAR(utilityInvoices = [], invoices = []) {
  const carriers = (invoices || []).filter(carriesUtilityDebt)
  const carrierIds = new Set(carriers.map(i => i.id))
  const fromInvoices = carriers.reduce((s, i) => s + invoiceUtilityBalance(i), 0)
  const fromRows = (utilityInvoices || [])
    .filter(u => !(u?.invoice_id != null && carrierIds.has(u.invoice_id)))
    .filter(u => u?.payment_status !== 'Paid' && u?.payment_status !== 'Void')
    .reduce((s, u) => s + (Number(u.amount || u.incentive_amount) || 0), 0)
  return fromInvoices + fromRows
}

// Combined AR — what every surface should show as "accounts receivable"
// unless it's explicitly labeling one or the other.
export function totalAR(invoices = [], utilityInvoices = [], paymentsArrOrMap = []) {
  return totalCustomerAR(invoices, paymentsArrOrMap) + totalUtilityAR(utilityInvoices, invoices)
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
  // Same two-source rule as totalUtilityAR, scoped to this job.
  const utilityBalance = totalUtilityAR(jobUtility, jobInvoices)
  return {
    customerBalance,
    utilityBalance,
    combined: customerBalance + utilityBalance,
    customerInvoices: jobInvoices,
    utilityInvoices: jobUtility,
  }
}
