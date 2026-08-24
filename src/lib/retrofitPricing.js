/**
 * What a retrofit line is worth, in one place.
 *
 * A line's money is exactly two things: the price of one unit after any
 * rep override or discount, and how many units the line buys. Both Lenard
 * pages carried their own copy of the first, and the estimate had no access
 * to either -- lenard-save rebuilt line prices from the catalogue and then
 * scaled every line by (headline total / catalogue sum) to force the
 * arithmetic to close.
 *
 * That scale factor is why estimate lines never matched the catalogue. It
 * silently absorbed four unrelated things: rep price overrides, per-line
 * discounts, the lamp-multiplier inflation, and the give-me/upsell adders
 * that were never sent as lines at all. A discount on one area quietly
 * changed the unit price of every other area, and out-of-scope dollars
 * (warranties, travel, M&V) got smeared into in-scope fixture lines --
 * defeating the very split the utility math depends on.
 *
 * Carry these numbers instead of re-deriving them and the estimate
 * reconciles by construction, with no scaling at all.
 */
import { orderQty } from './lampQuantity'

/** Unit price after a rep override and any line discount. */
export function effectiveUnitPrice(line) {
  const base = line?.priceOverride != null ? line.priceOverride : (line?.productPrice || 0)
  const disc = line?.discount || 0
  return disc > 0 ? base * (1 - disc / 100) : base
}

/** What this line contributes to the project cost. */
export function lineTotal(line) {
  return effectiveUnitPrice(line) * orderQty(line)
}

/** Fixture lines only -- extras (give-me / upsell items) are added separately. */
export function linesSubtotal(lines) {
  return (lines || []).reduce((sum, l) => sum + lineTotal(l), 0)
}

/**
 * The per-line economics the estimate needs. Sent with each line so
 * lenard-save can write real prices instead of inferring them.
 */
export function linePricingPayload(line) {
  return {
    productQty: orderQty(line),
    unitPrice: effectiveUnitPrice(line),
    lineTotal: lineTotal(line),
    priceOverride: line?.priceOverride ?? null,
    discount: line?.discount || 0,
    retrofitType: line?.retrofitType || 'fixture',
    lampsPerFixture: line?.lampsPerFixture || 1,
    pricedPerLamp: !!line?.pricedPerLamp,
  }
}

/**
 * Give-me / upsell adders, normalised to the one shape lenard-save writes.
 * Both pages already store {label, amount, in_utility_scope}; the scope flag
 * has to survive, because an out-of-scope dollar must never reach the
 * utility's cap calculation.
 */
export function extrasPayload(items) {
  return (items || [])
    .filter(i => i && Number(i.amount))
    .map(i => ({
      label: i.label || i.type || 'Additional item',
      amount: Number(i.amount) || 0,
      in_utility_scope: i.in_utility_scope !== false,
    }))
}

/** Fixture lines plus extras -- what the headline project cost must equal. */
export function projectCostFromParts(lines, extras) {
  return linesSubtotal(lines) + extrasPayload(extras).reduce((s, e) => s + e.amount, 0)
}
