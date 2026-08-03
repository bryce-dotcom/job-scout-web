import { describe, it, expect } from 'vitest'
import {
  calcFICA, calcFUTA, calcStateIncomeTax, calcSUI, calcPaystubTax,
} from './payrollTax'

// ─────────────────────────────────────────────────────────────────────────
// This file computes withholding for every employee. It had NO tests.
// A silent change here mis-pays real people and misstates tax liability, and
// nobody would notice until a paycheck or a filing was wrong.
//
// These assert the statutory rates and the invariants that must always hold,
// not incidental implementation details.
// ─────────────────────────────────────────────────────────────────────────

const W2 = { w4_filing_status: 'single', state_filing_status: 'single' }
const CO = { state: 'UT', pay_frequency: 'semi-monthly' }

describe('FICA — statutory rates and caps', () => {
  it('withholds Social Security at 6.2% and Medicare at 1.45%', () => {
    const r = calcFICA({ gross: 1000, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployee).toBeCloseTo(62, 2)
    expect(r.medicareEmployee).toBeCloseTo(14.5, 2)
  })

  it('matches the employer half exactly — employer SS/Medicare mirror the employee', () => {
    const r = calcFICA({ gross: 2500, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployer).toBeCloseTo(r.socialSecurityEmployee, 2)
    expect(r.medicareEmployer).toBeCloseTo(r.medicareEmployee, 2)
  })

  it('stops Social Security at the wage base but keeps taxing Medicare', () => {
    // Already over the 2025 base ($168,600) — no more SS, Medicare continues.
    const r = calcFICA({ gross: 5000, ytdGrossBeforeThis: 168600, ytdMedicareBeforeThis: 168600 })
    expect(r.socialSecurityEmployee).toBe(0)
    expect(r.medicareEmployee).toBeCloseTo(72.5, 2) // Medicare has no cap
  })

  it('taxes only the remaining room when a cheque straddles the wage base', () => {
    const r = calcFICA({ gross: 5000, ytdGrossBeforeThis: 166600, ytdMedicareBeforeThis: 166600 })
    expect(r.socialSecurityEmployee).toBeCloseTo(2000 * 0.062, 2) // only $2,000 of room
  })

  it('adds the 0.9% additional Medicare above $200k, employee only', () => {
    const r = calcFICA({ gross: 10000, ytdGrossBeforeThis: 195000, ytdMedicareBeforeThis: 195000 })
    expect(r.additionalMedicare).toBeGreaterThan(0)
    // No employer match on the additional Medicare surtax.
    expect(r.medicareEmployer).toBeCloseTo(10000 * 0.0145, 2)
  })

  it('returns zeros for a zero-gross cheque instead of NaN', () => {
    const r = calcFICA({ gross: 0, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0 })
    expect(r.socialSecurityEmployee).toBe(0)
    expect(Number.isFinite(r.medicareEmployee)).toBe(true)
  })
})

describe('FUTA — employer only, first $7,000', () => {
  it('charges 0.6% up to the wage base', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 0 })).toBeCloseTo(6, 2)
  })

  it('stops once the employee has passed $7,000', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 7000 })).toBe(0)
  })

  it('charges only the remaining room at the boundary', () => {
    expect(calcFUTA({ gross: 1000, ytdGrossBeforeThis: 6500 })).toBeCloseTo(500 * 0.006, 2)
  })
})

describe('State income tax', () => {
  it('applies Utah\'s flat rate', () => {
    expect(calcStateIncomeTax({ gross: 1000, state: 'UT' })).toBeCloseTo(45.5, 2)
  })

  it('honours an explicit rate for another state', () => {
    expect(calcStateIncomeTax({ gross: 1000, state: 'ID', ratePct: 5 })).toBeCloseTo(50, 2)
  })
})

describe('SUI', () => {
  it('stops at the configured wage base', () => {
    expect(calcSUI({ gross: 1000, ytdGrossBeforeThis: 50000, ratePct: 1, wageBase: 48900 })).toBe(0)
  })
})

describe('calcPaystubTax — the whole-cheque contract', () => {
  const run = (over = {}) => calcPaystubTax({
    employee: W2, company: CO, gross: 2160.75, payFrequency: 'semi-monthly',
    ytd: { gross: 0, ssWages: 0, medicareWages: 0 }, ...over,
  })

  it('NET = gross - every employee tax - deductions (the invariant that pays people)', () => {
    const r = run()
    const employeeTaxes = r.federalIncomeTax + r.stateIncomeTax +
      r.socialSecurityEmployee + r.medicareEmployee + r.additionalMedicare
    const expected = r.grossPay - employeeTaxes - r.preTaxDeductions - r.postTaxDeductions
    expect(Math.abs(r.netPay - expected)).toBeLessThan(0.02)
  })

  it('never withholds more than the cheque is worth', () => {
    const r = run({ gross: 100 })
    expect(r.netPay).toBeGreaterThanOrEqual(0)
    expect(r.netPay).toBeLessThanOrEqual(r.grossPay)
  })

  it('does NOT charge the employee the employer-side taxes', () => {
    const r = run()
    // FUTA and the employer FICA halves must never reduce take-home.
    const employeeSide = r.federalIncomeTax + r.stateIncomeTax +
      r.socialSecurityEmployee + r.medicareEmployee + r.additionalMedicare
    expect(r.grossPay - employeeSide).toBeCloseTo(r.netPay, 2)
    expect(r.futa).toBeGreaterThanOrEqual(0)
  })

  it('reduces taxable wages by pre-tax deductions, but not by post-tax', () => {
    const pre = run({ preTaxDeductions: 200 })
    const post = run({ postTaxDeductions: 200 })
    expect(pre.taxableWages).toBeCloseTo(2160.75 - 200, 2)
    expect(post.taxableWages).toBeCloseTo(2160.75, 2)
    // Both still reduce take-home.
    expect(post.netPay).toBeLessThan(run().netPay)
  })

  it('totalEmployerCost is at least the gross', () => {
    const r = run()
    expect(r.totalEmployerCost).toBeGreaterThanOrEqual(r.grossPay)
  })

  it('produces finite numbers for a zero cheque', () => {
    const r = run({ gross: 0 })
    for (const [k, v] of Object.entries(r)) {
      expect(Number.isFinite(v), `${k} should be a finite number`).toBe(true)
    }
  })
})
