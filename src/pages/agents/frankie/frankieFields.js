// Single source of truth for reading JobScout financial data inside Frankie.
//
// Before this file existed, Frankie's dashboard / collections / insights /
// AI context all read non-existent columns (inv.balance_due, inv.status,
// p.payment_date, j.contract_amount, etc.) and silently fell back to 0 or
// undefined — which is why every tenant who recruited Frankie saw "$0
// everywhere" no matter how many invoices they had.
//
// All Frankie views + the AI context builder must go through these helpers
// so they stay correct as the schema evolves and so multi-tenant behavior
// is consistent.

// ──────────────────────────── invoices ────────────────────────────

// Customer balance = gross - discount_applied (utility incentive + deposit
// credit are netted out) then minus payments already applied. Mirrors the
// math used by InvoiceDetail, CustomerPortal, Stripe webhook, and Books.
export function invoiceCustomerTotal(inv) {
  const gross = Number(inv?.amount) || 0
  const disc = Number(inv?.discount_applied) || 0
  // Legacy net-shape: amount = net customer portion, discount is informational
  const isLegacyNet = disc > 0 && disc >= gross
  return isLegacyNet ? gross : Math.max(0, gross - disc)
}

// Total a customer still owes on this invoice after applied payments.
// Pass in either a paymentsByInvoiceId Map (preferred) or a flat payments
// array; the helper handles both shapes so callers don't need to convert.
export function invoiceBalance(inv, paymentsArrOrMap = []) {
  const customerTotal = invoiceCustomerTotal(inv)
  if (customerTotal === 0) return 0
  let paid = 0
  if (paymentsArrOrMap instanceof Map) {
    paid = paymentsArrOrMap.get(inv.id) || 0
  } else if (Array.isArray(paymentsArrOrMap)) {
    paid = paymentsArrOrMap
      .filter(p => p.invoice_id === inv.id && (p.status === 'Paid' || p.status === 'Completed' || p.status == null))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  }
  return Math.max(0, customerTotal - paid)
}

// What status the rest of the app uses — payment_status, not status.
export function invoiceStatus(inv) {
  return inv?.payment_status || 'Pending'
}

// Treat anything not Paid/Void/Cancelled as "open" (still owed).
export function isInvoiceOpen(inv) {
  const s = invoiceStatus(inv)
  return s !== 'Paid' && s !== 'Void' && s !== 'Cancelled'
}

// Days past due — uses due_date if set, else falls back to created_at + 30
// (standard Net 30) so brand-new tenants who haven't configured due dates
// still get meaningful aging.
export function invoiceDaysOverdue(inv, now = new Date()) {
  const dueRaw = inv?.due_date || inv?.created_at
  if (!dueRaw) return 0
  const due = new Date(dueRaw)
  if (!inv?.due_date && inv?.created_at) {
    due.setDate(due.getDate() + 30)
  }
  const days = Math.floor((now - due) / 86400000)
  return Math.max(0, days)
}

// AR aging bucket — 'current', '30', '60', '90+'.
export function invoiceAgingBucket(inv, now = new Date()) {
  const d = invoiceDaysOverdue(inv, now)
  if (d === 0) return 'current'
  if (d <= 30) return '30'
  if (d <= 60) return '60'
  return '90+'
}

// ──────────────────────────── payments ────────────────────────────

// JobScout's column is `date`, not `payment_date`.
export function paymentDate(p) {
  return p?.date || p?.created_at || null
}

// ──────────────────────────── jobs ────────────────────────────

// JobScout's column is `job_total`, not `contract_amount`.
export function jobContractValue(j) {
  return Number(j?.job_total) || 0
}

// JobScout uses 'Completed', 'Verified Complete', 'Paid', 'Closed', etc. —
// any of those means the work is done.
const COMPLETE_STATUSES = new Set([
  'Completed', 'Complete', 'Verified Complete',
  'Post Inspection (Req)', 'Paid', 'Closed', 'Archived',
])
export function jobIsComplete(j) {
  return COMPLETE_STATUSES.has(j?.status)
}

// JobScout doesn't store labor / material / other cost on jobs directly.
// Costs live on each `job_lines` row. Callers pass in jobLines and we sum.
export function jobCostFromLines(jobId, jobLines = []) {
  const lines = jobLines.filter(l => l.job_id === jobId)
  // Sum cost on each line. If job_lines.labor_cost is set, count it; else
  // fall back to line.price × quantity (which is the customer-facing price
  // and IS NOT the cost, but it's the closest signal until cost gets
  // captured at line level — a known data quality gap).
  return lines.reduce((sum, l) => {
    const labor = Number(l.labor_cost) || 0
    return sum + labor
  }, 0)
}

// Margin if we have enough data; null otherwise so the UI can render
// "needs cost data" instead of a misleading 0% or 100%.
export function jobMargin(j, jobLines = []) {
  const contract = jobContractValue(j)
  if (contract <= 0) return null
  const cost = jobCostFromLines(j.id, jobLines)
  if (cost === 0) return null
  const profit = contract - cost
  return profit / contract
}

// ──────────────────────────── expenses ────────────────────────────

// expenses.category is a JOIN; the string lives on category.name.
export function expenseCategoryName(e) {
  return e?.category?.name || 'Uncategorized'
}

// ──────────────────────────── aggregate helpers ────────────────────────────

// Total AR across all open invoices (customer balance after payments).
export function totalAR(invoices = [], paymentsArrOrMap = []) {
  return (invoices || [])
    .filter(isInvoiceOpen)
    .reduce((sum, inv) => sum + invoiceBalance(inv, paymentsArrOrMap), 0)
}

// Total AR considered overdue (past due_date or created_at + 30).
export function overdueAR(invoices = [], paymentsArrOrMap = [], now = new Date()) {
  return (invoices || [])
    .filter(isInvoiceOpen)
    .filter(inv => invoiceDaysOverdue(inv, now) > 0)
    .reduce((sum, inv) => sum + invoiceBalance(inv, paymentsArrOrMap), 0)
}

// AR aging buckets — { current, days30, days60, days90plus } in dollars.
export function arAgingBuckets(invoices = [], paymentsArrOrMap = [], now = new Date()) {
  const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 }
  for (const inv of invoices || []) {
    if (!isInvoiceOpen(inv)) continue
    const bal = invoiceBalance(inv, paymentsArrOrMap)
    if (bal <= 0) continue
    const bucket = invoiceAgingBucket(inv, now)
    if (bucket === 'current') buckets.current += bal
    else if (bucket === '30') buckets.days30 += bal
    else if (bucket === '60') buckets.days60 += bal
    else buckets.days90plus += bal
  }
  return buckets
}

// Revenue in a date window (payments table).
export function revenueInWindow(payments = [], startDate, endDate = new Date()) {
  return (payments || [])
    .filter(p => {
      const d = paymentDate(p)
      if (!d) return false
      const t = new Date(d)
      return t >= startDate && t <= endDate
    })
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
}

// Expenses in a date window (manual_expenses + Plaid debits if you want
// to combine — keep separate by default and let callers add).
export function expensesInWindow(expenses = [], startDate, endDate = new Date()) {
  return (expenses || [])
    .filter(e => {
      const d = e.expense_date
      if (!d) return false
      const t = new Date(d)
      return t >= startDate && t <= endDate
    })
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
}

// Has-data check — used to decide between "show real numbers" and
// "show welcome / onboarding state". A tenant with no invoices or no
// payments yet shouldn't see broken metrics.
export function hasMeaningfulData({ invoices = [], payments = [] } = {}) {
  return invoices.length > 0 || payments.length > 0
}
