// Tests for the bonus allotted-hours model. Each case is a real failure mode
// that reached payroll — job 23385 minted an ~$11k bonus off a 636.88h allotted
// that was the whole $47,766 job total ÷ $75. Run: npm test

import { describe, it, expect } from 'vitest'
import { computeAllottedHours } from './allottedHours'
import { calculateEfficiencyBonus } from './bonusCalc'

const SETTINGS = [{ key: 'default_hourly_rates', value: JSON.stringify({ 'HHH Building Services': 75, 'Energy Scout': 250 }) }]
const HHH = 'HHH Building Services'

describe('computeAllottedHours', () => {
  it('NO line items → 0, never the whole job_total ÷ rate (the job 23385 bug)', () => {
    expect(computeAllottedHours({ lines: [], jobTotal: 47766, businessUnit: HHH, settings: SETTINGS })).toBe(0)
  })

  it('a material line contributes 0 labor hours', () => {
    const lines = [{ total: 1500, item: { material_or_labor: 'material' } }]
    expect(computeAllottedHours({ lines, businessUnit: HHH, settings: SETTINGS })).toBe(0)
  })

  it('a labor line with no product hours → labor dollars ÷ rate', () => {
    const lines = [{ total: 750, item: { material_or_labor: 'labor' } }]
    expect(computeAllottedHours({ lines, businessUnit: HHH, settings: SETTINGS })).toBe(10) // 750 / 75
  })

  it('an untagged / custom line still falls back (treated as labor)', () => {
    expect(computeAllottedHours({ lines: [{ total: 300, item: { material_or_labor: null } }], businessUnit: HHH, settings: SETTINGS })).toBe(4)
    expect(computeAllottedHours({ lines: [{ total: 300 }], businessUnit: HHH, settings: SETTINGS })).toBe(4) // no item at all
  })

  it('product-defined hours win over the dollar fallback (× quantity)', () => {
    const lines = [{ quantity: 2, total: 999, item: { allotted_time_hours: 3, material_or_labor: 'labor' } }]
    expect(computeAllottedHours({ lines, businessUnit: HHH, settings: SETTINGS })).toBe(6)
  })

  it('mixed job: labor line counts, material line excluded', () => {
    const lines = [
      { total: 750, item: { material_or_labor: 'labor' } },     // 10h
      { total: 3000, item: { material_or_labor: 'material' } },  // 0h
    ]
    expect(computeAllottedHours({ lines, businessUnit: HHH, settings: SETTINGS })).toBe(10)
  })
})

describe('efficiency bonus >3× allotted guard', () => {
  const cfg = { efficiency_bonus_enabled: true, efficiency_bonus_rate: 30, company_bonus_cut_percent: 20, bonus_verification_gate: 'off' }
  const employees = [{ id: 10, name: 'Tech', skill_level: 'Scout' }]

  it('holds a bonus when allotted is >3× the hours worked (job 23385 shape)', () => {
    const { details } = calculateEfficiencyBonus({
      employeeId: 10,
      timeLogEntries: [{ job_id: 1, employee_id: 10, hours: 52 }],
      jobs: [{ id: 1, job_id: 'J1', job_title: 'Power Wash', allotted_time_hours: 636.88 }],
      employees, skillLevels: [], payrollConfig: cfg,
    })
    expect(details).toHaveLength(1)
    expect(details[0].blockedReason).toBe('allotted_over_actual')
    expect(details[0].wouldHaveEarned).toBeGreaterThan(0)
    expect(details[0].bonusAmount).toBeUndefined() // held, not paid
    expect(details[0].allottedRatio).toBeGreaterThan(3)
  })

  it('pays a normal bonus when allotted is within 3× of hours worked', () => {
    const { details } = calculateEfficiencyBonus({
      employeeId: 10,
      timeLogEntries: [{ job_id: 2, employee_id: 10, hours: 8 }],
      jobs: [{ id: 2, job_id: 'J2', job_title: 'Windows', allotted_time_hours: 10 }],
      employees, skillLevels: [], payrollConfig: cfg,
    })
    expect(details).toHaveLength(1)
    expect(details[0].blockedReason).toBeUndefined()
    expect(details[0].bonusAmount).toBeGreaterThan(0) // 2h saved × $30, minus company cut, one crew
  })
})
