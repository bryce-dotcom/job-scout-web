// What else is attached to an invoice, and what that means if you change who
// it is billed to or try to delete it.
//
// Tracy (TIME SENSITIVE, 2026-10-07, invoice INV-MUBGM140):
//
//   "Failed to delete invoice: update or delete on table "invoices" violates
//    foreign key constraint "plaid_transactions_matched_invoice_id_fkey" ...
//    I need to make a change just to the name on the invoice billing and the
//    system won't let me delete the invoice and create a new one so I can get
//    the correct entity this is to be billed to so it will get paid."
//
// Two separate failures in one sentence:
//
//   1. There is no way to change who an invoice is billed to. customer_id is
//      read-only on the whole page, so correcting a billing entity meant
//      deleting the invoice and building it again from scratch.
//   2. The delete then hit a foreign key and put Postgres' own words on her
//      screen — a constraint name tells her nothing about what to do next.
//
// Deleting an invoice is blocked by exactly two things, and the error she saw
// was only one of them (information_schema, 2026-10-07):
//
//   CASCADE   invoice_lines, payments, payment_plans     — go automatically
//   SET NULL  utility_invoices, invoices.parent_invoice  — detach automatically
//   NO ACTION plaid_transactions.matched_invoice_id      — BLOCKS
//             lead_payments.invoice_id                   — BLOCKS
//
// So fixing only the bank match would have moved the same ugly error onto the
// next invoice that happens to carry a deposit.

/**
 * Why changing the bill-to is worth a second look — sentences for the person
 * doing it, or an empty list when it is unremarkable.
 *
 * None of these stop the change. Billing a different entity than the one the
 * work was done for is ordinary (a property manager pays for a tenant's site),
 * which is exactly why the field should have been editable all along.
 */
export function billToWarnings({ payments = [], from = null, to = null } = {}) {
  const out = []
  const paid = payments.filter((p) => Number(p?.amount) > 0)

  if (paid.length) {
    const total = paid.reduce((a, p) => a + Number(p.amount || 0), 0)
    out.push(
      `${paid.length} payment${paid.length === 1 ? '' : 's'} totalling `
      + `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
      + `will move with this invoice${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}.`,
    )
  }

  // Trade credit is recorded as a payment AND drawn from the customer's own
  // ledger, so moving the invoice leaves the draw on the wrong account.
  if (paid.some((p) => String(p?.payment_method || p?.method || '').toLowerCase().includes('credit'))) {
    out.push(
      'Trade credit on this invoice was drawn from the current customer\'s balance. '
      + 'Moving the invoice does not move that draw — check both balances afterwards.',
    )
  }

  out.push('The job keeps its own customer. Only this invoice moves.')
  return out
}

/**
 * What stops this invoice being deleted, in words.
 *
 * `detachable` says whether carrying on is a reasonable offer. A bank match is
 * just a link — the transaction stays in the ledger and becomes unmatched, which
 * is recoverable from the Books screen. A lead deposit is money recorded against
 * this invoice, so it is NOT quietly detached.
 */
export function deleteBlockers({ bankMatches = 0, leadPayments = 0 } = {}) {
  const out = []
  const bank = Number(bankMatches) || 0
  const deposits = Number(leadPayments) || 0

  if (bank > 0) {
    out.push({
      kind: 'bank',
      count: bank,
      detachable: true,
      sentence: `${bank} bank transaction${bank === 1 ? ' is' : 's are'} matched to this invoice. `
        + `Deleting it will leave ${bank === 1 ? 'that transaction' : 'those transactions'} unmatched in Books.`,
    })
  }
  if (deposits > 0) {
    out.push({
      kind: 'deposit',
      count: deposits,
      detachable: false,
      sentence: `${deposits} deposit${deposits === 1 ? '' : 's'} on the Deposits page `
        + `point${deposits === 1 ? 's' : ''} at this invoice. Move or remove `
        + `${deposits === 1 ? 'it' : 'them'} first — deleting the invoice would strip money of its record.`,
    })
  }
  return out
}

/** True when nothing can be done but stop. */
export function deleteIsBlocked(blockers = []) {
  return blockers.some((b) => !b.detachable)
}

/**
 * What to put in front of the person before anything is deleted.
 *
 * Never a constraint name. The old path handed Postgres' error straight to the
 * screen, which is how a billing correction turned into a support ticket.
 */
export function deleteMessage(blockers = []) {
  const hard = blockers.filter((b) => !b.detachable)
  if (hard.length) {
    return `This invoice can't be deleted yet.\n\n${hard.map((b) => b.sentence).join('\n\n')}`
  }
  if (blockers.length) {
    return `Delete this invoice?\n\n${blockers.map((b) => b.sentence).join('\n\n')}\n\nThis cannot be undone.`
  }
  return 'Are you sure you want to delete this invoice? This cannot be undone.'
}

/**
 * If the point was only to correct the billing entity, deleting is the wrong
 * tool — which is what Tracy was reaching for because the right one did not
 * exist. Offered whenever a delete is stopped.
 */
export const CHANGE_INSTEAD = 'To bill a different company, use Change next to Bill To — you do not need to delete anything.'
