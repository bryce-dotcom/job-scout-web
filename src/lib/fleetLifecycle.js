// When should this machine be sold?
//
// The honest version of that question is an old one in equipment economics,
// and it has a real answer. Two costs move in opposite directions as an asset
// ages:
//
//   ownership  = (what you paid − what it's worth now) spread over use.
//                Falls with use: depreciation is front-loaded, so every extra
//                hour spreads the big early loss thinner.
//   operating  = fuel, maintenance, repairs, tires. Rises with use, because
//                things wear out and old machines break more.
//
// Their sum is U-shaped. The bottom of that U is the cheapest hour this
// machine will ever give you, and every hour after it costs more than the
// same hour on a replacement. That point — not a fixed age, not a warranty
// expiry, not a gut feel — is when to sell.
//
// Everything here is a function of USE, not calendar time. A backhoe with
// 400 hours on it after three years is a young machine; the same backhoe at
// 6,000 hours after three years is finished. Calendar depreciation schedules
// are why contractors keep iron long past the point it stopped being cheap.
//
// Design rule throughout: unknown is not zero. A missing purchase price makes
// the answer unavailable, never $0. Every result carries what it is missing,
// so the UI can say "tell me two things and I'll tell you when to sell"
// instead of drawing a confident bar out of nothing.

// ---------------------------------------------------------------------
// Residual value curves
//
// Class defaults, used until real comps exist. Deliberately coarse — they are
// a starting shape, not an appraisal, and every one of them is beaten by a
// researched comp or by the owner's own number.
//
//   life        typical economic life in the class's meter unit
//   residual    fraction of purchase price still there at `life`
//   earlyDrop   the hit taken immediately on becoming used. Real, and large
//               for road vehicles: a new pickup loses value driving off the
//               lot. Heavy iron barely notices, and trailers not at all.
// ---------------------------------------------------------------------
export const CLASS_CURVES = {
  pickup:         { basis: 'miles', life: 200_000, residual: 0.12, earlyDrop: 0.18, opsPerUnit: 0.42, opsGrowth: 1.6, lifeYears: 12, ageDecay: 0.16 },
  service_truck:  { basis: 'miles', life: 250_000, residual: 0.14, earlyDrop: 0.16, opsPerUnit: 0.55, opsGrowth: 1.7, lifeYears: 12, ageDecay: 0.15 },
  van:            { basis: 'miles', life: 220_000, residual: 0.10, earlyDrop: 0.18, opsPerUnit: 0.44, opsGrowth: 1.6, lifeYears: 12, ageDecay: 0.16 },
  box_truck:      { basis: 'miles', life: 300_000, residual: 0.15, earlyDrop: 0.15, opsPerUnit: 0.62, opsGrowth: 1.8, lifeYears: 15, ageDecay: 0.13 },
  dump_truck:     { basis: 'miles', life: 350_000, residual: 0.18, earlyDrop: 0.14, opsPerUnit: 0.85, opsGrowth: 2.0, lifeYears: 15, ageDecay: 0.12 },

  // Hour-metered iron holds value far better and wears on a longer curve.
  skid_steer:     { basis: 'hours', life: 6_000,  residual: 0.28, earlyDrop: 0.10, opsPerUnit: 12,  opsGrowth: 2.2, lifeYears: 12, ageDecay: 0.08 },
  track_loader:   { basis: 'hours', life: 6_000,  residual: 0.28, earlyDrop: 0.10, opsPerUnit: 14,  opsGrowth: 2.3, lifeYears: 12, ageDecay: 0.08 },
  mini_excavator: { basis: 'hours', life: 8_000,  residual: 0.32, earlyDrop: 0.09, opsPerUnit: 11,  opsGrowth: 2.0, lifeYears: 15, ageDecay: 0.07 },
  excavator:      { basis: 'hours', life: 12_000, residual: 0.30, earlyDrop: 0.09, opsPerUnit: 26,  opsGrowth: 2.1, lifeYears: 15, ageDecay: 0.07 },
  backhoe:        { basis: 'hours', life: 10_000, residual: 0.26, earlyDrop: 0.10, opsPerUnit: 16,  opsGrowth: 2.2, lifeYears: 15, ageDecay: 0.08 },
  wheel_loader:   { basis: 'hours', life: 12_000, residual: 0.30, earlyDrop: 0.09, opsPerUnit: 24,  opsGrowth: 2.0, lifeYears: 15, ageDecay: 0.07 },
  dozer:          { basis: 'hours', life: 12_000, residual: 0.28, earlyDrop: 0.10, opsPerUnit: 32,  opsGrowth: 2.2, lifeYears: 15, ageDecay: 0.07 },
  telehandler:    { basis: 'hours', life: 10_000, residual: 0.30, earlyDrop: 0.10, opsPerUnit: 14,  opsGrowth: 2.0, lifeYears: 15, ageDecay: 0.07 },
  boom_lift:      { basis: 'hours', life: 10_000, residual: 0.25, earlyDrop: 0.12, opsPerUnit: 12,  opsGrowth: 2.1, lifeYears: 15, ageDecay: 0.08 },
  scissor_lift:   { basis: 'hours', life: 10_000, residual: 0.22, earlyDrop: 0.12, opsPerUnit: 8,   opsGrowth: 2.0, lifeYears: 15, ageDecay: 0.08 },
  compactor:      { basis: 'hours', life: 8_000,  residual: 0.24, earlyDrop: 0.11, opsPerUnit: 10,  opsGrowth: 2.1, lifeYears: 12, ageDecay: 0.08 },
  generator:      { basis: 'hours', life: 15_000, residual: 0.20, earlyDrop: 0.12, opsPerUnit: 6,   opsGrowth: 1.8, lifeYears: 20, ageDecay: 0.06 },

  // Barely depreciates, barely breaks. Almost never worth replacing early.
  trailer:        { basis: 'miles', life: 400_000, residual: 0.35, earlyDrop: 0.08, opsPerUnit: 0.10, opsGrowth: 1.2, lifeYears: 25, ageDecay: 0.04 },
  attachment:     { basis: 'hours', life: 8_000,  residual: 0.25, earlyDrop: 0.10, opsPerUnit: 2,   opsGrowth: 1.5, lifeYears: 12, ageDecay: 0.07 },
  other:          { basis: 'hours', life: 10_000, residual: 0.25, earlyDrop: 0.12, opsPerUnit: 10,  opsGrowth: 2.0, lifeYears: 12, ageDecay: 0.09 },
}

export const DEFAULT_CURVE = CLASS_CURVES.other

/**
 * Number, or null for anything that isn't one.
 *
 * Exists because Number(null) === 0 and Number('') === 0, so the obvious
 * guard `Number.isFinite(Number(x))` waves null straight through as a
 * legitimate zero. That is how a machine with no recorded purchase price
 * came out valued at $0 — free to own, therefore keep forever, stated with
 * total confidence. Unknown must stay unknown all the way down.
 */
export function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function curveFor(assetClass) {
  return CLASS_CURVES[assetClass] || DEFAULT_CURVE
}

/**
 * Fraction of purchase price retained after `used` units of the meter.
 *
 * Shape: an immediate step down (new -> used), then exponential decay toward
 * the residual floor. Exponential rather than straight-line because that is
 * how used equipment actually prices — the first third of life costs far more
 * value than the last third, which is precisely the fact a straight-line
 * schedule hides from the owner.
 */
export function residualFraction(used, curve = DEFAULT_CURVE, ageYears = null) {
  const life = curve.life || 1
  const u = Math.max(0, num(used) ?? 0) / life
  const floor = curve.residual
  const start = 1 - (curve.earlyDrop || 0)
  const age = num(ageYears)

  // Meter-only: the original curve, still correct when age is unknown.
  const k = Math.log((start - floor) / Math.max(floor * 0.01, 1e-6)) || 3
  const byMeter = u <= 0 ? 1 : Math.min(1, Math.max(floor * 0.5, floor + (start - floor) * Math.exp(-k * u)))

  // Note the ordering: age is checked BEFORE the zero-meter shortcut. A brand
  // new machine that has not moved is worth full price; a four-year-old one
  // that has not moved is emphatically not, and returning 1 for both is how a
  // model ends up insisting an unused asset never lost a cent.
  if (age === null || age <= 0) return byMeter

  // Age matters independently of use, and on a lightly-driven asset it is the
  // whole story. An $83k truck with 3,898 miles has lost real money to being
  // a 2025 rather than to being driven; a miles-only curve calls it nearly
  // new and says keep, while the market has already moved on.
  //
  // Modelled the way used vehicles actually price: model-year decay, adjusted
  // for whether this one carries more or fewer miles than its age predicts.
  // Low miles earn a premium — real, but far smaller than owners expect,
  // which is exactly the gap worth showing them.
  const byAge = start * Math.pow(1 - (curve.ageDecay || 0.1), age)
  const expectedByNow = (life / (curve.lifeYears || 12)) * age
  const ratio = expectedByNow > 0 ? (num(used) ?? 0) / expectedByNow : 1
  const adjust = Math.min(1.15, Math.max(0.55, 1 - (ratio - 1) * 0.22))

  // Age IS the model once it's known, with mileage as the adjustment — not a
  // minimum against the meter curve. Both curves carry the new-to-used drop,
  // so taking the lower of the two applies it twice and lets mileage dominate
  // absurdly: a four-year-old truck came out 2.9x the value of the same truck
  // with average miles, when the real spread is nearer 1.3x.
  return Math.min(1, Math.max(floor * 0.5, byAge * adjust))
}


/** Modelled market value. Falls back to the class curve when no comp exists. */
export function estimateValue({ purchasePrice, used, curve, comp, override, ageYears = null }) {
  if (num(override) !== null) return { value: num(override), source: 'override' }
  if (num(comp) !== null) return { value: num(comp), source: 'comps' }
  const price = num(purchasePrice)
  if (price === null) return { value: null, source: null }
  return { value: Math.round(price * residualFraction(used, curve, ageYears)), source: 'curve' }
}

/**
 * Operating cost per meter unit at a given usage level.
 *
 * Anchored on the class default and scaled linearly toward `opsGrowth` across
 * one economic life, so a machine at end of life costs roughly opsGrowth times
 * what it did when new. When the asset has real spend history, that measured
 * rate replaces the class anchor — the shape is a model, the level should not
 * be if we can help it.
 */
export function operatingRate(used, curve = DEFAULT_CURVE, measuredRate = null) {
  const life = curve.life || 1
  const u = Math.max(0, Number(used) || 0) / life
  const base = measuredRate != null && measuredRate > 0 ? measuredRate : curve.opsPerUnit
  const growth = 1 + (curve.opsGrowth - 1) * Math.min(u, 1.5)
  return base * growth
}

/** Cumulative operating spend from new to `used`, integrating the rate. */
function cumulativeOperating(used, curve, measuredRate) {
  const STEPS = 60
  const step = used / STEPS
  let total = 0
  for (let i = 0; i < STEPS; i++) total += operatingRate((i + 0.5) * step, curve, measuredRate) * step
  return total
}

/**
 * Total cost per meter unit if the asset is sold after `used` units.
 *
 * ownership = (paid − worth then) / used
 * operating = average spend per unit over the whole life so far
 *
 * This is the curve the lifecycle bar draws.
 */
export function costPerUnitAt(used, { purchasePrice, curve, measuredRate }) {
  const price = num(purchasePrice)
  if (!(used > 0) || price === null) return null
  const value = price * residualFraction(used, curve)
  const ownership = (price - value) / used
  const operating = cumulativeOperating(used, curve, measuredRate) / used
  return { total: ownership + operating, ownership, operating }
}

/**
 * The bottom of the U: cheapest cost per unit over the asset's plausible life.
 *
 * Scanned rather than solved. The curve has no closed form once measured spend
 * is mixed in, and a scan over 200 points is both exact enough and impossible
 * to get subtly wrong — which matters more here than elegance, because the
 * output tells someone to sell a $30,000 asset.
 */
export function optimalReplacementPoint({ purchasePrice, curve, measuredRate }) {
  if (num(purchasePrice) === null) return null
  const max = curve.life * 1.5
  const step = max / 200
  let best = null
  for (let u = step; u <= max; u += step) {
    const c = costPerUnitAt(u, { purchasePrice, curve, measuredRate })
    if (!c) continue
    if (!best || c.total < best.total) best = { at: u, ...c }
  }
  return best
}

/**
 * Everything the vehicle card needs, in one call.
 *
 * `missing` is the point of the return shape: a partial answer that says what
 * would complete it beats both a refusal and a confident guess. A card can
 * then show "add the purchase date and I can tell you when to sell" rather
 * than a bar drawn from defaults nobody entered.
 */
export function computeLifecycle({
  purchasePrice,
  assetClass,
  meterUsed,          // hours or miles accrued under THIS owner
  // null, not 0. Defaulting an unknown to zero asserts "bought new with an
  // empty meter", which is the single most damaging assumption available
  // here: it makes a used machine look far younger than it is and pushes
  // the sell point years into the future.
  meterAtPurchase = null,
  // Whether meterUsed is a real meter reading or merely what telematics has
  // watched. A tracker installed last month on a ten-year-old truck reports
  // 193 miles, and treating that as the odometer produced a confident
  // $29.01/mile — arithmetically correct, economically nonsense.
  meterAnchored = true,
  ageYears = null,   // years since purchase; lets calendar decay be seen at all
  maintenanceSpend = 0,
  repairSpend = 0,
  fuelSpend = 0,
  // Insurance, drivers, registration — already scaled to the ownership period.
  recurringSpend = 0,
  compValue = null,
  overrideValue = null,
} = {}) {
  const curve = curveFor(assetClass)
  const missing = []
  if (num(purchasePrice) === null) missing.push('purchase_price')
  if (!assetClass) missing.push('asset_class')
  if (!(Number(meterUsed) > 0)) missing.push('meter_reading')
  if (meterAtPurchase === null || meterAtPurchase === undefined) missing.push('meter_at_purchase')
  if (!meterAnchored) missing.push('odometer_anchor')

  // Total meter on the machine, not just what this owner added — value tracks
  // the machine's whole life, while cost-to-own tracks only this owner's share.
  const lifetimeKnown = meterAtPurchase !== null && meterAtPurchase !== undefined && meterAnchored
  const lifetimeUsed = lifetimeKnown ? Number(meterAtPurchase) + (Number(meterUsed) || 0) : null
  const ownerUsed = Number(meterUsed) || 0

  const spend = (Number(maintenanceSpend) || 0) + (Number(repairSpend) || 0) +
    (Number(fuelSpend) || 0) + (Number(recurringSpend) || 0)
  const measuredRate = ownerUsed > 0 && spend > 0 ? spend / ownerUsed : null

  // A curve value needs a real meter. A comp or an owner override does not,
  // since both are statements about this machine rather than derivations.
  const { value, source: valueSource } = lifetimeKnown
    ? estimateValue({ purchasePrice, used: lifetimeUsed, curve, comp: compValue, override: overrideValue, ageYears })
    : estimateValue({ purchasePrice: null, used: 0, curve, comp: compValue, override: overrideValue })

  const optimal = optimalReplacementPoint({ purchasePrice, curve, measuredRate })
  const current = (ownerUsed > 0 && lifetimeKnown)
    ? costPerUnitAt(ownerUsed, { purchasePrice, curve, measuredRate })
    : null

  // Zones as fractions of the bar. Plan-to-replace opens at 80% of the way to
  // the optimum: replacement takes months to arrange, and arriving at the
  // decision on the day it becomes urgent is how people end up buying in a
  // hurry at a bad price.
  const optimalAt = optimal?.at ?? curve.life
  const barMax = optimalAt * 1.45
  const zones = {
    keepUntil: (optimalAt * 0.8) / barMax,
    planUntil: optimalAt / barMax,
  }

  // No meter, no verdict. 'unknown' is a state the card can render honestly;
  // a default of 'keep' would be advice nobody computed.
  // Two clocks run on every asset and the earlier one decides. Wear is the
  // obvious clock. Model year is the one that catches lightly-used equipment:
  // an $83k truck driven 5,000 miles a year needs 57 years to wear out, so a
  // miles-only verdict says 'keep' forever while it quietly ages to nothing.
  const ageFraction = ageYears !== null && curve.lifeYears ? ageYears / curve.lifeYears : null
  const wearFraction = lifetimeKnown && optimalAt > 0 ? lifetimeUsed / optimalAt : null
  const spent = Math.max(ageFraction ?? 0, wearFraction ?? 0)

  let verdict = 'unknown'
  if (lifetimeKnown || ageFraction !== null) {
    verdict = 'keep'
    if (spent >= 1) verdict = 'replace'
    else if (spent >= 0.8) verdict = 'plan'
  }

  // Which clock is actually binding — the thing to say out loud, because the
  // answer for an under-driven asset is 'age', and that surprises people.
  const limitedBy = ageFraction === null ? 'wear'
    : wearFraction === null ? 'age'
    : (ageFraction > wearFraction ? 'age' : 'wear')

  const position = (lifetimeKnown || ageFraction !== null) ? Math.min(Math.max(spent * 0.69, 0), 1) : null

  const remaining = lifetimeKnown ? Math.max(0, optimalAt - lifetimeUsed) : null

  return {
    ok: missing.length === 0,
    missing,
    basis: curve.basis,
    curve,
    lifetimeUsed,
    lifetimeKnown,
    ownerUsed,
    value,
    valueSource,
    costPerUnit: current?.total ?? null,
    ownershipPerUnit: current?.ownership ?? null,
    operatingPerUnit: current?.operating ?? null,
    measuredRate,
    optimalAt,
    remainingToOptimal: remaining,
    ageYears,
    ageFraction,
    wearFraction,
    limitedBy,
    // Years to wear out at the current rate. A number in the decades is the
    // clearest possible signal that this asset will never justify its price
    // through use, whatever the wear curve says.
    yearsToWearOut: (remaining !== null && ageYears > 0 && ownerUsed > 0)
      ? Math.round(remaining / (ownerUsed / ageYears))
      : null,
    position,
    zones,
    verdict,
  }
}

/**
 * Utilisation, and the recommendation it drives.
 *
 * The overlooked case: a machine well before its replacement point but barely
 * used is not a keep — it is capital sitting in a yard. Selling or renting it
 * out beats running it into its optimum over ten years. Most fleets never see
 * this because nobody measures hours against hours available.
 */
export function utilisation({ meterUsed, daysOwned, curve = DEFAULT_CURVE, expectedPerYear = null }) {
  const days = Number(daysOwned) || 0
  const used = Number(meterUsed) || 0
  if (days <= 0 || used <= 0) return { rate: null, perYear: null }
  const perYear = used / (days / 365)
  const expected = expectedPerYear || curve.life / 7   // ~7 years of typical life
  return { rate: Math.min(perYear / expected, 2), perYear: Math.round(perYear) }
}

export function recommend(lifecycle, util) {
  if (!lifecycle?.ok) return { action: 'incomplete', reason: `needs ${lifecycle?.missing?.join(', ')}` }
  if (lifecycle.limitedBy === 'age' && lifecycle.yearsToWearOut !== null && lifecycle.yearsToWearOut > 25) {
    return {
      action: 'sell_or_rent',
      reason: `at this usage it needs ~${lifecycle.yearsToWearOut} years to wear out — it will age to nothing long before it earns its price`,
    }
  }
  if (util?.rate != null && util.rate < 0.35) {
    return {
      action: 'sell_or_rent',
      reason: 'used well below its capacity — the capital is idle, not the machine',
    }
  }
  if (lifecycle.verdict === 'replace') {
    return { action: 'replace', reason: 'past its cheapest point; every further unit costs more than a replacement' }
  }
  if (lifecycle.verdict === 'plan') {
    return { action: 'plan', reason: 'approaching its cheapest point — start arranging a replacement' }
  }
  return { action: 'keep', reason: 'still in its cheap years' }
}
