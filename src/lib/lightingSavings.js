// What a lighting retrofit saves in a year. ONE definition.
//
// Cole (869599b1): "Learned savings is showing low."
//
// He was right, and the reason was structural rather than arithmetic. A
// commercial electric bill has two meters on it:
//
//   ENERGY   cents per kWh for everything consumed
//   DEMAND   dollars per kW, billed on the highest 15-minute peak that month
//
// The audit only ever computed the first. Rocky Mountain Schedule 6 is
// $0.0845/kWh AND $9.50/kW/month; Schedule 8 is $0.0756 AND $12.85. Ten of the
// twenty rate schedules in the catalogue carry a demand charge, it is researched
// off the tariff, stored on utility_rate_schedules.demand_charge, and the audit
// screen even prints "+ $9.50/kW demand" beside the rate — and then nothing
// used it.
//
// Measured across 107 audits before this changed: $178,365 of energy savings on
// the page, and roughly $73,000 of demand savings not claimed. About 41% light.
//
// The coincidence factor is why this is a setting and not a constant. Demand is
// billed on the peak fifteen minutes of the month, and the lights are not
// guaranteed to be at full load in that window. Claiming 100% is how a savings
// estimate gets taken apart in front of a customer; 0.8 is the conservative
// convention for interior commercial lighting. A company that knows its own
// buildings can move it.

/** Watts off the connected load, expressed in kW. */
export function kwReduced(wattsReduced) {
  const w = Number(wattsReduced)
  return Number.isFinite(w) && w > 0 ? w / 1000 : 0
}

/**
 * Annual savings, split into the parts a customer can check against a bill.
 *
 * wattsReduced       existing watts - proposed watts
 * operatingHours     hours per operating day
 * operatingDays      operating days per year
 * electricRate       $/kWh (the energy charge from the tariff)
 * demandChargePerKw  $/kW/month from the tariff; 0 or null when the customer
 *                    is not on a demand tariff, which is most residential and
 *                    small general-service accounts
 * demandCoincidence  0..1, how much of the lighting load is assumed to be on
 *                    at the moment the building peaks
 */
export function computeLightingSavings({
  wattsReduced = 0,
  operatingHours = 0,
  operatingDays = 0,
  electricRate = 0,
  demandChargePerKw = 0,
  demandCoincidence = 0.8,
} = {}) {
  const hours = Math.max(0, Number(operatingHours) || 0)
  const days = Math.max(0, Number(operatingDays) || 0)
  const rate = Math.max(0, Number(electricRate) || 0)
  const kw = kwReduced(wattsReduced)

  const annualHours = hours * days
  const annualKwh = (kw * annualHours)          // kW x h = kWh
  const energyDollars = annualKwh * rate

  // Clamp rather than trust: a coincidence factor above 1 would claim more
  // demand reduction than the fixtures physically draw.
  const dc = Math.max(0, Number(demandChargePerKw) || 0)
  const cf = Math.min(1, Math.max(0, Number(demandCoincidence) ?? 0.8))
  const demandDollars = kw * dc * 12 * cf

  return {
    kwReduced: kw,
    annualKwh,
    energyDollars,
    demandDollars,
    totalDollars: energyDollars + demandDollars,
  }
}

/** Rounded for storage on lighting_audits, matching the existing columns. */
export function savingsForStorage(input) {
  const s = computeLightingSavings(input)
  return {
    annual_savings_kwh: Math.round(s.annualKwh) || 0,
    annual_savings_dollars: Math.round(s.totalDollars * 100) / 100 || 0,
  }
}
