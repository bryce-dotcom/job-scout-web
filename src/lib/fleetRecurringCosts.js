// Insurance, drivers and the rest of the costs that arrive on a calendar.
//
// Everything else in the fleet economics layer is an event — a repair, a tank
// of fuel, a set of tyres. These are not. They arrive monthly or annually
// whether the machine turns a wheel or not, and together they are usually the
// second largest line in a fleet after depreciation.
//
// Two shapes, both real:
//
//   per unit    a policy or a driver attached to one machine
//   fleet wide  one premium or one driver pool covering everything, split
//               across assets by an explicit rule
//
// The split rule is the opinionated part. Dividing a blanket policy evenly
// across units is the obvious choice and usually the wrong one: an $83,000
// truck and a $4,000 utility trailer are not the same risk, and charging them
// the same premium makes the trailer look expensive to own and the truck
// cheap. Since the whole point of this layer is deciding which machine to
// sell, an allocation that distorts that comparison is worse than not having
// the number at all.
//
// So the basis is explicit per cost, and the defaults reflect how each kind of
// cost actually behaves rather than which is easiest to compute.

const PERIODS_PER_YEAR = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annual: 1,
}

export const COST_TYPES = [
  { value: 'insurance',   label: 'Insurance',   defaultAllocation: 'value' },
  { value: 'driver',      label: 'Driver',      defaultAllocation: 'even' },
  { value: 'registration',label: 'Registration',defaultAllocation: 'even' },
  { value: 'storage',     label: 'Storage',     defaultAllocation: 'even' },
  { value: 'licensing',   label: 'Licensing',   defaultAllocation: 'even' },
  { value: 'telematics',  label: 'Telematics',  defaultAllocation: 'even' },
  { value: 'other',       label: 'Other',       defaultAllocation: 'even' },
]

export const ALLOCATIONS = [
  // Premium tracks replacement cost, not headcount. This is the default for
  // insurance because it is the only basis that does not make cheap assets
  // look expensive to own.
  { value: 'value', label: 'By value', hint: 'Costlier machines carry more of it — how insurance actually prices' },
  { value: 'even',  label: 'Split evenly', hint: 'Equal share each — how a driver pool usually works' },
  { value: 'usage', label: 'By usage', hint: 'By hours or miles run — for anything that accrues with use' },
]

const num = v => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** A cost at its billed period, expressed as an annual figure. */
export function annualAmount(row) {
  const amount = num(row?.amount)
  if (amount === null) return 0
  return amount * (PERIODS_PER_YEAR[row?.period] ?? 12)
}

/**
 * Is this cost in force on a given date?
 *
 * Rates are kept as history rather than edited in place, so a premium that
 * rises in March must not retroactively change what a machine cost to own in
 * January — the lifecycle curve is built from that history and would quietly
 * change shape underneath the person reading it.
 */
export function isActiveOn(row, onDate = new Date()) {
  // Compared as calendar dates, never as timestamps.
  //
  // effective_from is a DATE column: no time, no zone. Turning it into a
  // moment invents a midnight, and which midnight depends on the runtime's
  // timezone. West of UTC, new Date('2026-03-01') is 18:00 on Feb 28 local
  // while new Date('2026-03-01T00:00:00') is 06:00 UTC on the 1st — so a
  // premium was not yet in force on the day it started, and a policy stayed
  // active for hours after it ended. Comparing YYYY-MM-DD strings has no such
  // ambiguity and is what the column actually means.
  const day = toDayString(onDate)
  if (row?.effective_from && day < row.effective_from) return false
  if (row?.effective_to && day > row.effective_to) return false
  return true
}

/** Local calendar day as YYYY-MM-DD. */
function toDayString(d) {
  if (typeof d === 'string') return d.slice(0, 10)
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}


/**
 * Weight for one asset under a given basis.
 *
 * Returns null when the asset cannot be weighted — no value recorded, or no
 * meter reading. That is deliberate: an asset with an unknown value must not
 * silently weigh zero, because zero is a claim (this machine is free to
 * insure) rather than an absence.
 */
function weightFor(asset, allocation) {
  if (allocation === 'even') return 1
  if (allocation === 'value') return num(asset?.value)
  if (allocation === 'usage') return num(asset?.meter)
  return 1
}

/**
 * Spread fleet-wide costs across assets.
 *
 * `assets` is [{ id, value, meter }]. Returns a Map of assetId -> annual cost.
 *
 * When no asset can be weighted on the chosen basis — a fleet where nobody has
 * entered a purchase price yet, allocating insurance by value — this falls
 * back to an even split rather than assigning the whole premium to nobody.
 * The fallback is reported so the UI can say the number is rough, instead of
 * presenting a guess with the same confidence as a measurement.
 */
export function allocateFleetWide(rows, assets, onDate = new Date()) {
  const perAsset = new Map(assets.map(a => [a.id, 0]))
  const fallbacks = []

  for (const row of rows || []) {
    if (row.fleet_id) continue               // per-unit, handled elsewhere
    if (!isActiveOn(row, onDate)) continue

    const annual = annualAmount(row)
    if (annual <= 0 || assets.length === 0) continue

    const basis = row.allocation || 'even'
    let weights = assets.map(a => ({ id: a.id, w: weightFor(a, basis) }))
    let total = weights.reduce((t, x) => t + (x.w ?? 0), 0)

    // Nothing weighable on this basis: fall back rather than drop the cost.
    if (!(total > 0)) {
      fallbacks.push({ id: row.id, requested: basis, used: 'even' })
      weights = assets.map(a => ({ id: a.id, w: 1 }))
      total = assets.length
    } else {
      // Assets missing the weighting figure would otherwise vanish from the
      // split, so the rest silently absorb their share. Give them the mean —
      // it keeps the total intact and does not pretend they cost nothing.
      const known = weights.filter(x => x.w !== null && x.w > 0)
      if (known.length && known.length < weights.length) {
        const mean = known.reduce((t, x) => t + x.w, 0) / known.length
        weights = weights.map(x => (x.w === null || x.w <= 0 ? { ...x, w: mean } : x))
        total = weights.reduce((t, x) => t + x.w, 0)
        fallbacks.push({ id: row.id, requested: basis, used: `${basis} (mean for ${weights.length - known.length} unpriced)` })
      }
    }

    for (const { id, w } of weights) {
      perAsset.set(id, (perAsset.get(id) || 0) + (annual * (w / total)))
    }
  }

  return { perAsset, fallbacks }
}

/**
 * Total annual recurring cost per asset: its own costs plus its share of the
 * fleet-wide ones.
 */
export function annualRecurringByAsset(rows, assets, onDate = new Date()) {
  const { perAsset, fallbacks } = allocateFleetWide(rows, assets, onDate)

  for (const row of rows || []) {
    if (!row.fleet_id) continue
    if (!isActiveOn(row, onDate)) continue
    if (!perAsset.has(row.fleet_id)) continue   // asset gone; ignore rather than crash
    perAsset.set(row.fleet_id, perAsset.get(row.fleet_id) + annualAmount(row))
  }

  return { perAsset, fallbacks }
}

/** Fleet totals by cost type, for a summary row. */
export function annualByType(rows, onDate = new Date()) {
  const out = {}
  let total = 0
  for (const row of rows || []) {
    if (!isActiveOn(row, onDate)) continue
    const a = annualAmount(row)
    out[row.cost_type] = (out[row.cost_type] || 0) + a
    total += a
  }
  return { byType: out, total }
}
