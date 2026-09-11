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
// If the utility paid a different amount than was claimed, the row's
// incentive_amount / amount are overwritten with what was received, and
// net_cost is recomputed from project_cost, "so the books reflect reality" —
// the rule the utility page has always applied. The mirror then carries the
// received figure as utility_owes.
//
// When the utility paid LESS, someone covers the difference, and the caller
// must say who (`borneBy`):
//
//   customer  the invoice's credit (discount_applied) is reduced by the
//             shortfall — the customer owes more, and their page one shows
//             the incentive the utility actually paid, nothing else
//   company   the credit stays; the sections engine prints the gap as
//             "utility shortfall absorbed" instead of a phantom discount
//
// Before this, the gap was there either way and printed as a "Project
// Discount" nobody gave.
//
// The claimed figure is kept on the invoice as utility_billed the first
// time a payment is recorded, because the row loses it on a short-pay.
// Expected = utility_billed when the invoice has it, else the row's figure.
//
// IDEMPOTENCE
//
// Two rows are written (invoice, then utility row) and PostgREST gives no
// transaction across them. So the invoice patch first UNDOES whatever
// shortfall was recorded before and then applies the new one, both from
// stored figures — a retry after a failed second write lands on the same
// numbers instead of reducing the credit twice. Reopen restores the row to
// an absolute figure (utility_billed) for the same reason.
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
export const BORNE_BY_CUSTOMER = 'customer'
export const BORNE_BY_COMPANY = 'company'

// What the utility was expected to pay. The invoice's stored claim wins —
// the row's figure is overwritten by a short-pay and would make a second
// short-pay measure against the wrong number.
export function expectedUtilityAmount(row, invoice = null) {
  const billed = Number(invoice?.utility_billed)
  if (invoice && Number.isFinite(billed) && billed > 0) return billed
  return parseFloat(row?.incentive_amount ?? row?.amount) || 0
}

// The customer's credit as it was before any recorded shortfall was routed
// to them. Undoing first is what makes a retry safe.
function creditBeforeShortfall(invoice) {
  const current = Number(invoice?.discount_applied) || 0
  const priorShortfall = Number(invoice?.utility_shortfall) || 0
  return invoice?.shortfall_borne_by === BORNE_BY_CUSTOMER && priorShortfall > 0
    ? r2(current + priorShortfall)
    : current
}

// Build the patches for a payment. Pure. Returns { error } when the input is
// unusable, else { rowPatch, invoicePatch, expected, paidNum, shortBy }.
// invoicePatch is null when there is no linked invoice.
export function buildUtilityPaymentPatch(row, { paidOn, amount, note, borneBy } = {}, invoice = null) {
  if (!paidOn) return { error: 'Pick a payment date' }
  const expected = expectedUtilityAmount(row, invoice)
  const paidNum = amount === '' || amount == null ? expected : parseFloat(amount)
  if (Number.isNaN(paidNum) || paidNum < 0) return { error: 'Enter a valid amount' }

  const shortBy = r2(expected - paidNum)
  const short = shortBy > CENT
  if (short && invoice && borneBy !== BORNE_BY_CUSTOMER && borneBy !== BORNE_BY_COMPANY) {
    return { error: 'Choose who covers the shortfall' }
  }

  let amountNote = ''
  if (short) {
    amountNote = ` — short ${usd(shortBy)} (expected ${usd(expected)}, received ${usd(paidNum)})`
    if (invoice) amountNote += borneBy === BORNE_BY_CUSTOMER ? ' — billed to customer' : ' — absorbed'
  } else if (shortBy < -CENT) {
    amountNote = ` — over ${usd(-shortBy)} (expected ${usd(expected)}, received ${usd(paidNum)})`
  }
  const stamped = `Paid ${paidOn}${note ? ' — ' + note : ''}${amountNote}`
  const notes = row?.notes ? `${row.notes}\n\n${stamped}` : stamped

  const rowPatch = {
    payment_status: 'Paid',
    paid_at: noonUtc(paidOn),
    notes,
    updated_at: new Date().toISOString(),
  }
  if (Math.abs(shortBy) > CENT) {
    rowPatch.incentive_amount = paidNum
    rowPatch.amount = paidNum
    const pc = parseFloat(row?.project_cost) || 0
    if (pc > 0) rowPatch.net_cost = r2(pc - paidNum)
  }

  let invoicePatch = null
  if (invoice) {
    const base = creditBeforeShortfall(invoice)
    invoicePatch = {
      utility_billed: Number(invoice.utility_billed) > 0 ? invoice.utility_billed : expected,
      utility_shortfall: short ? shortBy : null,
      shortfall_borne_by: short ? borneBy : null,
      discount_applied: short && borneBy === BORNE_BY_CUSTOMER ? r2(Math.max(0, base - shortBy)) : base,
    }
  }
  return { rowPatch, invoicePatch, expected, paidNum, shortBy }
}

export async function recordUtilityPayment(sb, row, input, invoice = null) {
  const built = buildUtilityPaymentPatch(row, input, invoice)
  if (built.error) return { error: built.error }
  if (built.invoicePatch) {
    const { error } = await sb.from('invoices').update(built.invoicePatch).eq('id', invoice.id)
    if (error) return { error: error.message }
  }
  const { error } = await sb.from('utility_invoices').update(built.rowPatch).eq('id', row.id)
  return error ? { error: error.message } : { ok: true, shortBy: built.shortBy, paidNum: built.paidNum }
}

// Build the patches for reopening. Pure. The row goes back to Open at the
// CLAIMED figure when the invoice knows it; the invoice's credit is restored
// if the customer had covered a shortfall, and the decision clears.
export function buildReopenPatch(row, invoice = null) {
  const rowPatch = {
    payment_status: 'Open',
    paid_at: null,
    updated_at: new Date().toISOString(),
  }
  const billed = Number(invoice?.utility_billed)
  if (invoice && Number.isFinite(billed) && billed > 0) {
    rowPatch.incentive_amount = billed
    rowPatch.amount = billed
    const pc = parseFloat(row?.project_cost) || 0
    if (pc > 0) rowPatch.net_cost = r2(pc - billed)
  }
  const invoicePatch = invoice
    ? { discount_applied: creditBeforeShortfall(invoice), utility_shortfall: null, shortfall_borne_by: null }
    : null
  return { rowPatch, invoicePatch }
}

// Reopen: row first (an absolute restore, safe to repeat), then the invoice.
export async function reopenUtilityPayment(sb, row, invoice = null) {
  const rowId = typeof row === 'object' ? row?.id : row
  const built = buildReopenPatch(typeof row === 'object' ? row : null, invoice)
  const { error } = await sb.from('utility_invoices').update(built.rowPatch).eq('id', rowId)
  if (error) return { error: error.message }
  if (built.invoicePatch) {
    const { error: e2 } = await sb.from('invoices').update(built.invoicePatch).eq('id', invoice.id)
    if (e2) return { error: e2.message }
  }
  return { ok: true }
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
