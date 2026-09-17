// Fleet spend as Books sees it: fuel logs, maintenance, repairs, and the
// calendar-driven recurring costs (insurance, registration, telematics),
// per vehicle and in total, with miles driven from meter readings.
//
// Two column spellings exist in the wild for fuel/maintenance rows
// (fleet_id/log_date vs asset_id/date — see useFleetLifecycle); every
// reader here accepts both.
import { annualByType, isActiveOn, annualAmount } from './fleetRecurringCosts'

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const vehicleOf = (row) => row?.fleet_id ?? row?.asset_id ?? null
const dateOf = (row) => row?.log_date || row?.date || row?.repair_date || row?.service_date || row?.created_at

export const IRS_MILEAGE_RATE_DEFAULT = 0.70 // $/mile; the company can override in settings 'irs_mileage_rate'

/** Miles per vehicle inside the window: last reading minus first reading. */
export function milesByVehicle(meterReadings = [], inRange = () => true) {
  const byV = new Map()
  for (const r of meterReadings || []) {
    const v = vehicleOf(r)
    const miles = num(r.odometer_miles)
    if (!v || !(miles > 0) || !inRange(r.recorded_at)) continue
    const cur = byV.get(v) || { min: miles, max: miles }
    cur.min = Math.min(cur.min, miles); cur.max = Math.max(cur.max, miles)
    byV.set(v, cur)
  }
  const out = new Map()
  for (const [v, m] of byV) out.set(v, r2(Math.max(0, m.max - m.min)))
  return out
}

/**
 * @param days  length of the window in days, to prorate recurring costs
 */
export function fleetSpend({ fuelLogs = [], maintenance = [], repairs = [], recurringCosts = [], fleet = [], meterReadings = [] } = {}, inRange = () => true, { days = 30, onDate = new Date() } = {}) {
  const per = new Map()
  const bucket = (v) => {
    const k = v ?? 'unassigned'
    if (!per.has(k)) per.set(k, { fleetId: v, fuel: 0, maintenance: 0, repairs: 0, recurring: 0, total: 0, miles: 0, costPerMile: null })
    return per.get(k)
  }
  for (const f of fuelLogs || []) if (inRange(dateOf(f))) bucket(vehicleOf(f)).fuel += num(f.total_cost)
  for (const m of maintenance || []) if (inRange(dateOf(m))) bucket(vehicleOf(m)).maintenance += num(m.cost) || (num(m.parts_cost) + num(m.labor_cost))
  for (const r of repairs || []) if (inRange(dateOf(r))) bucket(vehicleOf(r)).repairs += num(r.cost)
  // Recurring: annualized, prorated to the window; fleet-wide rows spread evenly.
  const active = (recurringCosts || []).filter(r => isActiveOn(r, onDate))
  const vehicles = (fleet || []).map(v => v.id)
  for (const r of active) {
    const share = annualAmount(r) * (days / 365)
    if (r.fleet_id) bucket(r.fleet_id).recurring += share
    else if (vehicles.length) for (const v of vehicles) bucket(v).recurring += share / vehicles.length
    else bucket(null).recurring += share
  }
  const miles = milesByVehicle(meterReadings, inRange)
  const nameOf = new Map((fleet || []).map(v => [v.id, v.name || v.asset_id || `Vehicle ${v.id}`]))
  const rows = [...per.values()].map(x => {
    x.total = r2(x.fuel + x.maintenance + x.repairs + x.recurring)
    x.fuel = r2(x.fuel); x.maintenance = r2(x.maintenance); x.repairs = r2(x.repairs); x.recurring = r2(x.recurring)
    x.miles = miles.get(x.fleetId) || 0
    x.costPerMile = x.miles > 0 ? r2(x.total / x.miles) : null
    x.name = x.fleetId ? (nameOf.get(x.fleetId) || `Vehicle ${x.fleetId}`) : 'Unassigned'
    return x
  }).filter(x => x.total > 0 || x.miles > 0).sort((a, b) => b.total - a.total)
  const byKind = {
    fuel: r2(rows.reduce((s, x) => s + x.fuel, 0)),
    maintenance: r2(rows.reduce((s, x) => s + x.maintenance, 0)),
    repairs: r2(rows.reduce((s, x) => s + x.repairs, 0)),
    recurring: r2(rows.reduce((s, x) => s + x.recurring, 0)),
  }
  const totalMiles = r2(rows.reduce((s, x) => s + x.miles, 0))
  const total = r2(byKind.fuel + byKind.maintenance + byKind.repairs + byKind.recurring)
  return { rows, byKind, total, totalMiles, costPerMile: totalMiles > 0 ? r2(total / totalMiles) : null, recurringAnnual: r2(annualByType(active, onDate).total) }
}

/** IRS standard mileage: what the business could deduct on miles alone. */
export function standardMileageDeduction(miles, rate = IRS_MILEAGE_RATE_DEFAULT) {
  return r2(num(miles) * (num(rate) || IRS_MILEAGE_RATE_DEFAULT))
}
