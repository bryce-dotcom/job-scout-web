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
// Detected by: discount >= amount → treat as legacy.

// ────────────────────────────── invoices ──────────────────────────────

// What this customer-facing invoice is asking the customer to pay AFTER
// netting out the utility incentive + any deposit credit. This is the
// number that should print on a statement of account.
export function invoiceCustomerTotal(inv) {
  const gross = Number(inv?.amount) || 0
  const disc = Number(inv?.discount_applied) || 0
  const isLegacyNet = disc > 0 && disc >= gross
  return isLegacyNet ? gross : Math.max(0, gross - disc)
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
