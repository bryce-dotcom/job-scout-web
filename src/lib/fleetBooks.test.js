import { describe, it, expect } from 'vitest'
import { fleetSpend, milesByVehicle, standardMileageDeduction } from './fleetBooks'

const inSep = (d) => String(d || '').startsWith('2026-09')
const fleet = [{ id: 1, name: 'TRK-01' }, { id: 2, name: 'TRK-02' }]

describe('fleetSpend', () => {
  it('sums fuel, maintenance and repairs per vehicle, accepting both column spellings', () => {
    const r = fleetSpend({
      fleet,
      fuelLogs: [{ fleet_id: 1, log_date: '2026-09-02', total_cost: 80 }, { asset_id: 1, date: '2026-09-05', total_cost: 70 }, { fleet_id: 2, log_date: '2026-08-30', total_cost: 999 }],
      maintenance: [{ asset_id: 2, date: '2026-09-10', cost: 300 }],
      repairs: [{ fleet_id: 2, repair_date: '2026-09-12', cost: 450 }],
    }, inSep, { days: 30 })
    expect(r.byKind).toEqual({ fuel: 150, maintenance: 300, repairs: 450, recurring: 0 })
    expect(r.total).toBe(900)
    expect(r.rows.map(x => [x.name, x.total])).toEqual([['TRK-02', 750], ['TRK-01', 150]])
  })
  it('prorates recurring costs to the window and spreads fleet-wide rows across vehicles', () => {
    const r = fleetSpend({
      fleet,
      recurringCosts: [
        { fleet_id: null, cost_type: 'insurance', amount: 3650, period: 'annual', effective_from: '2026-01-01' },
        { fleet_id: 1, cost_type: 'telematics', amount: 30, period: 'monthly', effective_from: '2026-01-01' },
      ],
    }, inSep, { days: 30, onDate: new Date('2026-09-15T12:00:00') })
    // insurance: 3650 × 30/365 = 300 → 150 each; telematics: 360/yr × 30/365 = 29.59 to TRK-01
    expect(r.byKind.recurring).toBe(329.59)
    expect(r.rows.find(x => x.name === 'TRK-01').recurring).toBe(179.59)
    expect(r.recurringAnnual).toBe(4010)
  })
  it('turns meter readings into miles and cost per mile', () => {
    const readings = [
      { fleet_id: 1, recorded_at: '2026-09-01T08:00:00Z', odometer_miles: 100000 },
      { fleet_id: 1, recorded_at: '2026-09-28T08:00:00Z', odometer_miles: 101200 },
      { fleet_id: 1, recorded_at: '2026-08-01T08:00:00Z', odometer_miles: 90000 },
    ]
    expect(milesByVehicle(readings, inSep).get(1)).toBe(1200)
    const r = fleetSpend({ fleet, fuelLogs: [{ fleet_id: 1, log_date: '2026-09-02', total_cost: 600 }], meterReadings: readings }, inSep)
    expect(r.rows[0].costPerMile).toBe(0.5)
    expect(r.costPerMile).toBe(0.5)
  })
  it('standard mileage uses the default rate unless told otherwise', () => {
    expect(standardMileageDeduction(1000)).toBe(700)
    expect(standardMileageDeduction(1000, 0.67)).toBe(670)
  })
})
