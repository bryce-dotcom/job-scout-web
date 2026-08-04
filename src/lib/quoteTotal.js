// When is it safe to write a recomputed quote_amount?
//
// The original guard refused any write that more than halved the stored
// amount, on the theory that a big drop meant the line items hadn't loaded
// yet. It could not tell "lines not loaded" from "the quote really did get
// smaller", so a wrong high number could never be corrected:
//
//   EST-MOUH4ST4 "pioneer metals" stored $732,220.44 against $111,405.64 of
//   real line items. The estimate page showed the correct figure computed
//   from the lines, the write was refused every time (silently, to the
//   console), and the pipeline kept rendering $732,220.44 for months.
//
// The right signal is whether we actually HAVE the lines, not how much the
// number moved. An empty list is ambiguous — not loaded, or all deleted — so
// that stays blocked. A list with real lines in it is data, and data wins,
// however far it moves.

export const WRITE = 'write'
export const SKIP_NO_LINES = 'skip_no_lines'
export const SKIP_ZERO_OVER_POSITIVE = 'skip_zero_over_positive'

/**
 * Decide whether a recomputed total may overwrite the stored one.
 *   computedTotal  sum of the line items we currently hold
 *   currentAmount  what is stored on the quote today
 *   lineCount      how many lines that sum came from
 */
export function quoteWriteDecision(computedTotal, currentAmount, lineCount) {
  const computed = Number(computedTotal) || 0
  const current = Number(currentAmount) || 0
  const count = Number(lineCount) || 0

  // No lines in hand. Can't tell "still loading" from "user deleted them
  // all", so leave a positive stored amount alone.
  if (count === 0 && current > 0) {
    return { action: SKIP_NO_LINES, reason: 'No line items loaded — refusing to overwrite a stored amount' }
  }
  // Lines exist but sum to nothing while a real amount is stored. Same
  // ambiguity (unpriced lines vs a genuine zero), so stay safe.
  if (computed <= 0 && current > 0) {
    return { action: SKIP_ZERO_OVER_POSITIVE, reason: 'Computed total is $0 — refusing to overwrite a stored amount' }
  }
  return { action: WRITE, reason: '' }
}

/**
 * What an estimate is actually worth, for anything that DISPLAYS a total.
 *
 * The line items are the truth. `quotes.quote_amount` is a cached copy of
 * them, and a cache that can drift is a cache that will: EST-MOUH4ST4 showed
 * $732,220.44 on the pipeline against $111,405.64 of lines, and 803 other
 * quotes disagree with their own lines today.
 *
 * Reading the cached column meant every drift needed a one-off data repair.
 * Summing the lines instead means there is nothing to repair — the estimate
 * page and the pipeline compute the same number from the same rows.
 *
 * The stored amount is still the fallback, and legitimately so: a lump-sum
 * quote with no itemisation has a real total and no lines to derive it from.
 * Absence of lines is NOT evidence the quote is worth zero.
 * Mirrors EstimateDetail exactly, so the board and the estimate cannot
 * disagree:
 *     subtotal = lineSum > 0 ? lineSum : quote_amount
 *     total    = subtotal - discount
 * The whole-project `discount` is a real reduction and is NOT the utility
 * incentive — per-line discounts are already baked into each line_total, and
 * the incentive is deducted separately to reach out-of-pocket, never from the
 * contract total.
 */
export function effectiveQuoteAmount(quote, lineSum) {
  return quoteSummary(quote, lineSum).total
}

/**
 * The whole Estimate Summary block, from one place.
 *
 *   Subtotal        line items (or the stored amount for a lump-sum quote)
 *   Discount        whole-project reduction, NOT the utility incentive
 *   Total           Subtotal − Discount        <- what the board shows
 *   Utility Incentive
 *   Out of Pocket   Total − Incentive          <- what the customer pays
 *
 * There is no stored "Total" column to reuse, so anything displaying it has
 * to compute it — which is exactly how the estimate page and the pipeline
 * ended up showing different numbers for the same estimate. Both now call
 * this, so they cannot drift apart again.
 */
export function quoteSummary(quote, lineSum) {
  const lines = Number(lineSum) || 0
  const stored = Number(quote?.quote_amount) || 0
  const subtotal = lines > 0 ? lines : stored
  const discount = Number(quote?.discount) || 0
  const incentive = Number(quote?.utility_incentive) || 0
  const total = Math.max(0, subtotal - discount)
  return { subtotal, discount, total, incentive, outOfPocket: total - incentive }
}

/** Sum line rows for one quote. quote_lines carries BOTH `line_total` and
 *  `total`, and `total` is null on most rows — reading only `total` reports
 *  every quote as $0. */
export function sumQuoteLines(lines = []) {
  return (lines || []).reduce((s, l) => s + (Number(l?.line_total ?? l?.total ?? 0) || 0), 0)
}

/** Does the stored amount disagree with the line items? Used to warn a user
 *  that what the pipeline shows is not what the estimate adds up to. */
export function quoteAmountMismatch(currentAmount, computedTotal, lineCount) {
  const computed = Number(computedTotal) || 0
  const current = Number(currentAmount) || 0
  if (!Number(lineCount)) return null
  const delta = current - computed
  if (Math.abs(delta) < 0.02) return null
  return { stored: current, computed, delta, overstated: delta > 0 }
}
