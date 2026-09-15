import { describe, it, expect } from 'vitest'
import { quarterOf, quarterDueDate, quartersOfYear } from './payrollQuarters'
import { SUI_STATES, suiWageBaseFor, validateSuiRate, suiRateStatus, suiRateInForce } from './suiRate'
import { computeSuiTrueUp, trueUpLiabilityRow, suiWagesOf } from './suiTrueUp'

// ─────────────────────────────────────────────────────────────────────────
// SUI the Gusto way: tell people where the rate is, let them run on a
// temporary estimate, true-up when the real one lands, flag a stale one.
// Every number here is employer tax; a quiet mistake becomes a DWS notice.
// ─────────────────────────────────────────────────────────────────────────

describe('payroll quarters — due the last day of the month after the quarter', () => {
  it('places pay dates in the right quarter with the right due date', () => {
    expect(quarterOf('2026-01-15')).toMatchObject({ year: 2026, quarter: 1, start: '2026-01-01', end: '2026-03-31', due: '2026-04-30' })
    expect(quarterOf('2026-05-20')).toMatchObject({ quarter: 2, end: '2026-06-30', due: '2026-07-31' })
    expect(quarterOf('2026-09-30')).toMatchObject({ quarter: 3, end: '2026-09-30', due: '2026-10-31' })
    expect(quarterOf('2026-12-31')).toMatchObject({ quarter: 4, end: '2026-12-31', due: '2027-01-31' })
  })

  it('never says Dec 1 for a Q3 pay date (the off-by-one-month bug in the old copy)', () => {
    expect(quarterDueDate('2026-08-05')).toBe('2026-10-31')
    expect(quarterDueDate('2026-05-16')).toBe('2026-07-31')
  })

  it('reads a plain date string without timezone drift', () => {
    // Late-evening Mountain time used to roll into the next day via toISOString.
    expect(quarterOf('2026-03-31')).toMatchObject({ quarter: 1 })
    expect(quarterOf('2026-06-30')).toMatchObject({ quarter: 2 })
  })

  it('lists the four quarters of a year oldest first', () => {
    expect(quartersOfYear(2026).map(q => q.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026'])
  })
})

describe('Utah facts and rate validation', () => {
  it('carries the 2026 Utah figures: base $50,700, range 0.1–7.1%, new employer 1.4%', () => {
    expect(SUI_STATES.UT.wageBase[2026]).toBe(50700)
    expect(SUI_STATES.UT.rateRange).toEqual([0.1, 7.1])
    expect(SUI_STATES.UT.newEmployerRatePct).toBe(1.4)
    expect(suiWageBaseFor('UT', 2026)).toBe(50700)
    expect(suiWageBaseFor('UT', 2031)).toBe(50700) // latest known, never null
    expect(suiWageBaseFor('ZZ', 2026)).toBe(null)
  })

  it('accepts a rate inside the state range and refuses one outside it, with the decimal hint', () => {
    expect(validateSuiRate('UT', 0.1)).toBe(null)
    expect(validateSuiRate('UT', 1.4)).toBe(null)
    expect(validateSuiRate('UT', 7.1)).toBe(null)
    expect(validateSuiRate('UT', 0.001)).toMatch(/0\.001 is 0\.1%/)
    expect(validateSuiRate('UT', 9)).toMatch(/between 0\.1% and 7\.1%/)
    expect(validateSuiRate('UT', '')).toMatch(/percentage/)
    expect(validateSuiRate('UT', -1)).toMatch(/negative/)
  })

  it('does not invent a range for a state it has no figures for', () => {
    expect(validateSuiRate('ID', 3.2)).toBe(null)
    expect(validateSuiRate('ID', 45)).toMatch(/not a rate any state assigns/)
  })
})

describe('the rate in force on a date', () => {
  const history = [
    { id: 1, rate_pct: 1.4, effective_date: '2026-01-01', source: 'estimate' },
    { id: 2, rate_pct: 0.1, effective_date: '2026-01-01', source: 'notice' },   // the correction, same effective date
    { id: 3, rate_pct: 0.2, effective_date: '2027-01-01', source: 'notice' },   // next year's, entered in December
  ]
  it('uses the newest row with an effective date on or before the day', () => {
    expect(suiRateInForce(history, null, '2026-12-15')).toMatchObject({ ratePct: 0.1, source: 'notice' })
    expect(suiRateInForce(history, null, '2027-01-01')).toMatchObject({ ratePct: 0.2 })
  })
  it('falls back to the companies row when no history row applies yet', () => {
    expect(suiRateInForce(history, { sui_rate_pct: 1.2, sui_rate_source: 'manual' }, '2025-06-01')).toMatchObject({ ratePct: 1.2, source: 'manual' })
    expect(suiRateInForce([], null, '2026-06-01').ratePct).toBe(null)
  })
})

describe('what the banner says', () => {
  const sept = new Date(2026, 8, 14)
  it('missing → says SUI is at $0 and offers the new-employer estimate', () => {
    const s = suiRateStatus({ state_employer_id_state: 'UT', sui_rate_pct: null }, sept)
    expect(s.level).toBe('missing')
    expect(s.detail).toMatch(/1\.4%/)
  })
  it('estimate → flagged, tells them where the real number is, promises the true-up', () => {
    const s = suiRateStatus({ state_employer_id_state: 'UT', sui_rate_pct: 1.4, sui_rate_source: 'estimate', sui_rate_effective_date: '2026-01-01' }, sept)
    expect(s.level).toBe('estimate')
    expect(s.detail).toMatch(/box J/)
    expect(s.detail).toMatch(/true-up/)
  })
  it("stale → last year's rate is called out in the new year", () => {
    const s = suiRateStatus({ state_employer_id_state: 'UT', sui_rate_pct: 0.1, sui_rate_source: 'notice', sui_rate_effective_date: '2026-01-01' }, new Date(2027, 1, 3))
    expect(s.level).toBe('stale')
    expect(s.action).toBe('Enter the 2027 rate')
  })
  it("a next-year rate entered in December is neither in force yet nor stale in January", () => {
    const company = { state_employer_id_state: 'UT', sui_rate_pct: 0.1, sui_rate_source: 'notice', sui_rate_effective_date: '2026-01-01' }
    const history = [
      { id: 1, rate_pct: 0.1, effective_date: '2026-01-01', source: 'notice' },
      { id: 2, rate_pct: 0.3, effective_date: '2027-01-01', source: 'notice' },
    ]
    expect(suiRateStatus(company, new Date(2026, 11, 20), history)).toMatchObject({ level: 'ok', ratePct: 0.1 })
    expect(suiRateStatus(company, new Date(2027, 0, 5), history)).toMatchObject({ level: 'ok', ratePct: 0.3 })
  })
})

describe('the true-up', () => {
  // Two techs paid semi-monthly; one crosses the wage base in Q3.
  const stubs = []
  let id = 1
  const pay = (emp, date, wages) => stubs.push({ id: id++, employee_id: emp, pay_date: date, gross_pay: wages, taxable_wages: wages })
  for (const [m, d] of [[1, 5], [1, 20], [2, 5], [2, 20], [3, 5], [3, 20], [4, 5], [4, 20], [5, 5], [5, 20], [6, 5], [6, 20], [7, 5], [7, 20], [8, 5], [8, 20]]) {
    const date = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    pay(1, date, 2000)   // 32,000 by end of August — under the base
    pay(2, date, 4000)   // 64,000 — crosses $50,700 on the 13th cheque (Jul 5)
  }

  it('recomputes each quarter at the rate, capped at the wage base per employee, with nothing booked yet (HHH today)', () => {
    const rows = computeSuiTrueUp({ paystubs: stubs, ledger: [], runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01' })
    expect(rows.map(r => r.label)).toEqual(['Q1 2026', 'Q2 2026', 'Q3 2026'])
    // Q1: 6 cheques each → (6×2000 + 6×4000) × 0.1% = 36,000 × 0.001 = 36.00
    expect(rows[0]).toMatchObject({ taxable_wages: 36000, corrected: 36, booked: 0, diff: 36 })
    // Q3: emp 1 → 8,000; emp 2 had 48,000 YTD entering Jul 5 → 2,700 of room, then 0
    expect(rows[2].taxable_wages).toBe(8000 + 2700)
    expect(rows[2].diff).toBeCloseTo(10.7, 2)
    expect(rows[2]).toMatchObject({ period_start: '2026-07-01', period_end: '2026-09-30', due_date: '2026-10-31' })
  })

  it('is a credit when the estimate was higher than the assigned rate, and only for the difference', () => {
    // Payroll ran at the 1.4% estimate all year; run rows booked 1.4% each cheque.
    const runs = [], ledger = []
    let rid = 1
    for (const s of stubs) {
      runs.push({ id: rid, pay_date: s.pay_date })
      ledger.push({ id: 100 + rid, payroll_run_id: rid, period_end: s.pay_date, amount_employer: Math.round(s.taxable_wages * 1.4) / 100 })
      rid++
    }
    const rows = computeSuiTrueUp({ paystubs: stubs, ledger, runs, ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01' })
    // Q1 at 1.4% booked 504.00; at 0.1% owes 36.00 → credit 468.00
    expect(rows[0]).toMatchObject({ booked: 504, corrected: 36, diff: -468 })
    const row = trueUpLiabilityRow({ companyId: 20, agency: 'Utah DWS', ratePct: 0.1, reason: 'rate 1.4% (estimate) → 0.1% (notice)', q: rows[0] })
    expect(row).toMatchObject({ kind: 'sui', payroll_run_id: null, amount_employee: 0, amount_employer: -468, due_date: '2026-04-30' })
    expect(row.notes).toMatch(/Credit — deduct it from your next payment/)
    expect(row.notes).toMatch(/does not amend a filed quarter/)
  })

  it('books nothing when the ledger already matches — saving the same rate twice is safe', () => {
    const first = computeSuiTrueUp({ paystubs: stubs, ledger: [], runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01' })
    const ledger = first.map((q, i) => ({ id: i, payroll_run_id: null, period_end: q.period_end, amount_employer: q.diff }))
    expect(computeSuiTrueUp({ paystubs: stubs, ledger, runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01' })).toEqual([])
  })

  it('a second correction books only the delta on top of the first true-up', () => {
    const first = computeSuiTrueUp({ paystubs: stubs, ledger: [], runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01' })
    const ledger = first.map((q, i) => ({ id: i, payroll_run_id: null, period_end: q.period_end, amount_employer: q.diff }))
    const second = computeSuiTrueUp({ paystubs: stubs, ledger, runs: [], ratePct: 0.2, wageBase: 50700, effectiveDate: '2026-01-01' })
    expect(second[0]).toMatchObject({ corrected: 72, booked: 36, diff: 36 })
  })

  it('leaves quarters before the effective date alone but still counts their wages toward the base', () => {
    const rows = computeSuiTrueUp({ paystubs: stubs, ledger: [], runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-07-01' })
    expect(rows.map(r => r.label)).toEqual(['Q3 2026'])
    expect(rows[0].taxable_wages).toBe(8000 + 2700) // emp 2's YTD from Q1–Q2 still applies
  })

  it('skips 1099 contractors when told who the W-2s are, and reads gross when taxable is missing', () => {
    const rows = computeSuiTrueUp({ paystubs: stubs, ledger: [], runs: [], ratePct: 0.1, wageBase: 50700, effectiveDate: '2026-01-01', w2EmployeeIds: [1] })
    expect(rows[0].taxable_wages).toBe(12000)
    expect(suiWagesOf({ gross_pay: 900, taxable_wages: null })).toBe(900)
    expect(suiWagesOf({ gross_pay: 900, taxable_wages: 850 })).toBe(850)
  })
})
