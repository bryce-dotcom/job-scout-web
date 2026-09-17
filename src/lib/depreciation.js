// Book depreciation for the assets table. Straight-line: (cost − salvage)
// spread evenly over the useful life, starting the month the asset went
// into service. Book value is derived on the fly, never stored, so fixing
// an input re-derives the whole history. "Unknown is not zero": an asset
// with no life set is simply not depreciated and keeps its typed value.

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const monthIndex = (d) => { const x = d instanceof Date ? d : new Date(String(d).slice(0, 10) + 'T00:00:00'); return x.getFullYear() * 12 + x.getMonth() }

export function isDepreciable(asset) {
  return num(asset?.useful_life_years) > 0 && num(asset?.purchase_price) > 0 && !!(asset?.in_service_date || asset?.purchase_date)
}

/**
 * @returns null when the asset is not set up for depreciation, else
 *   { monthly, months, elapsed, accumulated, bookValue, remainingMonths, fullyDepreciated }
 */
export function straightLine(asset, asOf = new Date()) {
  if (!isDepreciable(asset)) return null
  const cost = num(asset.purchase_price)
  const salvage = Math.min(cost, Math.max(0, num(asset.salvage_value)))
  const months = Math.max(1, Math.round(num(asset.useful_life_years) * 12))
  const monthly = (cost - salvage) / months
  const start = monthIndex(asset.in_service_date || asset.purchase_date)
  // Count whole months in service through the as-of month, inclusive.
  const elapsed = Math.max(0, Math.min(months, monthIndex(asOf) - start + 1))
  const accumulated = r2(monthly * elapsed)
  return {
    monthly: r2(monthly),
    months,
    elapsed,
    accumulated,
    bookValue: r2(cost - accumulated),
    remainingMonths: months - elapsed,
    fullyDepreciated: elapsed >= months,
  }
}

/** Depreciation expense that falls in a calendar year. */
export function yearExpense(asset, year) {
  const d = straightLine(asset, new Date(year, 11, 31))
  if (!d) return 0
  const prior = straightLine(asset, new Date(year - 1, 11, 31))
  return r2(d.accumulated - (prior ? prior.accumulated : 0))
}

/** What the balance sheet should carry: book value when depreciating, else the typed value. */
export function carryingValue(asset, asOf = new Date()) {
  const d = straightLine(asset, asOf)
  return d ? d.bookValue : num(asset?.current_value)
}

export function depreciationSchedule(assets = [], year = new Date().getFullYear()) {
  const rows = (assets || []).filter(a => a.status !== 'disposed' && isDepreciable(a)).map(a => {
    const d = straightLine(a, new Date(year, 11, 31))
    return { id: a.id, name: a.name, cost: num(a.purchase_price), salvage: num(a.salvage_value), lifeYears: num(a.useful_life_years), yearExpense: yearExpense(a, year), accumulated: d.accumulated, bookValue: d.bookValue, fullyDepreciated: d.fullyDepreciated }
  })
  return { rows, totalYearExpense: r2(rows.reduce((s, r) => s + r.yearExpense, 0)), totalBookValue: r2(rows.reduce((s, r) => s + r.bookValue, 0)) }
}
