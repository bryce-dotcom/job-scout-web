// The utility's settlement — one write path.
//
// Recording that a utility paid, reopening it, or correcting the date used
// to live inline on the utility record page. The invoice page now offers the
// same actions, so the rules live here and both pages call them. Two copies
// of a money rule is how this codebase has broken invoicing before.
//
// Writes go to utility_invoices; the mirror_utility_settlement trigger puts
// the result on the linked invoice (utility_paid_at, utility_owes) in the
// same transaction. Callers refetch the invoice afterwards to see it.
//
// SHORT-PAY
//
// If the utility paid a different amount than was billed, the row's
// incentive_amount / amount are overwritten with what was received, and
// net_cost is recomputed from project_cost, "so the books reflect reality" —
// the rule the utility page has always applied. The mirror then carries the
// received figure as utility_owes. The shortfall's routing (customer or
// company) is recorded on the invoice as shortfall_borne_by by the caller
// when the office decides; this module only records the receipt.
//
// DATES
//
// Dates arrive as 'YYYY-MM-DD' from a date input and are stored at noon UTC,
// so they cannot drift to the previous day when shown back in a negative
// timezone. Same convention as before.

const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n) || 0)
const CENT = 0.005
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const noonUtc = (ymd) => `${ymd}T12:00:00.000Z`

// What the utility was expected to pay on this row.
export function expectedUtilityAmount(row) {
  return parseFloat(row?.incentive_amount ?? row?.amount) || 0
}

// Build the utility_invoices patch for a payment. Pure. Returns
// { error } when the input is unusable, else { patch, expected, paidNum, shortBy }.
export function buildUtilityPaymentPatch(row, { paidOn, amount, note } = {}) {
  if (!paidOn) return { error: 'Pick a payment date' }
  const expected = expectedUtilityAmount(row)
  const paidNum = amount === '' || amount == null ? expected : parseFloat(amount)
  if (Number.isNaN(paidNum) || paidNum < 0) return { error: 'Enter a valid amount' }

  const shortBy = r2(expected - paidNum)
  let amountNote = ''
  if (shortBy > CENT) {
    amountNote = ` — short ${usd(shortBy)} (expected ${usd(expected)}, received ${usd(paidNum)})`
  } else if (shortBy < -CENT) {
    amountNote = ` — over ${usd(-shortBy)} (expected ${usd(expected)}, received ${usd(paidNum)})`
  }
  const stamped = `Paid ${paidOn}${note ? ' — ' + note : ''}${amountNote}`
  const notes = row?.notes ? `${row.notes}\n\n${stamped}` : stamped

  const patch = {
    payment_status: 'Paid',
    paid_at: noonUtc(paidOn),
    notes,
    updated_at: new Date().toISOString(),
  }
  if (Math.abs(shortBy) > CENT) {
    patch.incentive_amount = paidNum
    patch.amount = paidNum
    const pc = parseFloat(row?.project_cost) || 0
    if (pc > 0) patch.net_cost = r2(pc - paidNum)
  }
  return { patch, expected, paidNum, shortBy }
}

export async function recordUtilityPayment(sb, row, input) {
  const built = buildUtilityPaymentPatch(row, input)
  if (built.error) return { error: built.error }
  const { error } = await sb.from('utility_invoices').update(built.patch).eq('id', row.id)
  return error ? { error: error.message } : { ok: true, shortBy: built.shortBy, paidNum: built.paidNum }
}

// Reopen: clears the paid date and flips status back to Open. Notes are kept
// as the audit trail.
export async function reopenUtilityPayment(sb, rowId) {
  const { error } = await sb.from('utility_invoices').update({
    payment_status: 'Open',
    paid_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', rowId)
  return error ? { error: error.message } : { ok: true }
}

// Correct the paid date after the fact without re-recording the payment.
export async function correctUtilityPaidAt(sb, rowId, paidOn) {
  if (!paidOn) return { error: 'Pick a date' }
  const { error } = await sb.from('utility_invoices').update({
    paid_at: noonUtc(paidOn),
    updated_at: new Date().toISOString(),
  }).eq('id', rowId)
  return error ? { error: error.message } : { ok: true }
}
