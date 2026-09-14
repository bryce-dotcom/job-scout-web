// What a customer statement says, computed once and the same way as AR.
//
// The statement used to derive Balance Due as "sum of every invoice amount
// minus every payment row whose status was Completed". Two things made that
// wrong for exactly the customers who ask for statements:
//
//   1. 5,700 of the 5,960 payment rows are legacy imports with status 'Paid'
//      or 'Open', not 'Completed', so they were not subtracted. Vernal Hay Co
//      (Tracy, 24 Aug) owed $616.32 on one invoice and the statement said
//      $4,749.24 — the paid-off February invoice's payment was an 'Open' row.
//   2. Every invoice ever issued was listed. Jan Pro (Tracy, 11 Sep) has 180;
//      the twelve they actually owe on were buried in eight pages.
//
// Balance Due is now what Books and the Dashboard call customer AR
// (lib/arHelpers): open invoices only, each one's customer total minus the
// customer's payments on it, whatever status those rows carry. A Paid invoice
// contributes nothing whether or not its payment rows survived the import.
// And by default the statement lists only what is open — that is what a
// customer asking "what do I owe you" wants to read.

import {
  invoiceCustomerTotal, invoiceBalance, isInvoiceOpen, paymentsByInvoiceIndex, totalCustomerAR,
} from './arHelpers'

/**
 * @param {object[]} invoices   every invoice for the customer
 * @param {object[]} payments   every payment row linked to those invoices
 * @param {{ outstandingOnly?: boolean }} opts  default true
 */
export function statementModel(invoices = [], payments = [], { outstandingOnly = true } = {}) {
  const idx = paymentsByInvoiceIndex(payments)
  const all = [...(invoices || [])]
    .filter(inv => inv?.payment_status !== 'Void' && inv?.payment_status !== 'Cancelled')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const listed = outstandingOnly ? all.filter(isInvoiceOpen) : all

  const lines = listed.map(inv => {
    const total = invoiceCustomerTotal(inv)
    const balance = isInvoiceOpen(inv) ? invoiceBalance(inv, idx) : 0
    return {
      id: inv.id,
      number: inv.invoice_id || `#${inv.id}`,
      date: inv.created_at,
      description: inv.job_description || '',
      total,
      // Paid is what the invoice's status and balance agree on, not a sum of
      // rows: a Paid invoice with a missing or 'Open' payment row is paid.
      paid: Math.max(0, total - balance),
      balance,
      status: inv.payment_status || 'Pending',
    }
  })

  const listedIds = new Set(listed.map(i => i.id))
  const paymentsShown = (payments || [])
    .filter(p => p.invoice_id && listedIds.has(p.invoice_id) && p.paid_by !== 'utility')
    .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at))

  const totalInvoiced = lines.reduce((s, l) => s + l.total, 0)
  const balanceDue = totalCustomerAR(all, idx)
  return {
    outstandingOnly,
    lines,
    payments: paymentsShown,
    totalInvoiced,
    // Settled on the listed invoices: in outstanding-only mode, what has been
    // paid so far on what is still open; in full mode, everything ever settled.
    totalPaid: Math.max(0, totalInvoiced - balanceDue),
    balanceDue,
    openCount: all.filter(isInvoiceOpen).length,
    hiddenPaidCount: outstandingOnly ? all.length - listed.length : 0,
  }
}
