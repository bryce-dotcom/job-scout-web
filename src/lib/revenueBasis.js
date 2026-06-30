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

export const BASIS_CASH = 'cash'
export const BASIS_ACCRUAL = 'accrual'

const num = (v) => parseFloat(v) || 0
const isCollected = (p) => (p.status || 'Completed') !== 'Refunded' && (p.status || '') !== 'Voided'

// Customer-net of an invoice = gross minus the total deduction (utility
// incentive + project discount + deposit credit). Legacy-net invoices already
// store the net in `amount`, so don't subtract again.
export function invoiceNet(inv) {
  const gross = num(inv.amount)
  const disc = num(inv.discount_applied)
  return (disc > 0 && disc >= gross) ? gross : Math.max(0, gross - disc)
}

export function cashRevenue({ payments = [], leadPayments = [], utilityInvoices = [] }, inRange) {
  const pay = (payments || []).filter(p => isCollected(p) && inRange(p.date || p.created_at)).reduce((s, p) => s + num(p.amount), 0)
  const dep = (leadPayments || []).filter(d => inRange(d.date_created || d.created_at)).reduce((s, d) => s + num(d.amount), 0)
  const inc = (utilityInvoices || []).filter(i => i.payment_status === 'Paid' && inRange(i.updated_at || i.created_at)).reduce((s, i) => s + num(i.amount ?? i.incentive_amount), 0)
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
