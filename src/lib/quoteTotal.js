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
