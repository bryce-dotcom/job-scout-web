// Pricing-rule helpers — products with pricing_model='percent_of_contract'
// compute their price from the sum of other lines on the same quote/job,
// clamped to a floor and ceiling. Used by quote + job line editors so the
// salesperson doesn't have to do the math.
//
// The first product class to use this is Extended Service Coverage (Tier A
// and Tier B upsells for HHH — see migration
// 20260609174741_add_pricing_rule_and_coverage_columns.sql for the column
// definitions).

/**
 * Sum the line totals of all OTHER lines (excluding the one being priced),
 * which is what "contract value" means for a percent-of-contract upsell.
 *
 * @param {Array} lineItems — current array of lines on the quote/job
 * @param {number|null} excludeLineId — id of the line being priced (so it
 *   doesn't include itself; circular). Null = include all lines.
 * @returns {number}
 */
export function sumOtherLines(lineItems, excludeLineId = null) {
  if (!Array.isArray(lineItems)) return 0
  let total = 0
  for (const l of lineItems) {
    if (excludeLineId != null && l.id === excludeLineId) continue
    // line_total > total > price * qty fallback
    const lt = Number(l.line_total)
    if (Number.isFinite(lt) && lt > 0) { total += lt; continue }
    const t = Number(l.total)
    if (Number.isFinite(t) && t > 0) { total += t; continue }
    const qty = Number(l.quantity) || 0
    const price = Number(l.price) || 0
    total += qty * price
  }
  return total
}

/**
 * Calculate the price for a percent-of-contract product.
 *
 * @param {Object} product — must have pricing_model, pricing_percent,
 *   pricing_floor, pricing_ceiling.
 * @param {number} contractValue — base for the percent (sum of other lines).
 * @returns {{ price: number, breakdown: string, floored: boolean, ceilinged: boolean } | null}
 *   null if the product doesn't use percent-of-contract.
 */
export function calcPercentOfContractPrice(product, contractValue) {
  if (!product || product.pricing_model !== 'percent_of_contract') return null
  const pct = Number(product.pricing_percent) || 0
  const floor = Number(product.pricing_floor) || 0
  const ceiling = Number(product.pricing_ceiling)
  const rawPrice = (contractValue * pct) / 100
  let price = rawPrice
  let floored = false
  let ceilinged = false
  if (floor > 0 && price < floor) { price = floor; floored = true }
  if (Number.isFinite(ceiling) && ceiling > 0 && price > ceiling) { price = ceiling; ceilinged = true }
  // Round to whole dollars for clean quote presentation
  price = Math.round(price)
  const breakdown = floored
    ? `${pct}% of ${formatUsd(contractValue)} = ${formatUsd(rawPrice)} — floor $${floor} applied`
    : ceilinged
      ? `${pct}% of ${formatUsd(contractValue)} = ${formatUsd(rawPrice)} — ceiling $${ceiling} applied`
      : `${pct}% of ${formatUsd(contractValue)}`
  return { price, breakdown, floored, ceilinged }
}

/**
 * Convenience: given a product and the current list of lines on the
 * quote/job, return the calculated price. Returns null if the product
 * isn't a percent-of-contract product.
 *
 * @param {Object} product
 * @param {Array} lineItems
 * @param {number|null} excludeLineId — pass the line being priced when
 *   recalculating an existing line; pass null when adding a brand-new line.
 */
export function pricePercentOfContractFor(product, lineItems, excludeLineId = null) {
  if (product?.pricing_model !== 'percent_of_contract') return null
  const contractValue = sumOtherLines(lineItems, excludeLineId)
  return calcPercentOfContractPrice(product, contractValue)
}

function formatUsd(n) {
  if (!Number.isFinite(n)) return '$0'
  return '$' + Math.round(n).toLocaleString('en-US')
}
