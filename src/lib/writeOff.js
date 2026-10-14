// Why a deduction happened — a gift, a write-off, or a price.
//
// Tracy (2026-10-11): "Travis Millward is a longtime client of HHH Services.
// He just lost his son and for the funeral wanted his windows cleaned. The
// whole invoice was $300. Christopher wanted this to be a write off but wanted
// to make sure that Cameron got paid for his hours. I put the invoice in and
// then just did the discount for the amount of the invoice so it would show
// zero. I almost think that in times like this, it would be nice to have some
// sort of way to show the reason for a loss to the company or rather a gift to
// the client."
//
// The money already works: she zeroed it, and Cameron is paid from the time
// clock, which has never cared what an invoice collected. What is missing is
// the WHY. A $300 gift and a $300 price concession are the same row today, so
// nothing can tell a kindness from a discount, and the loss the company chose
// to absorb is invisible in every margin figure.
//
// So this records a KIND and a REASON beside the amount. It deliberately
// changes no arithmetic at all. discount_applied stays exactly what it was —
// the total deduction, as lib/invoiceMoney has it — because the invoice money
// model has been broken more than once by passes that re-derived it, and
// nothing here needs a different number. This only says what the number MEANT.
//
// NOT the customer-facing label. What prints on the invoice line is
// invoiceSections#deductionLineLabel's business, and a utility incentive must
// still print the utility's name. A write-off reason is internal: the customer
// is not shown "goodwill — bereavement".

/**
 * The kinds of deduction, and whether each one is a loss the company chose.
 *
 * `absorbed` is the question Tracy actually asked: did we give this away?
 * A price concession to win work is a discount, not a gift, and lumping the
 * two together would make the write-off figure useless the week it shipped.
 */
export const DEDUCTION_KINDS = {
  discount: { label: 'Discount', hint: 'A price concession — negotiated, or a promotion.', absorbed: false },
  goodwill: { label: 'Goodwill / gift', hint: 'Given to the customer deliberately. Tracy\'s bereavement case.', absorbed: true },
  write_off: { label: 'Write-off', hint: 'Money we billed and will not collect.', absorbed: true },
  warranty: { label: 'Warranty / rework', hint: 'Our own callback, not charged again.', absorbed: true },
  incentive: { label: 'Utility incentive', hint: 'The utility pays this share — the customer never owed it.', absorbed: false },
}

export const DEDUCTION_KIND_KEYS = Object.keys(DEDUCTION_KINDS)

/** Null means nobody classified it — which is what every existing row is. */
export const UNCLASSIFIED = null

/**
 * What kind this invoice's deduction is.
 *
 * A utility incentive is DERIVED, never typed: invoiceSections already knows,
 * from four different places, whether an invoice carries one, and 29 of HHH's
 * 57 deducted invoices are incentives. Offering "incentive" as a choice would
 * invite somebody to mark a goodwill gift as one and quietly move money into
 * the utility's column.
 */
export function deductionKind(invoice, { carriesIncentive = false } = {}) {
  if (carriesIncentive) return 'incentive'
  const k = invoice?.deduction_kind
  return DEDUCTION_KIND_KEYS.includes(k) ? k : UNCLASSIFIED
}

/** Is there a deduction here at all? */
export function deductionAmount(invoice) {
  const n = Number(invoice?.discount_applied)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Did the company absorb this, rather than simply charge less? */
export function isAbsorbed(invoice, opts) {
  const k = deductionKind(invoice, opts)
  return !!(k && DEDUCTION_KINDS[k]?.absorbed)
}

/**
 * An invoice that wants classifying: it has a deduction, it is not an
 * incentive, and nobody has said what it was. These are the rows Tracy cannot
 * explain six months later — 13 of them on HHH, every one zeroed outright.
 */
export function needsClassifying(invoice, opts) {
  return deductionAmount(invoice) > 0 && deductionKind(invoice, opts) === UNCLASSIFIED
}

/** Why this cannot be saved yet, as a sentence — or null. */
export function classifyProblem({ kind, reason } = {}) {
  if (!kind) return 'Pick what kind of deduction this was.'
  if (kind === 'incentive') return 'A utility incentive is worked out from the job, not set by hand.'
  if (!DEDUCTION_KIND_KEYS.includes(kind)) return 'Pick what kind of deduction this was.'
  // A write-off with no reason is the thing we already have.
  if (DEDUCTION_KINDS[kind].absorbed && !String(reason || '').trim()) {
    return 'Say why — that is the whole point of recording it.'
  }
  return null
}

/** The row to write. Reason is trimmed; blank becomes null. */
export function classifyPatch({ kind, reason } = {}) {
  return {
    deduction_kind: kind || null,
    deduction_reason: String(reason || '').trim() || null,
  }
}

/** One line for a list or a report. */
export function describeDeduction(invoice, opts) {
  const amount = deductionAmount(invoice)
  if (!amount) return null
  const kind = deductionKind(invoice, opts)
  const meta = kind ? DEDUCTION_KINDS[kind] : null
  return {
    amount,
    kind,
    label: meta ? meta.label : 'Unexplained',
    absorbed: !!meta?.absorbed,
    reason: invoice?.deduction_reason || null,
  }
}

/** What the company gave away across a set of invoices. */
export function absorbedTotal(invoices, kindOf) {
  let total = 0
  for (const inv of invoices || []) {
    const opts = typeof kindOf === 'function' ? kindOf(inv) : undefined
    if (isAbsorbed(inv, opts)) total += deductionAmount(inv)
  }
  return Math.round(total * 100) / 100
}
